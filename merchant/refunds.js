const { z, id, commonSchema, optionalDate, paginationSchema, groupingSchema, getCurrency, round, number,
  monthKeys, salesLines, lineRevenue } = require('./common');

const refundSchema = {
  ...commonSchema,
  date_basis: z.enum(['refund_date', 'order_date']).default('refund_date').describe('Select refunds issued in the period, or all refunds to date for orders created in the period'),
  include_tax: z.boolean().default(true)
};

function createRefundService(ctx) {
  async function select(args, selectedOrders) {
    let memos, orderMap;
    if (args.date_basis === 'order_date') {
      const orders = selectedOrders || await ctx.orders(args);
      orderMap = new Map(orders.map(order => [Number(order.entity_id), order]));
      memos = [];
      const ids = [...orderMap.keys()];
      for (let offset = 0; offset < ids.length; offset += 100) {
        memos.push(...await ctx.all('/creditmemos', ctx.criteria({}, 'created_at', [
          ['order_id', ids.slice(offset, offset + 100).join(','), 'in'], ['state', 2]
        ])));
      }
    } else {
      memos = await ctx.all('/creditmemos', ctx.criteria(args, 'created_at', [['state', 2]]));
      orderMap = await ctx.ordersById(memos.map(memo => memo.order_id));
    }
    return memos.map(memo => ({ memo, order: orderMap.get(Number(memo.order_id)) }))
      .filter(({ order }) => ctx.matchesOrder(order, args));
  }
  const amount = (memo, includeTax) => number(memo.grand_total) - (includeTax ? 0 : number(memo.tax_amount));
  function apply(summary, rows, args) {
    const refunded = rows.reduce((sum, { memo }) => sum + amount(memo, args.include_tax), 0);
    return {
      ...summary, gross_revenue: summary.revenue, refund_amount: round(refunded), credit_memo_count: rows.length,
      revenue: round(summary.revenue - refunded), net_revenue: round(summary.revenue - refunded),
      // Cash-period refunds can belong to earlier orders. Keep basket AOV intact.
      average_order_value: summary.average_order_value,
      net_average_order_value: args.refund_date_basis === 'order_date' && summary.order_count
        ? round((summary.revenue - refunded) / summary.order_count) : null
    };
  }
  return { select, amount, apply };
}

function registerRefundTools(ctx, service) {
  ctx.register('get_credit_memos', 'List credit memos with refund items. Filter by issue date, order or state; state 2 means refunded, 1 open, 3 canceled.', {
    date_range: optionalDate, order_id: id.optional(), state: z.number().int().min(1).max(3).optional(), ...paginationSchema
  }, async args => {
    const memos = await ctx.all('/creditmemos', ctx.criteria(args, 'created_at', [['order_id', args.order_id], ['state', args.state]]));
    return { query: args, result: ctx.paged(memos, args, 'credit_memos') };
  });

  ctx.register('get_refund_report', 'Analyze actual refunds by period and product, including tax/shipping/adjustments in document totals. Choose refund_date for period activity or order_date for the original order cohort. Uses all pages and only refunded credit memos.', {
    ...refundSchema, ...paginationSchema, ...groupingSchema
  }, async args => {
    const rows = await service.select(args);
    const currency = getCurrency(rows.map(row => row.order));
    const bySku = new Map();
    let unallocated = 0;
    for (const { memo, order } of rows) {
      const counted = new Map(salesLines(order).map(line => [Number(line.item.item_id), line.item]));
      let itemAmount = 0;
      for (const item of memo.items || []) {
        const original = counted.get(Number(item.order_item_id));
        if (!original) continue;
        const sku = item.sku || original.sku;
        if (!bySku.has(sku)) bySku.set(sku, { sku, name: original.name, refunded_quantity: 0, refund_amount: 0, orders: new Set() });
        const row = bySku.get(sku);
        const value = lineRevenue(item, args.include_tax);
        row.refunded_quantity += number(item.qty);
        row.refund_amount += value;
        row.orders.add(order.entity_id);
        itemAmount += value;
      }
      unallocated += service.amount(memo, args.include_tax) - itemAmount;
    }
    const products = [...bySku.values()].map(({ orders, ...row }) => ({ ...row, refund_amount: round(row.refund_amount), order_count: orders.size }))
      .sort((a, b) => b.refund_amount - a.refund_amount || String(a.sku).localeCompare(String(b.sku)));
    function summary(entries) {
      return { credit_memo_count: entries.length, order_count: new Set(entries.map(row => row.order.entity_id)).size,
        refund_amount: round(entries.reduce((sum, { memo }) => sum + service.amount(memo, args.include_tax), 0)) };
    }
    const result = { ...summary(rows), currency, unallocated_refund_amount: round(unallocated), ...ctx.paged(products, args, 'products') };
    if (args.group_by === 'month') {
      result.periods = monthKeys(ctx.parseDateExpression(args.date_range)).map(month => ({ month,
        ...summary(rows.filter(row => (args.date_basis === 'order_date' ? row.order.created_at : row.memo.created_at).slice(0, 7) === month))
      }));
    }
    return { query: args, calculation: 'Only state=2 credit memos. Products count valued order lines once. Unallocated amount includes shipping, adjustments and any refund lines that cannot be matched. Order-date reports include refunds issued later than the selected order period; they are a current cohort snapshot, not a historical snapshot. No refund rate is inferred from mismatched sales/refund periods.', result };
  });
}

module.exports = { createRefundService, registerRefundTools };

const { z, skus, paginationSchema, commonSchema, nonCanceledStatus, number, round, salesLines, mapLimit, anyFilter } = require('./common');

const inventorySchema = {
  stock_id: z.number().int().positive().default(1).describe('MSI stock ID; choose the stock assigned to the website being analyzed'),
  inventory_mode: z.enum(['msi', 'legacy']).default('msi').describe('Use legacy only for stores without MSI; legacy availability is not reservation-aware'),
  include_sources: z.boolean().default(true).describe('Include physical source quantities for the selected MSI stock')
};

function registerInventoryTools(ctx) {
  async function products(args) {
    const criteria = ctx.criteria({}, 'created_at', args.include_disabled ? [] : [['status', 1]]);
    if (!args.skus) return ctx.all('/products', criteria);
    return ctx.all('/products', `${criteria}&${anyFilter(2, 'sku', [...new Set(args.skus)])}`);
  }
  async function inventory(args, catalog) {
    if (args.inventory_mode === 'legacy' && args.stock_id !== 1) throw new Error('Legacy inventory only supports stock_id=1');
    const bySku = new Map(catalog.map(product => [product.sku, product]));
    const wanted = args.skus ? [...new Set(args.skus)] : [...bySku.keys()];
    let sources = [];
    if (args.inventory_mode === 'msi' && args.include_sources && wanted.length) {
      const links = await ctx.all('/inventory/stock-source-links', ctx.criteria({}, 'created_at', [['stock_id', args.stock_id]], 'source_code'));
      const allowed = new Set(links.map(link => link.source_code));
      for (let offset = 0; offset < wanted.length; offset += 100) {
        sources.push(...(await ctx.all('/inventory/source-items', `${anyFilter(0, 'sku', wanted.slice(offset, offset + 100))}&searchCriteria[sortOrders][0][field]=source_code&searchCriteria[sortOrders][0][direction]=ASC&searchCriteria[sortOrders][1][field]=sku&searchCriteria[sortOrders][1][direction]=ASC`))
          .filter(source => allowed.has(source.source_code)));
      }
    }
    return mapLimit(wanted, async sku => {
      const product = bySku.get(sku);
      const base = { sku, name: product?.name || null, product_type: product?.type_id || null, stock_id: args.stock_id };
      if (!product) return { ...base, salable_quantity: null, is_salable: null, unavailable_reason: 'Product not found in selected catalog' };
      if (!['simple', 'virtual', 'downloadable'].includes(product.type_id)) {
        return { ...base, salable_quantity: null, is_salable: null, unavailable_reason: 'Composite product: analyze the individual variant/component SKUs' };
      }
      if (args.inventory_mode === 'legacy') {
        const stock = await ctx.api(`/stockItems/${encodeURIComponent(sku)}`);
        return { ...base, quantity: number(stock.qty), salable_quantity: null, is_salable: Boolean(stock.is_in_stock),
          availability_quantity: number(stock.qty), quantity_basis: 'Legacy physical qty, without MSI reservations or inherited stock settings' };
      }
      const [value, salable] = await Promise.all([
        ctx.api(`/inventory/get-product-salable-quantity/${encodeURIComponent(sku)}/${args.stock_id}`),
        ctx.api(`/inventory/is-product-salable/${encodeURIComponent(sku)}/${args.stock_id}`)
      ]);
      if (typeof value !== 'number' || !Number.isFinite(value) || typeof salable !== 'boolean') throw new Error(`Invalid inventory response for ${sku}`);
      return { ...base, salable_quantity: Number(value), availability_quantity: Number(value), is_salable: salable,
        ...(args.include_sources ? { sources: sources.filter(source => source.sku === sku).map(source => ({ source_code: source.source_code, quantity: number(source.quantity), status: source.status })) } : {}) };
    });
  }
  ctx.register('get_inventory', 'Get reservation-aware salable quantities and physical source quantities for multiple SKUs in a selected MSI stock. Composite and unknown SKUs are explicitly reported, not treated as zero stock.', {
    skus, ...inventorySchema
  }, async args => ({ query: args, result: { products: await inventory(args, await products({ ...args, include_disabled: true })) } }));

  const reportSchema = {
    skus: skus.optional().describe('Optional SKU subset; omitted scans all catalog products'), ...inventorySchema, ...paginationSchema,
    include_disabled: z.boolean().default(false)
  };
  ctx.register('get_low_stock_products', 'Find products whose available quantity is at or below threshold. Scans the complete selected catalog before pagination, so products outside the sales top ten are included.', {
    ...reportSchema, threshold: z.number().nonnegative().default(5).describe('Explicit low-stock quantity threshold; does not infer inherited Magento notification settings')
  }, async args => {
    const rows = await inventory(args, await products(args));
    const matching = rows.filter(row => row.availability_quantity !== undefined && row.availability_quantity <= args.threshold)
      .sort((a, b) => a.availability_quantity - b.availability_quantity || a.sku.localeCompare(b.sku));
    return { query: args, result: { ...ctx.paged(matching, args, 'products'), scanned_products: rows.length,
      unavailable_products: rows.filter(row => row.unavailable_reason) } };
  });

  ctx.register('get_inventory_risk', 'Combine current availability with all product sales in a lookback period. Estimate days of stock, identify stockouts, products at risk and stock with no sales. Estimates assume unchanged demand; no purchase orders or lead times are inferred.', {
    ...reportSchema, date_range: commonSchema.date_range.default('last 30 days'), store_id: commonSchema.store_id,
    status: nonCanceledStatus, risk_days: z.number().positive().default(14),
    risk: z.enum(['all', 'out_of_stock', 'at_risk', 'no_sales', 'healthy']).default('all')
  }, async args => {
    const range = ctx.parseDateExpression(args.date_range);
    const end = Math.min(Date.now(), range.endDate.getTime());
    if (range.startDate.getTime() > end) throw new Error('Inventory risk requires a past or current sales period');
    const days = Math.max(1, (end - range.startDate.getTime() + 1) / 86400000);
    const orders = (await ctx.orders(args)).filter(order => args.status !== undefined || (order.state !== 'canceled' && order.status !== 'canceled'));
    const sold = new Map();
    for (const { item } of orders.flatMap(salesLines)) {
      const value = Math.max(0, number(item.qty_ordered) - number(item.qty_canceled) - number(item.qty_refunded));
      sold.set(item.sku, (sold.get(item.sku) || 0) + value);
    }
    const inventoryRows = await inventory(args, await products(args));
    const rows = inventoryRows.filter(row => !row.unavailable_reason).map(row => {
      const soldQuantity = sold.get(row.sku) || 0;
      const daily = soldQuantity / days;
      const stockDays = daily > 0 ? Math.max(0, row.availability_quantity) / daily : null;
      const risk = row.availability_quantity <= 0 || !row.is_salable ? 'out_of_stock' : !soldQuantity ? 'no_sales' : stockDays <= args.risk_days ? 'at_risk' : 'healthy';
      return { ...row, quantity_sold: soldQuantity, average_daily_quantity: Number(daily.toFixed(4)), days_of_stock: stockDays === null ? null : round(stockDays), risk };
    });
    const ranks = { out_of_stock: 0, at_risk: 1, no_sales: 2, healthy: 3 };
    rows.sort((a, b) => ranks[a.risk] - ranks[b.risk] || (a.days_of_stock ?? Infinity) - (b.days_of_stock ?? Infinity) || a.sku.localeCompare(b.sku));
    const counts = Object.fromEntries(Object.keys(ranks).map(risk => [risk, rows.filter(row => row.risk === risk).length]));
    return { query: args, calculation: 'Current stock / average daily net ordered units over the selected period. Canceled and refunded quantities are subtracted using their current values. Canceled orders excluded unless status is explicit. No-sales means no net sales in this window, not proven obsolete stock. Select a store_id matching stock_id; missing stock history and stockout periods can affect the estimate.',
      result: { ...ctx.paged(rows.filter(row => args.risk === 'all' || row.risk === args.risk), args, 'products'),
        lookback_days: round(days), summary: counts, unavailable_products: inventoryRows.filter(row => row.unavailable_reason) } };
  });
}

module.exports = { registerInventoryTools };

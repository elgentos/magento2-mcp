const { z, id, optionalDate, nonCanceledStatus, asOf, commonSchema, paginationSchema, number, round, pick, timestamp, parseTimestamp, mapLimit, getCurrency } = require('./common');

function registerCartCustomerTools(ctx) {
  async function cartDetails(cart) {
    const active = cart.is_active === true || Number(cart.is_active) === 1;
    const totals = active ? await ctx.api(`/carts/${cart.id}/totals`) : null;
    return {
      ...pick(cart, ['id', 'created_at', 'updated_at', 'is_active', 'is_virtual', 'items_count', 'items_qty', 'store_id', 'customer_is_guest']),
      customer: { ...pick(cart.customer, ['id', 'email', 'firstname', 'lastname', 'group_id']),
        email: cart.customer?.email || cart.billing_address?.email || null },
      currency: totals?.quote_currency_code || cart.currency?.quote_currency_code || null,
      totals: totals ? pick(totals, ['grand_total', 'subtotal', 'subtotal_with_discount', 'discount_amount', 'tax_amount', 'shipping_amount', 'shipping_tax_amount', 'coupon_code', 'total_segments']) : null,
      ...(!active ? { totals_unavailable_reason: 'Magento only provides calculated totals for active carts; inspect the resulting order for converted carts.' } : {}),
      items: (cart.items || []).map(item => pick(item, ['item_id', 'sku', 'name', 'qty', 'price', 'product_type', 'product_option']))
    };
  }
  ctx.register('get_cart', 'Get a shopping cart and its products by internal quote ID. Reads calculated totals for active carts; inactive carts have totals=null because Magento only provides totals for active carts.', { cart_id: id }, async ({ cart_id }) => {
    return { result: await cartDetails(await ctx.api(`/carts/${cart_id}`)) };
  });
  ctx.register('get_abandoned_carts', 'Find active nonempty carts whose last update is at least inactive_hours ago. Paginated results include products, totals and guest/registered customer context. Active carts are not classified as abandoned until the inactivity threshold is met.', {
    date_range: optionalDate.describe('Optional range for last cart update'), inactive_hours: z.number().min(1).default(24), as_of: asOf,
    min_total: z.number().nonnegative().optional(), currency: commonSchema.currency,
    store_id: commonSchema.store_id, ...paginationSchema
  }, async args => {
    const now = args.as_of ? new Date(args.as_of) : new Date();
    const cutoff = new Date(now.getTime() - args.inactive_hours * 3600000);
    const carts = await ctx.all('/carts/search', ctx.criteria(args, 'updated_at', [
      ['is_active', 1], ['items_count', 0, 'gt'], ['updated_at', timestamp(cutoff), 'lteq'], ['store_id', args.store_id]
    ]));
    const detailed = await mapLimit(carts, cartDetails);
    const matching = detailed.filter(cart => (args.min_total === undefined || number(cart.totals.grand_total) >= args.min_total) &&
      (args.currency === undefined || cart.currency === args.currency));
    matching.sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id - b.id);
    const currencies = new Map();
    for (const cart of matching) {
      const key = cart.currency;
      currencies.set(key, (currencies.get(key) || 0) + number(cart.totals.grand_total));
      cart.inactive_hours = round((now - parseTimestamp(cart.updated_at)) / 3600000);
    }
    return { query: { ...args, as_of: now.toISOString(), last_activity_before: cutoff.toISOString() },
      calculation: 'Active nonempty carts with no updates for the specified interval. Values are current calculated cart totals, not historical prices or guaranteed lost revenue. Guest contact data may be unavailable before checkout.',
      result: { ...ctx.paged(matching, args, 'carts'), totals_by_currency: [...currencies].map(([currency, value]) => ({ currency, cart_value: round(value) })) } };
  });

  ctx.register('get_customers', 'Search registered customer accounts by email, name, group, website or registration period. Includes addresses and custom attributes; guests are analyzed through order history.', {
    email: z.string().email().optional(), name: z.string().min(1).optional(), group_id: z.number().int().nonnegative().optional(),
    website_id: id.optional(), date_range: optionalDate, ...paginationSchema
  }, async args => {
    let customers = await ctx.all('/customers/search', ctx.criteria(args, 'created_at', [
      ['email', args.email], ['group_id', args.group_id], ['website_id', args.website_id]
    ]));
    if (args.name) customers = customers.filter(customer => `${customer.firstname} ${customer.lastname}`.toLowerCase().includes(args.name.toLowerCase()));
    return { query: args, result: ctx.paged(customers, args, 'customers') };
  });
  ctx.register('get_customer', 'Get a registered customer profile and addresses by ID or exact email. Use website_id to disambiguate an email used on multiple websites.', {
    customer_id: id.optional(), email: z.string().email().optional(), website_id: id.optional()
  }, async args => {
    if ((args.customer_id !== undefined) === (args.email !== undefined)) throw new Error('Specify exactly one of customer_id or email');
    if (args.customer_id) return { result: await ctx.api(`/customers/${args.customer_id}`) };
    const customers = await ctx.all('/customers/search', ctx.criteria({}, 'created_at', [['email', args.email], ['website_id', args.website_id]]));
    if (customers.length !== 1) throw new Error(customers.length ? 'Email matches multiple customers; specify website_id or customer_id' : 'Customer not found');
    return { result: customers[0] };
  });
  ctx.register('get_customer_groups', 'List customer group IDs and names for B2B pricing, customer segmentation and promotion filters.', paginationSchema,
    async args => ({ result: ctx.paged(await ctx.all('/customerGroups/search', ctx.criteria({}, 'created_at', [], 'customer_group_id')), args, 'customer_groups') }));

  ctx.register('get_customer_analytics', 'Analyze buyers: top customers, new versus returning buyers, lifetime spend within scope and customers inactive for N days. Reads earlier orders to distinguish repeat buyers correctly; includes guests grouped by email within website.', {
    ...commonSchema, ...paginationSchema, status: nonCanceledStatus,
    inactive_days: z.number().int().min(1).default(90),
    segment: z.enum(['all', 'new', 'returning', 'inactive']).default('all')
  }, async args => {
    const range = ctx.parseDateExpression(args.date_range);
    const end = new Date(Math.min(Date.now(), range.endDate.getTime()));
    const start = range.startDate;
    if (start > end) throw new Error('Customer analytics requires a period starting before now');
    const historyCriteria = `${ctx.orderCriteria({ ...args, date_range: undefined })}&${require('./common').filter(10, 'created_at', timestamp(end), 'lteq')}`;
    const history = (await ctx.all('/orders', historyCriteria)).filter(order => ctx.matchesOrder(order, args) &&
      (args.status !== undefined || (order.state !== 'canceled' && order.status !== 'canceled')));
    const currency = getCurrency(history);
    const stores = await ctx.api('/store/storeViews');
    const websites = new Map(stores.map(store => [Number(store.id), store.website_id]));
    const customers = new Map();
    for (const order of history) {
      const email = order.customer_email?.trim().toLowerCase();
      const website = websites.get(Number(order.store_id)) ?? `store-${order.store_id}`;
      const key = order.customer_id ? `customer:${order.customer_id}` : email ? `guest:${website}:${email}` : `anonymous-order:${order.entity_id}`;
      if (!customers.has(key)) customers.set(key, { customer_key: key, customer_id: order.customer_id || null, email: email || null,
        is_guest: !order.customer_id, first_order_at: order.created_at, last_order_at: order.created_at,
        lifetime_order_count: 0, lifetime_revenue: 0, order_count: 0, revenue: 0 });
      const customer = customers.get(key);
      customer.first_order_at = customer.first_order_at < order.created_at ? customer.first_order_at : order.created_at;
      customer.last_order_at = customer.last_order_at > order.created_at ? customer.last_order_at : order.created_at;
      customer.lifetime_order_count++;
      customer.lifetime_revenue += number(order.grand_total);
      if (parseTimestamp(order.created_at) >= start) {
        customer.order_count++;
        customer.revenue += number(order.grand_total);
      }
    }
    const rows = [...customers.values()].map(customer => {
      const days = Math.floor((end - parseTimestamp(customer.last_order_at)) / 86400000);
      return { ...customer, revenue: round(customer.revenue), lifetime_revenue: round(customer.lifetime_revenue),
        average_order_value: customer.order_count ? round(customer.revenue / customer.order_count) : 0,
        days_since_last_order: days, inactive: days >= args.inactive_days,
        buyer_type: parseTimestamp(customer.first_order_at) >= start ? 'new' : 'returning' };
    });
    const buyers = rows.filter(row => row.order_count > 0);
    const matching = rows.filter(row => args.segment === 'inactive' ? row.inactive :
      row.order_count > 0 && (args.segment === 'all' || row.buyer_type === args.segment));
    matching.sort((a, b) => b.revenue - a.revenue || b.lifetime_revenue - a.lifetime_revenue || a.customer_key.localeCompare(b.customer_key));
    return { query: { ...args, as_of: end.toISOString() },
      calculation: 'Revenue is order grand totals including tax/shipping, before refunds. Canceled orders excluded unless status is explicit. New means first noncanceled order in the selected store/country/currency scope. Earlier history is read through period end. Guest emails are grouped within website, separately from registered accounts; missing guest emails remain separate. Lifetime means recorded orders within the same scope through as_of; inactivity is not proof of churn.',
      result: { ...ctx.paged(matching, args, 'customers'), currency, summary: {
        buyers: buyers.length, new_buyers: buyers.filter(row => row.buyer_type === 'new').length,
        returning_buyers: buyers.filter(row => row.buyer_type === 'returning').length,
        inactive_buyers: rows.filter(row => row.inactive).length,
        order_count: buyers.reduce((sum, row) => sum + row.order_count, 0),
        revenue: round(buyers.reduce((sum, row) => sum + row.revenue, 0))
      } } };
  });
}

module.exports = { registerCartCustomerTools };

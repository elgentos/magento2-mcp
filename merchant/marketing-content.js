const { z, id, skus, commonSchema, nonCanceledStatus, paginationSchema, optionalDate, number, round, getCurrency, revenueSummary } = require('./common');

function registerMarketingContentTools(ctx) {
  ctx.register('get_sales_rules', 'Get cart price rules and their conditions, actions, schedules, customer groups and website scope. Read a rule by ID or search all rules.', {
    rule_id: id().optional(), name: z.string().optional(), is_active: z.boolean().optional(), website_id: id().optional(),
    customer_group_id: z.number().int().nonnegative().optional(), ...paginationSchema
  }, async args => {
    let rules = args.rule_id ? [await ctx.api(`/salesRules/${args.rule_id}`)] : await ctx.all('/salesRules/search', ctx.criteria({}, 'created_at', [
      ['name', args.name === undefined ? undefined : `%${args.name}%`, 'like'], ['is_active', args.is_active === undefined ? undefined : Number(args.is_active)]
    ], 'rule_id'));
    rules = rules.filter(rule => (args.website_id === undefined || (rule.website_ids || []).map(Number).includes(args.website_id)) &&
      (args.customer_group_id === undefined || (rule.customer_group_ids || []).map(Number).includes(args.customer_group_id)));
    return { query: args, result: ctx.paged(rules, args, 'rules') };
  });
  ctx.register('get_coupons', 'List coupon codes with rule, usage counts, limits and expiry. Read-only; deleted historical codes can still appear in order-based performance reports.', {
    rule_id: id().optional(), code: z.string().min(1).optional(), date_range: optionalDate, ...paginationSchema
  }, async args => ({ query: args, result: ctx.paged(await ctx.all('/coupons/search', ctx.criteria(args, 'created_at', [
    ['rule_id', args.rule_id], ['code', args.code]
  ], 'coupon_id')), args, 'coupons') }));

  ctx.register('get_coupon_performance', 'Measure orders, revenue, average order value and discounts associated with each coupon, including deleted codes. Also compare orders with and without coupons. Association is not incremental uplift.', {
    ...commonSchema, ...paginationSchema, status: nonCanceledStatus, coupon_code: z.string().min(1).optional()
  }, async args => {
    const orders = (await ctx.orders(args)).filter(order => args.status !== undefined || (order.state !== 'canceled' && order.status !== 'canceled'));
    const currency = getCurrency(orders);
    const groups = new Map();
    for (const order of orders) {
      if (!order.coupon_code || (args.coupon_code && order.coupon_code !== args.coupon_code)) continue;
      if (!groups.has(order.coupon_code)) groups.set(order.coupon_code, []);
      groups.get(order.coupon_code).push(order);
    }
    function metrics(entries) {
      return { ...revenueSummary(entries, true), currency,
        discount_amount: round(entries.reduce((sum, order) => sum + Math.abs(number(order.discount_amount)), 0)),
        unique_buyers: new Set(entries.map(order => order.customer_id ? `id:${order.customer_id}` : `guest:${order.store_id}:${order.customer_email || order.entity_id}`)).size };
    }
    const coupons = [...groups].map(([coupon_code, entries]) => ({ coupon_code, ...metrics(entries) }))
      .sort((a, b) => b.revenue - a.revenue || a.coupon_code.localeCompare(b.coupon_code));
    return { query: args, calculation: 'Order grand totals including tax/shipping, before refunds. Canceled orders excluded unless status is explicit. Discount is the entire discount on orders using the code and may include other promotions. Comparison cohorts cover all matching orders even when coupon_code restricts the coupon table. These are associations, not proof of additional revenue caused by the promotion.',
      result: { ...ctx.paged(coupons, args, 'coupons'), currency, comparison: {
        with_coupon: metrics(orders.filter(order => order.coupon_code)), without_coupon: metrics(orders.filter(order => !order.coupon_code))
      } } };
  });

  ctx.register('get_product_tier_prices', 'Read configured tier price rules for multiple SKUs, including customer group, website, minimum quantity and fixed/percentage price type. These are configured rules, not a tax/shipping-inclusive checkout quote. Amounts are in the base currency reported as currency.', {
    skus, website_id: z.number().int().nonnegative().optional(), customer_group: z.string().optional()
  }, async args => {
    const data = await ctx.api('/products/tier-prices-information', 'POST', { skus: [...new Set(args.skus)] });
    if (!Array.isArray(data)) throw new Error('Invalid tier price response');
    return { query: args, result: { ...await ctx.baseCurrency({ website_id: args.website_id }), tier_prices: data.filter(row =>
      (args.website_id === undefined || Number(row.website_id) === 0 || Number(row.website_id) === args.website_id) &&
      (args.customer_group === undefined || row.customer_group === args.customer_group || row.customer_group === 'ALL GROUPS')) } };
  });
  ctx.register('get_product_prices', 'Get current indexed catalog prices for SKUs in a store and customer group, including applicable tier pricing for a quantity. Requires the bundled merchant module; prices are in website base currency with catalog tax semantics, not an address-specific checkout quote.', {
    skus, store_id: id(), customer_group_id: z.number().int().nonnegative().default(0), quantity: z.number().positive().default(1)
  }, async args => {
    const data = await ctx.extension('prices', {
      skus: args.skus, storeId: args.store_id, customerGroupId: args.customer_group_id, quantity: args.quantity
    });
    // Magento omits nullable DTO fields; make unavailable unit prices explicit to the MCP client.
    return { query: args, result: { ...data, items: data.items.map(item => ({ ...item, unit_price: item.unit_price ?? null })) } };
  });

  const cmsSchema = { title: z.string().optional(), identifier: z.string().optional(), is_active: z.boolean().optional(), ...paginationSchema };
  async function cmsList(endpoint, args) {
    return ctx.all(endpoint, ctx.criteria({}, 'created_at', [
      ['title', args.title === undefined ? undefined : `%${args.title}%`, 'like'], ['identifier', args.identifier],
      ['is_active', args.is_active === undefined ? undefined : Number(args.is_active)]
    ], endpoint.includes('cmsPage') ? 'page_id' : 'block_id'));
  }
  ctx.register('search_cms_pages', 'Search CMS pages by title, URL identifier or active status. Returns content and SEO metadata for content audits.', cmsSchema,
    async args => ({ query: args, result: ctx.paged(await cmsList('/cmsPage/search', args), args, 'pages') }));
  ctx.register('get_cms_page', 'Get full CMS page content and metadata by numeric ID or exact URL identifier.', {
    page_id: id().optional(), identifier: z.string().min(1).optional()
  }, async args => {
    if ((args.page_id !== undefined) === (args.identifier !== undefined)) throw new Error('Specify exactly one of page_id or identifier');
    if (args.page_id) return { result: await ctx.api(`/cmsPage/${args.page_id}`) };
    const pages = await cmsList('/cmsPage/search', args);
    if (pages.length !== 1) throw new Error(pages.length ? 'Identifier is ambiguous across stores; use page_id' : 'CMS page not found');
    return { result: pages[0] };
  });
  ctx.register('get_cms_blocks', 'Read CMS content blocks, searching by title, identifier or active status.', cmsSchema,
    async args => ({ query: args, result: ctx.paged(await cmsList('/cmsBlock/search', args), args, 'blocks') }));
  const cmsChanges = z.object({
    title: z.string().min(1).optional(), content: z.string().optional(), content_heading: z.string().optional(),
    meta_title: z.string().optional(), meta_keywords: z.string().optional(), meta_description: z.string().optional(),
    is_active: z.boolean().optional()
  }).strict().refine(value => Object.keys(value).length > 0, 'Provide at least one field to change');
  ctx.register('update_cms_page', 'Update only the specified CMS content/SEO fields on an existing page. Reads the existing page first and preserves its identifier, layout and other fields. Optional expected_update_time prevents overwriting a known newer revision.', {
    page_id: id(), changes: cmsChanges, expected_update_time: z.string().optional()
  }, async args => {
    const existing = await ctx.api(`/cmsPage/${args.page_id}`);
    if (args.expected_update_time !== undefined && existing.update_time !== args.expected_update_time) throw new Error('CMS page changed since it was read; reload it before updating');
    const updated = await ctx.api(`/cmsPage/${args.page_id}`, 'PUT', { page: { ...existing, ...args.changes, id: args.page_id } });
    return { result: updated, changed_fields: Object.keys(args.changes) };
  });

  ctx.register('get_search_terms', 'Read actual storefront search queries, popularity and result counts. Supports searches returning no results. Requires the bundled merchant module. Popularity is stored cumulative data, not a date-range conversion report.', {
    ...paginationSchema, store_id: z.number().int().nonnegative().default(0).describe('0 = all stores'), query: z.string().optional(),
    zero_results_only: z.boolean().default(false), min_popularity: z.number().int().nonnegative().default(0)
  }, async args => {
    const data = await ctx.extension('search-terms', { storeId: args.store_id, pageSize: args.page_size, currentPage: args.current_page,
      query: args.query, zeroResultsOnly: args.zero_results_only ? 1 : 0, minPopularity: args.min_popularity });
    return { query: args, result: { ...require('./common').pagination(data.total_count, args), search_terms: data.items } };
  });
  ctx.register('get_product_reviews', 'Read actual product reviews by SKU, including approved/pending/rejected status and rating votes. Requires the bundled merchant module; no unsupported standard review REST routes are assumed.', {
    sku: z.string().min(1), store_id: z.number().int().nonnegative().default(0), ...paginationSchema,
    status: z.enum(['all', 'approved', 'pending', 'not_approved']).default('all')
  }, async args => {
    const data = await ctx.extension('reviews', { sku: args.sku, storeId: args.store_id, status: args.status, pageSize: args.page_size, currentPage: args.current_page });
    return { query: args, result: { ...require('./common').pagination(data.total_count, args), reviews: data.items } };
  });
}

module.exports = { registerMarketingContentTools };

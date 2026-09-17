const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const period = '2026-08-01 to 2026-08-31';
const line = (id, sku, qty, amount, extra = {}) => ({ item_id: id, product_id: sku === 'A' ? 100 : 101, product_type: 'simple', sku, name: sku,
  qty_ordered: qty, row_total: amount, tax_amount: amount / 5, discount_amount: 0, ...extra });
const order = (id, date, amount, extra = {}) => ({ entity_id: id, increment_id: `00000${id}`, created_at: `${date} 10:00:00`,
  status: 'complete', state: 'complete', store_id: 1, order_currency_code: 'EUR', customer_id: 11, customer_email: 'buyer@example.com',
  grand_total: amount, tax_amount: amount / 6, billing_address: { country_id: 'NL' }, items: [line(id * 10, 'A', 2, amount * 5 / 6)], ...extra });

test('merchant tools through the actual MCP server', async t => {
  let data, calls, failPath;
  function reset() {
    calls = [];
    failPath = null;
    data = {
      orders: [order(1, '2026-07-01', 120), order(2, '2026-08-10', 120, { coupon_code: 'SAVE', discount_amount: -10,
        items: [line(20, 'A', 2, 110, { discount_amount: 10, tax_amount: 20, qty_refunded: 0.5 })],
        payment: { method: 'ideal', amount_paid: 120, additional_information: ['private-token'] }, status_histories: [{ comment: 'Dispatched' }] }),
      order(3, '2026-08-15', 60, { customer_id: null, customer_email: 'guest@example.com', items: [line(30, 'B', 1, 50)] })],
      creditmemos: [
        { entity_id: 201, order_id: 1, state: 2, created_at: '2026-08-20 12:00:00', grand_total: 24, tax_amount: 4,
          items: [{ order_item_id: 10, sku: 'A', qty: 2, row_total: 20, tax_amount: 4 }] },
        { entity_id: 202, order_id: 2, state: 2, created_at: '2026-09-02 12:00:00', grand_total: 12, tax_amount: 2,
          items: [{ order_item_id: 20, sku: 'A', qty: 0.5, row_total: 10, tax_amount: 2 }] },
        { entity_id: 203, order_id: 2, state: 3, created_at: '2026-08-20 12:00:00', grand_total: 999, tax_amount: 0, items: [] },
        { entity_id: 204, order_id: 2, state: 1, created_at: '2026-08-20 12:00:00', grand_total: 999, tax_amount: 0, items: [] }
      ],
      invoices: [{ entity_id: 301, order_id: 2, state: 2, created_at: '2026-08-11 10:00:00', grand_total: 120, items: [] }],
      shipments: [{ entity_id: 401, order_id: 2, created_at: '2026-08-12 10:00:00', items: [], tracks: [{ carrier_code: 'postnl', track_number: 'TRACK123' }] }],
      customers: [{ id: 11, email: 'buyer@example.com', firstname: 'Test', lastname: 'Buyer', group_id: 2, website_id: 1, addresses: [{ city: 'Utrecht' }], created_at: '2025-01-01 10:00:00' }],
      groups: [{ id: 0, code: 'NOT LOGGED IN' }, { id: 2, code: 'Wholesale' }],
      carts: [
        { id: 901, is_active: 1, items_count: 1, store_id: 1, updated_at: '2026-08-20 10:00:00', grand_total: 999,
          customer: { id: 11, email: 'buyer@example.com' }, items: [{ sku: 'A', qty: 2 }] },
        { id: 902, is_active: 1, items_count: 0, store_id: 1, updated_at: '2026-08-20 10:00:00', items: [] },
        { id: 903, is_active: 1, items_count: 1, store_id: 1, updated_at: '2026-08-31 23:00:00', items: [{ sku: 'B', qty: 1 }] },
        { id: 904, is_active: 0, items_count: 1, store_id: 1, updated_at: '2026-08-20 10:00:00', items: [{ sku: 'B', qty: 1 }] },
        { id: 905, is_active: 1, items_count: 1, store_id: 1, updated_at: '2026-08-15 10:00:00', items: [{ sku: 'B', qty: 1 }] }
      ],
      cartTotals: { 901: { grand_total: 151, quote_currency_code: 'EUR', subtotal: 120 }, 903: { grand_total: 60, quote_currency_code: 'EUR' }, 905: { grand_total: 50, quote_currency_code: 'USD' } },
      products: [
        { id: 100, sku: 'A', name: 'Product A', type_id: 'simple', status: 1 },
        { id: 101, sku: 'B', name: 'Product B', type_id: 'simple', status: 1 },
        { id: 102, sku: 'C', name: 'Configurable', type_id: 'configurable', status: 1 },
        { id: 103, sku: 'D', name: 'No sales', type_id: 'simple', status: 1 }
      ],
      availability: { A: 3, B: 0, D: 100 },
      sourceLinks: [{ stock_id: 1, source_code: 'warehouse' }],
      sources: [{ sku: 'A', source_code: 'warehouse', quantity: 10, status: 1 }, { sku: 'A', source_code: 'elsewhere', quantity: 500, status: 1 }],
      rules: [{ rule_id: 10, name: 'Summer', is_active: true, website_ids: [1], customer_group_ids: [2], condition: { type: 'combine' } }],
      coupons: [{ coupon_id: 15, rule_id: 10, code: 'SAVE', times_used: 8 }],
      tiers: [{ sku: 'A', website_id: 0, customer_group: 'ALL GROUPS', quantity: 10, price: 8, price_type: 'fixed' },
        { sku: 'A', website_id: 2, customer_group: 'Wholesale', quantity: 10, price: 7, price_type: 'fixed' }],
      cmsPages: [{ id: 5, identifier: 'shipping', title: 'Shipping', content: 'Old text', is_active: true,
        page_layout: '1column', update_time: '2026-08-01 12:00:00', meta_title: 'Shipping details', custom_theme: 'theme-7' }],
      cmsBlocks: [{ id: 6, identifier: 'footer', title: 'Footer', content: 'Contact', is_active: true }]
    };
  }
  reset();
  function search(rows, params) {
    const groups = new Map();
    for (const [key, field] of params) {
      const match = key.match(/^searchCriteria\[filter_groups\]\[(\d+)\]\[filters\]\[(\d+)\]\[field\]$/);
      if (!match) continue;
      const prefix = key.slice(0, -7);
      if (!groups.has(match[1])) groups.set(match[1], []);
      groups.get(match[1]).push({ field, value: params.get(`${prefix}[value]`), condition: params.get(`${prefix}[condition_type]`) });
    }
    const matches = (row, { field, value, condition }) => {
      const raw = field === 'entity_id' ? row.entity_id ?? row.id : row[field];
      const actual = typeof raw === 'boolean' ? String(Number(raw)) : String(raw);
      if (condition === 'in') return value.split(',').includes(actual);
      if (condition === 'like') return actual.toLowerCase().includes(value.replaceAll('%', '').toLowerCase());
      if (condition === 'gteq') return typeof raw === 'number' ? raw >= Number(value) : actual >= value;
      if (condition === 'lteq') return typeof raw === 'number' ? raw <= Number(value) : actual <= value;
      if (condition === 'gt') return Number(raw) > Number(value);
      if (condition === 'neq') return actual !== value;
      return actual === value;
    };
    const filtered = rows.filter(row => [...groups.values()].every(group => group.some(filter => matches(row, filter))));
    const size = Number(params.get('searchCriteria[pageSize]') || 100);
    const page = Number(params.get('searchCriteria[currentPage]') || 1);
    return { total_count: filtered.length, items: filtered.slice((page - 1) * size, page * size) };
  }
  const api = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const endpoint = url.pathname.replace('/rest/V1', '');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ endpoint, params: url.searchParams, method: req.method, body });
    function send(value, status = 200) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }
    if (failPath && endpoint.startsWith(failPath.path)) return send({ message: 'Mock error' }, failPath.status);
    const lists = { '/orders': 'orders', '/creditmemos': 'creditmemos', '/invoices': 'invoices', '/shipments': 'shipments',
      '/customers/search': 'customers', '/customerGroups/search': 'groups', '/carts/search': 'carts', '/products': 'products',
      '/inventory/stock-source-links': 'sourceLinks', '/inventory/source-items': 'sources', '/salesRules/search': 'rules',
      '/coupons/search': 'coupons', '/cmsPage/search': 'cmsPages', '/cmsBlock/search': 'cmsBlocks' };
    if (lists[endpoint]) return send(search(data[lists[endpoint]], url.searchParams));
    let match = endpoint.match(/^\/(orders|customers|carts|salesRules|cmsPage)\/(\d+)$/);
    if (match) {
      const collection = { orders: 'orders', customers: 'customers', carts: 'carts', salesRules: 'rules', cmsPage: 'cmsPages' }[match[1]];
      const record = data[collection].find(row => Number(row.entity_id ?? row.rule_id ?? row.id) === Number(match[2]));
      if (!record) return send({ message: 'Not found' }, 404);
      if (req.method === 'PUT' && match[1] === 'cmsPage') {
        Object.assign(record, body.page);
        return send(record);
      }
      return send(record);
    }
    match = endpoint.match(/^\/carts\/(\d+)\/totals$/);
    if (match) return send(data.cartTotals[match[1]]);
    if (endpoint === '/store/storeViews') return send([{ id: 1, website_id: 1 }, { id: 2, website_id: 1 }, { id: 3, website_id: 2 }]);
    match = endpoint.match(/^\/inventory\/(get-product-salable-quantity|is-product-salable)\/(.+)\/1$/);
    if (match) {
      const quantity = data.availability[decodeURIComponent(match[2])];
      return send(match[1] === 'is-product-salable' ? quantity > 0 : quantity);
    }
    if (endpoint.startsWith('/stockItems/')) return send({ qty: 12, is_in_stock: true });
    if (endpoint === '/products/tier-prices-information' && req.method === 'POST') return send(data.tiers.filter(row => body.skus.includes(row.sku)));
    if (endpoint === '/mcp-merchant/search-terms') return send({ total_count: 1, items: [{ id: 1, query: 'purple panels', popularity: 25, num_results: 0 }] });
    if (endpoint === '/mcp-merchant/reviews') return send({ total_count: 1, items: [{ id: 1, sku: url.searchParams.get('sku'), status: 'pending', ratings: [{ value: 2 }] }] });
    if (endpoint === '/mcp-merchant/prices') return send({ total_count: 1, items: data.priceResults ?? [{ sku: url.searchParams.get('skus[0]'), unit_price: 8, currency: 'EUR' }] });
    return send({ message: `Unexpected endpoint ${req.method} ${endpoint}` }, 404);
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, '../mcp-server.js')], stderr: 'pipe',
    env: { MAGENTO_API_TOKEN: 'mock', MAGENTO_BASE_URL: `http://127.0.0.1:${api.address().port}/rest/V1`, TZ: 'UTC' } });
  const client = new Client({ name: 'merchant-tests', version: '1' });
  t.after(async () => { await client.close(); await new Promise(resolve => api.close(resolve)); });
  await client.connect(transport);
  transport.stderr.on('data', () => {});
  async function call(name, args = {}) {
    const response = await client.callTool({ name, arguments: args });
    assert.ok(!response.isError, response.content[0].text);
    return JSON.parse(response.content[0].text);
  }
  async function error(name, args, pattern) {
    try {
      const response = await client.callTool({ name, arguments: args });
      assert.equal(response.isError, true, response.content[0].text);
      if (pattern) assert.match(response.content[0].text, pattern);
    } catch (error) {
      if (error.code !== -32602) throw error;
    }
  }
  async function scenario(name, run) { await t.test(name, async () => { reset(); await run(); }); }

  await scenario('all priority 1 and 2 tools are discoverable', async () => {
    const names = new Set((await client.listTools()).tools.map(tool => tool.name));
    for (const name of ['get_abandoned_carts', 'get_cart', 'get_credit_memos', 'get_refund_report', 'get_customers', 'get_customer',
      'get_customer_groups', 'get_customer_analytics', 'get_inventory', 'get_low_stock_products', 'get_inventory_risk',
      'get_order_tracking', 'get_invoices', 'get_sales_rules', 'get_coupons', 'get_coupon_performance', 'get_product_prices',
      'get_product_tier_prices', 'search_cms_pages', 'get_cms_page', 'update_cms_page', 'get_cms_blocks', 'get_search_terms', 'get_product_reviews']) {
      assert.ok(names.has(name), name);
    }
  });

  await scenario('abandoned carts require inactivity and use authoritative totals in separate currencies', async () => {
    const args = { as_of: '2026-09-01T00:00:00Z', inactive_hours: 24 };
    const result = (await call('get_abandoned_carts', args)).result;
    assert.equal(result.total_count, 2);
    assert.deepEqual(result.carts.map(cart => cart.id), [905, 901]);
    assert.deepEqual(result.totals_by_currency, [{ currency: 'USD', cart_value: 50 }, { currency: 'EUR', cart_value: 151 }]);
    assert.equal((await call('get_abandoned_carts', { ...args, min_total: 100, currency: 'EUR' })).result.carts[0].totals.grand_total, 151);
    assert.equal((await call('get_cart', { cart_id: 901 })).result.items[0].qty, 2);
    assert.ok(calls.filter(call => call.endpoint.endsWith('/totals')).every(call => !call.endpoint.includes('902') && !call.endpoint.includes('904')));
  });

  await scenario('inactive carts expose items without calling the active-cart totals endpoint', async () => {
    data.carts[3].billing_address = { email: 'guest-contact@example.com' };
    const result = (await call('get_cart', { cart_id: 904 })).result;
    assert.equal(result.items[0].sku, 'B');
    assert.equal(result.totals, null);
    assert.equal(result.customer.email, 'guest-contact@example.com');
    assert.match(result.totals_unavailable_reason, /active carts/);
    assert.ok(!calls.some(call => call.endpoint.endsWith('/totals')));
  });

  await scenario('cash-period and order-cohort refunds produce different correct totals and AOV', async () => {
    const args = { date_range: period, subtract_refunds: true, group_by: 'month' };
    const cash = (await call('get_revenue', args)).result;
    assert.equal(cash.gross_revenue, 180);
    assert.equal(cash.refund_amount, 24);
    assert.equal(cash.net_revenue, 156);
    assert.equal(cash.average_order_value, 90);
    assert.equal(cash.net_average_order_value, null);
    assert.equal(cash.periods[0].net_revenue, 156);
    const cohort = (await call('get_revenue', { ...args, refund_date_basis: 'order_date', include_tax: false })).result;
    assert.equal(cohort.gross_revenue, 150);
    assert.equal(cohort.refund_amount, 10);
    assert.equal(cohort.net_revenue, 140);
    assert.equal(cohort.net_average_order_value, 70);
    assert.equal((await call('get_revenue_by_country', { ...args, country: 'Germany' })).result.refund_amount, 0);
  });

  await scenario('refund reports exclude open/canceled documents and use actual credit memo item quantities', async () => {
    const result = (await call('get_refund_report', { date_range: period, group_by: 'month' })).result;
    assert.equal(result.credit_memo_count, 1);
    assert.equal(result.refund_amount, 24);
    assert.equal(result.products[0].refunded_quantity, 2);
    assert.equal(result.unallocated_refund_amount, 0);
    const cohort = (await call('get_refund_report', { date_range: period, date_basis: 'order_date' })).result;
    assert.equal(cohort.products[0].refunded_quantity, 0.5);
    assert.equal((await call('get_credit_memos', { order_id: 2, page_size: 1 })).result.total_count, 3);
    data.creditmemos[0].order_id = 9999;
    await error('get_refund_report', { date_range: period }, /could not be retrieved/);
  });

  await scenario('refund currency checks include older orders when there are no current-period sales', async () => {
    data.orders[0].order_currency_code = 'USD';
    await error('get_revenue', { date_range: period, subtract_refunds: true }, /currencies/);
    const result = (await call('get_revenue', { date_range: period, subtract_refunds: true, currency: 'USD' })).result;
    assert.equal(result.currency, 'USD');
    assert.equal(result.order_count, 0);
    assert.equal(result.net_revenue, -24);
    assert.equal(result.average_order_value, 0);
  });

  await scenario('customer searches, groups and ambiguous email lookup', async () => {
    assert.equal((await call('get_customers', { name: 'test buyer', group_id: 2 })).result.customers[0].id, 11);
    assert.equal((await call('get_customer', { customer_id: 11 })).result.addresses[0].city, 'Utrecht');
    assert.equal((await call('get_customer_groups')).result.customer_groups.length, 2);
    data.customers.push({ ...data.customers[0], id: 12, website_id: 2 });
    await error('get_customer', { email: 'buyer@example.com' }, /multiple customers/);
    assert.equal((await call('get_customer', { email: 'buyer@example.com', website_id: 2 })).result.id, 12);
  });

  await scenario('customer lifecycle uses pre-period history and website-scoped guest identities', async () => {
    data.orders.push(order(4, '2026-06-01', 60, { customer_id: 22 }),
      order(5, '2026-08-20', 60, { customer_id: null, customer_email: 'GUEST@example.com', store_id: 2 }),
      order(6, '2026-08-20', 60, { customer_id: null, customer_email: 'guest@example.com', store_id: 3 }),
      order(7, '2026-08-22', 999, { customer_id: 30, state: 'canceled', status: 'canceled' }));
    const result = (await call('get_customer_analytics', { date_range: period, inactive_days: 30 })).result;
    assert.equal(result.summary.buyers, 3);
    assert.equal(result.summary.new_buyers, 2);
    assert.equal(result.summary.returning_buyers, 1);
    assert.equal(result.summary.inactive_buyers, 1);
    assert.equal(result.summary.revenue, 300);
    assert.equal(result.customers.find(row => row.customer_id === 11).lifetime_revenue, 240);
    const inactive = (await call('get_customer_analytics', { date_range: period, inactive_days: 30, segment: 'inactive' })).result;
    assert.equal(inactive.customers[0].customer_id, 22);
    assert.equal(inactive.customers[0].order_count, 0);
  });

  await scenario('order dossier includes real documents and excludes payment secrets', async () => {
    const result = (await call('get_order', { order_id: 2 })).result;
    assert.equal(result.payment.method, 'ideal');
    assert.equal(result.payment.additional_information, undefined);
    assert.equal(result.invoices[0].entity_id, 301);
    assert.equal(result.shipments[0].tracks[0].track_number, 'TRACK123');
    assert.equal(result.credit_memos.length, 3);
    assert.equal(result.status_histories[0].comment, 'Dispatched');
    assert.equal((await call('get_order', { order_id: 2, include_documents: false })).result.invoices, undefined);
    assert.equal((await call('get_order_tracking', { order_id: 2 })).result.shipments[0].tracks[0].track_number, 'TRACK123');
    assert.equal((await call('get_invoices', { date_range: period, state: 2 })).result.invoices.length, 1);
    await error('get_order_tracking', { order_id: 999 }, /404/);
  });

  await scenario('MSI quantities reflect reservations and only sources linked to the selected stock', async () => {
    const result = (await call('get_inventory', { skus: ['A', 'B', 'C', 'missing'] })).result;
    assert.equal(result.products[0].salable_quantity, 3);
    assert.equal(result.products[0].sources.length, 1);
    assert.equal(result.products[0].sources[0].quantity, 10);
    assert.equal(result.products[1].is_salable, false);
    assert.match(result.products[2].unavailable_reason, /Composite/);
    assert.match(result.products[3].unavailable_reason, /not found/);
    const legacy = (await call('get_inventory', { skus: ['A'], inventory_mode: 'legacy' })).result.products[0];
    assert.equal(legacy.salable_quantity, null);
    assert.equal(legacy.availability_quantity, 12);
    assert.equal((await call('get_low_stock_products', { threshold: 5 })).result.total_count, 2);
    data.availability.A = null;
    await error('get_inventory', { skus: ['A'] }, /Invalid inventory response/);
  });

  await scenario('inventory risk uses net units and identifies stocked products without sales', async () => {
    const result = (await call('get_inventory_risk', { date_range: period, store_id: 1, risk_days: 100 })).result;
    assert.equal(result.lookback_days, 31);
    assert.equal(result.products.find(row => row.sku === 'A').quantity_sold, 1.5);
    assert.equal(result.products.find(row => row.sku === 'A').days_of_stock, 62);
    assert.equal(result.products.find(row => row.sku === 'A').risk, 'at_risk');
    assert.equal(result.products.find(row => row.sku === 'D').risk, 'no_sales');
    assert.equal(result.summary.out_of_stock, 1);
    assert.equal(result.unavailable_products[0].sku, 'C');
  });

  await scenario('coupon performance uses order history even if the coupon has been deleted', async () => {
    data.coupons = [];
    const result = (await call('get_coupon_performance', { date_range: period })).result;
    assert.equal(result.coupons[0].coupon_code, 'SAVE');
    assert.equal(result.coupons[0].revenue, 120);
    assert.equal(result.coupons[0].discount_amount, 10);
    assert.equal(result.comparison.without_coupon.revenue, 60);
    assert.equal((await call('get_sales_rules', { website_id: 1, customer_group_id: 2 })).result.rules[0].rule_id, 10);
    assert.equal((await call('get_coupons')).result.total_count, 0);
  });

  await scenario('prices use explicit website/group/quantity context and tier lookup is read-only', async () => {
    const tiers = (await call('get_product_tier_prices', { skus: ['A'], website_id: 1, customer_group: 'Wholesale' })).result.tier_prices;
    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].customer_group, 'ALL GROUPS');
    const priced = (await call('get_product_prices', { skus: ['A'], store_id: 1, customer_group_id: 2, quantity: 10 })).result;
    assert.equal(priced.items[0].unit_price, 8);
    const request = calls.find(call => call.endpoint === '/mcp-merchant/prices');
    assert.equal(request.params.get('customerGroupId'), '2');
    assert.equal(request.params.get('quantity'), '10');
    data.priceResults = [{ sku: 'C', found: true, minimum_price: 10, maximum_price: 20 }];
    assert.equal((await call('get_product_prices', { skus: ['C'], store_id: 1 })).result.items[0].unit_price, null);
    data.priceResults = ['{"sku":"C"}'];
    await error('get_product_prices', { skus: ['C'], store_id: 1 }, /Invalid merchant module response/);
  });

  await scenario('CMS update preserves layout/identifier and rejects stale or unrelated changes', async () => {
    assert.equal((await call('search_cms_pages', { title: 'Ship' })).result.pages[0].id, 5);
    assert.equal((await call('get_cms_page', { identifier: 'shipping' })).result.content, 'Old text');
    assert.equal((await call('get_cms_blocks', { identifier: 'footer' })).result.blocks[0].id, 6);
    const result = (await call('update_cms_page', { page_id: 5, changes: { content: 'New text', meta_description: 'Delivery info' },
      expected_update_time: '2026-08-01 12:00:00' })).result;
    assert.equal(result.content, 'New text');
    assert.equal(result.identifier, 'shipping');
    assert.equal(result.page_layout, '1column');
    assert.equal(result.custom_theme, 'theme-7');
    assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
    await error('update_cms_page', { page_id: 5, changes: { content: 'Overwrite' }, expected_update_time: 'old' }, /changed/);
    await error('update_cms_page', { page_id: 5, changes: { page_layout: 'empty' } });
    await error('update_cms_page', { page_id: 5, changes: {} });
    assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
  });

  await scenario('search/review tools send real supported module parameters and expose missing-module errors', async () => {
    const terms = (await call('get_search_terms', { store_id: 1, zero_results_only: true, min_popularity: 10, query: 'purple' })).result;
    assert.equal(terms.search_terms[0].num_results, 0);
    assert.equal(calls.at(-1).params.get('zeroResultsOnly'), '1');
    assert.equal(calls.at(-1).params.get('minPopularity'), '10');
    const reviews = (await call('get_product_reviews', { sku: 'A/&', status: 'pending', store_id: 1 })).result;
    assert.equal(reviews.reviews[0].sku, 'A/&');
    assert.equal(calls.at(-1).params.get('status'), 'pending');
    failPath = { path: '/mcp-merchant', status: 404 };
    await error('get_search_terms', {}, /bundled Elgentos_McpMerchant/);
    failPath.status = 403;
    await error('get_product_reviews', { sku: 'A' }, /403/);
  });

  await scenario('merchant reports aggregate all API pages before returning a result page', async () => {
    data.orders = Array.from({ length: 105 }, (_, i) => order(i + 1000, '2026-08-01', 12, { coupon_code: `CODE${i}`, discount_amount: -1 }));
    const result = (await call('get_coupon_performance', { date_range: period, page_size: 10, current_page: 2 })).result;
    assert.equal(result.total_count, 105);
    assert.equal(result.coupons.length, 10);
    assert.equal(result.next_page, 3);
    assert.equal(result.comparison.with_coupon.order_count, 105);
    assert.equal(result.comparison.with_coupon.revenue, 1260);
    assert.equal(calls.filter(call => call.endpoint === '/orders').length, 2);
  });

  await scenario('invalid inputs cause no API calls; upstream failures are not reported as empty results', async () => {
    await error('get_abandoned_carts', { inactive_hours: 0 });
    await error('get_product_prices', { skus: ['A'], store_id: 0 });
    await error('get_inventory', { skus: [] });
    await error('get_product_reviews', { sku: 'A', status: 'fake' });
    assert.equal(calls.length, 0);
    failPath = { path: '/inventory/get-product-salable-quantity', status: 503 };
    await error('get_inventory', { skus: ['A'], include_sources: false }, /503/);
  });
});

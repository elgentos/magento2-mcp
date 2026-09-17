const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const range = '2025-03-01 to 2026-08-31';
const categories = [
  { id: 1, parent_id: 0, level: 0, name: 'Root' },
  { id: 2, parent_id: 1, level: 1, name: 'Store' },
  { id: 10, parent_id: 2, level: 2, name: 'Panels' },
  { id: 11, parent_id: 10, level: 3, name: 'Solar panels' },
  { id: 20, parent_id: 2, level: 2, name: 'Mounts' },
  { id: 21, parent_id: 20, level: 3, name: 'Screws' },
  { id: 30, parent_id: 2, level: 2, name: 'Optimizers' },
  { id: 31, parent_id: 30, level: 3, name: 'Optimizers detail' }
];
const product = (id, ids) => ({ id, sku: `catalog-${id}`, custom_attributes: [{ attribute_code: 'category_ids', value: ids }] });
const products = [product(100, ['11']), product(200, '21'), product(300, '[31]'), product(400, [20]),
  product(500, [10, 11, 21]), { id: 600, extension_attributes: { category_links: [{ category_id: '11' }] } }];
const item = (itemId, productId, sku, qty, total, extra = {}) => ({
  item_id: itemId, product_id: productId, sku, name: sku, product_type: 'simple', qty_ordered: qty,
  row_total: total, tax_amount: Number((total * 0.21).toFixed(2)), discount_amount: 0, ...extra
});
const fixtures = [
  {
    entity_id: 101, increment_id: '000000101', created_at: '2025-03-15 10:00:00', status: 'complete', store_id: 1,
    order_currency_code: 'EUR', grand_total: 143.1, tax_amount: 23.1, billing_address: { country_id: 'NL' },
    items: [item(1, 100, 'PANEL', 2, 100, { discount_amount: 10, tax_amount: 18.9 }), item(2, 200, 'MOUNT', 5, 20)]
  },
  {
    entity_id: 102, increment_id: '000000102', created_at: '2026-08-10 10:00:00', status: 'processing', store_id: 2,
    order_currency_code: 'EUR', grand_total: 324.6, tax_amount: 54.6, billing_address: { country_id: 'BE' },
    extension_attributes: { shipping_assignments: [{ shipping: { address: { country_id: 'DE' } } }] },
    items: [
      item(3, 300, 'OPT-V', 3, 90, { product_type: 'configurable' }),
      item(4, 301, 'OPT-V', 3, 0, { parent_item_id: 3 }),
      item(5, 500, 'MULTI', 2, 40), item(6, 9999, 'DELETED', 1, 10),
      item(7, 400, 'BUNDLE', 1, 0, { product_type: 'bundle' }),
      item(8, 401, 'DYN-A', 2, 30, { parent_item_id: 7 }), item(9, 402, 'DYN-B', 1, 30, { parent_item_id: 7 }),
      item(10, 600, 'FIXED', 1, 60, { product_type: 'bundle' }),
      item(11, 601, 'FIXED-CHILD', 2, 0, { parent_item_id: 10 })
    ]
  }
];

test('sales tools over MCP stdio and a mock Magento HTTP API', async t => {
  let orders, catalog, categoryData, requests, pageCap, failure, repeatedPage, missingPage;
  function reset() {
    orders = structuredClone(fixtures);
    catalog = structuredClone(products);
    categoryData = structuredClone(categories);
    requests = [];
    pageCap = Infinity;
    failure = null;
    repeatedPage = false;
    missingPage = false;
  }
  reset();
  const api = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.push(url);
    res.setHeader('content-type', 'application/json');
    if (failure && url.pathname.includes(failure)) {
      res.statusCode = 503;
      return res.end(JSON.stringify({ message: 'Service unavailable' }));
    }
    if (/\/orders\/\d+$/.test(url.pathname)) {
      const order = orders.find(order => order.entity_id === Number(url.pathname.split('/').pop()));
      res.statusCode = order ? 200 : 404;
      return res.end(JSON.stringify(order || { message: 'Not found' }));
    }
    let rows = url.pathname.endsWith('/orders') ? orders : url.pathname.endsWith('/products') ? catalog : categoryData;
    for (const [key, field] of url.searchParams) {
      if (!key.endsWith('[field]') || !key.includes('[filter_groups]')) continue;
      const prefix = key.slice(0, -7);
      const value = url.searchParams.get(`${prefix}[value]`);
      const condition = url.searchParams.get(`${prefix}[condition_type]`);
      rows = rows.filter(row => {
        const actual = String(field === 'entity_id' ? row.entity_id ?? row.id : row[field]);
        if (condition === 'gteq') return actual >= value;
        if (condition === 'lteq') return actual <= value;
        if (condition === 'in') return value.split(',').includes(actual);
        return actual === value;
      });
    }
    rows = [...rows].sort((a, b) => (a.entity_id ?? a.id) - (b.entity_id ?? b.id));
    const size = Math.min(Number(url.searchParams.get('searchCriteria[pageSize]') || 100), pageCap);
    const currentPage = Number(url.searchParams.get('searchCriteria[currentPage]') || 1);
    const offset = repeatedPage ? 0 : (currentPage - 1) * size;
    res.end(JSON.stringify({ total_count: rows.length, items: missingPage && currentPage > 1 ? [] : rows.slice(offset, offset + size) }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.resolve(__dirname, '../mcp-server.js')], stderr: 'pipe',
    env: { MAGENTO_API_TOKEN: 'test-token', MAGENTO_BASE_URL: `http://127.0.0.1:${api.address().port}/rest/V1`, TZ: 'UTC' }
  });
  const client = new Client({ name: 'sales-regression-tests', version: '1.0.0' });
  t.after(async () => {
    await client.close();
    await new Promise(resolve => api.close(resolve));
  });
  await client.connect(transport);
  // Drain diagnostics so an error-heavy test cannot block the child process.
  transport.stderr.on('data', () => {});
  async function call(name, args = {}) {
    const response = await client.callTool({ name, arguments: args });
    assert.ok(!response.isError, response.content[0].text);
    return JSON.parse(response.content[0].text);
  }
  async function scenario(name, run) {
    await t.test(name, async () => { reset(); await run(); });
  }

  await scenario('discovers new tools and their usable input schemas', async () => {
    const { tools } = await client.listTools();
    for (const name of ['get_orders', 'get_order', 'get_categories', 'get_category_sales', 'get_product_sales', 'get_revenue']) {
      assert.ok(tools.some(tool => tool.name === name), name);
    }
    assert.deepEqual(tools.find(tool => tool.name === 'get_revenue').inputSchema.properties.group_by.enum, ['none', 'month']);
    assert.ok(tools.find(tool => tool.name === 'get_product_sales').inputSchema.properties.category_id);
  });

  await scenario('lists orders and raw parent/child lines and resolves leading-zero order numbers', async () => {
    const first = (await call('get_orders', { date_range: range, page_size: 1 })).result;
    assert.equal(first.next_page, 2);
    assert.equal(first.orders[0].entity_id, 101);
    const second = (await call('get_orders', { date_range: range, page_size: 1, current_page: 2 })).result;
    assert.equal(second.next_page, null);
    assert.equal(second.orders[0].items.length, 9);
    assert.equal(second.orders[0].items[1].parent_item_id, 3);
    const byId = (await call('get_order', { order_id: 102 })).result;
    const byNumber = (await call('get_order', { increment_id: '000000102' })).result;
    assert.deepEqual(byId, byNumber);
    assert.equal(byNumber.items[0].product_id, 300);
    assert.equal((await call('get_orders', { date_range: range, include_items: false })).result.orders[0].items, undefined);
  });

  await scenario('calculates monthly AOV across 18 months including zero-sales months', async () => {
    orders.push({ ...structuredClone(fixtures[1]), entity_id: 103, grand_total: 75.3, tax_amount: 15.3 });
    const { result } = await call('get_revenue', { date_range: range, group_by: 'month' });
    assert.equal(result.currency, 'EUR');
    assert.equal(result.revenue, 543);
    assert.equal(result.average_order_value, 181);
    assert.equal(result.periods.length, 18);
    assert.equal(result.periods[0].month, '2025-03');
    assert.equal(result.periods[0].average_order_value, 143.1);
    assert.equal(result.periods[1].order_count, 0);
    assert.equal(result.periods[1].average_order_value, 0);
    assert.equal(result.periods[17].revenue, 399.9);
    assert.equal(result.periods[17].average_order_value, 199.95);
    assert.equal((await call('get_revenue', { date_range: range, include_tax: false })).result.revenue, 450);
    assert.equal(requests.filter(url => url.pathname.endsWith('/orders')).length, 2);
  });

  await scenario('last 18 months means complete calendar months, without current-month data', async () => {
    const { query, result } = await call('get_revenue', { date_range: 'last 18 months', group_by: 'month' });
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 18, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
    assert.deepEqual(query.period, { start_date: start, end_date: end });
    assert.equal(result.periods.length, 18);
  });

  await scenario('product and API pagination include every product beyond the original top ten', async () => {
    orders = Array.from({ length: 125 }, (_, i) => ({ ...structuredClone(fixtures[0]), entity_id: i + 1,
      grand_total: 1.21, tax_amount: 0.21, items: [item(i + 1, i + 1000, `SKU-${String(i).padStart(3, '0')}`, 1, 1)] }));
    const first = (await call('get_product_sales', { date_range: range, page_size: 10, sort_by: 'sku', sort_direction: 'asc' })).result;
    assert.equal(first.total_orders, 125);
    assert.equal(first.total_count, 125);
    assert.equal(first.product_revenue, 125);
    assert.equal(first.products.length, 10);
    assert.equal(first.top_products.length, 10);
    assert.equal(first.next_page, 2);
    const second = (await call('get_product_sales', { date_range: range, page_size: 10, current_page: 2, sort_by: 'sku', sort_direction: 'asc' })).result;
    assert.equal(second.products[0].sku, 'SKU-010');
    const last = (await call('get_product_sales', { date_range: range, page_size: 10, current_page: 13 })).result;
    assert.equal(last.products.length, 5);
    assert.equal(last.next_page, null);
    assert.equal(requests.filter(url => url.pathname.endsWith('/orders')).length, 6);
    pageCap = 7;
    assert.equal((await call('get_revenue', { date_range: range })).result.order_count, 125);
  });

  await scenario('counts configurable and bundle sales once and applies discounts and tax', async () => {
    const result = (await call('get_product_sales', { date_range: range })).result;
    assert.equal(result.total_product_quantity, 17);
    assert.equal(result.product_revenue, 370);
    assert.equal(result.products.find(product => product.sku === 'OPT-V').quantity, 3);
    assert.ok(!result.products.some(product => ['BUNDLE', 'FIXED-CHILD'].includes(product.sku)));
    assert.equal(result.products.find(product => product.sku === 'PANEL').revenue, 90);
    const taxed = (await call('get_product_sales', { date_range: range, include_tax: true })).result;
    assert.equal(taxed.product_revenue, 447.7);
    orders[0].items[0].discount_amount = 12.1;
    orders[0].items[0].discount_tax_compensation_amount = 2.1;
    assert.equal((await call('get_product_sales', { date_range: range, sku: 'PANEL' })).result.product_revenue, 90);
    assert.equal((await call('get_product_sales', { date_range: range, sku: 'PANEL', include_tax: true })).result.product_revenue, 108.9);
  });

  await scenario('groups all sales by category and month without duplicating multi-category products', async () => {
    const { result, calculation } = await call('get_category_sales', { date_range: range, group_by: 'month' });
    const byId = new Map(result.categories.map(category => [category.category_id, category]));
    assert.equal(result.product_revenue, 370);
    assert.equal(result.total_product_quantity, 17);
    assert.equal(result.total_orders, 2);
    assert.equal(byId.get(10).revenue, 170);
    assert.equal(byId.get(10).order_count, 2);
    assert.equal(byId.get(10).average_order_value, 85);
    assert.equal(byId.get(20).revenue, 100);
    assert.equal(byId.get(30).revenue, 90);
    assert.equal(byId.get(null).revenue, 10);
    assert.equal(result.categories.reduce((sum, category) => sum + category.revenue, 0), 370);
    assert.equal(result.categories.reduce((sum, category) => sum + category.quantity, 0), 17);
    assert.equal(result.periods.length, 18);
    assert.equal(result.periods[0].categories.find(category => category.category_id === 10).revenue, 90);
    assert.ok(result.periods[1].categories.every(category => category.revenue === 0));
    assert.match(calculation.category_membership, /Current catalog/);
    assert.equal(requests.filter(url => url.pathname.endsWith('/products')).length, 1);
  });

  await scenario('category pages and monthly pages are consistent and totals span all pages', async () => {
    const first = (await call('get_category_sales', { date_range: range, group_by: 'month', page_size: 2 })).result;
    const second = (await call('get_category_sales', { date_range: range, group_by: 'month', page_size: 2, current_page: 2 })).result;
    assert.equal(first.total_count, 4);
    assert.equal(first.product_revenue, 370);
    assert.equal(first.next_page, 2);
    assert.equal(second.next_page, null);
    assert.deepEqual(first.periods[0].categories.map(row => row.category_id), first.categories.map(row => row.category_id));
    assert.deepEqual(second.periods[17].categories.map(row => row.category_id), second.categories.map(row => row.category_id));
    const listed = (await call('get_categories', { page_size: 3, current_page: 2 })).result;
    assert.equal(listed.total_count, categories.length);
    assert.equal(listed.categories[0].id, 11);
    assert.equal(listed.categories[0].parent_id, 10);
  });

  await scenario('category analysis fetches multiple product batches and category API pages', async () => {
    orders = [{ ...structuredClone(fixtures[0]),
      items: Array.from({ length: 125 }, (_, i) => item(i + 1, i + 1000, `SKU-${i}`, 0.5, 1)) }];
    catalog = orders[0].items.map(line => product(line.product_id, [11]));
    categoryData.push(...Array.from({ length: 100 }, (_, i) => ({ id: i + 1000, parent_id: 2, level: 2, name: `Other ${i}` })));
    const { result } = await call('get_category_sales', { date_range: range });
    assert.equal(result.product_revenue, 125);
    assert.equal(result.total_product_quantity, 62.5);
    assert.equal(result.categories[0].revenue, 125);
    assert.equal(result.categories[0].order_count, 1);
    assert.equal(requests.filter(url => url.pathname.endsWith('/products')).length, 2);
    assert.equal(requests.filter(url => url.pathname.endsWith('/categories/list')).length, 2);
  });

  await scenario('retains free products and unclassified products at deeper category levels', async () => {
    orders[0].items.push(item(12, 12345, 'FREE', 0.5, 0));
    const sales = (await call('get_product_sales', { date_range: range, sku: 'FREE' })).result;
    assert.equal(sales.total_product_quantity, 0.5);
    assert.equal(sales.product_revenue, 0);
    assert.equal(sales.products[0].order_count, 1);
    const deeper = (await call('get_category_sales', { date_range: range, category_level: 3 })).result;
    assert.equal(deeper.product_revenue, 370);
    assert.equal(deeper.categories.find(category => category.category_id === null).revenue, 70);
    assert.equal(deeper.categories.find(category => category.category_id === null).quantity, 4.5);
  });

  await scenario('supports SKU, category descendants, country, status, store and currency filters', async () => {
    const exact = (await call('get_product_sales', { date_range: range, sku: 'PANEL' })).result;
    assert.equal(exact.total_count, 1);
    assert.equal(exact.product_revenue, 90);
    const descendants = (await call('get_product_sales', { date_range: range, category_id: 10 })).result;
    assert.equal(descendants.product_revenue, 190);
    assert.equal((await call('get_product_sales', { date_range: range, category_id: 10, include_subcategories: false })).result.product_revenue, 40);
    const country = (await call('get_orders', { date_range: range, country: 'Germany', page_size: 1 })).result;
    assert.equal(country.total_count, 1);
    assert.equal(country.orders[0].entity_id, 102);
    assert.equal((await call('get_revenue_by_country', { date_range: range, country: 'The Netherlands' })).result.revenue, 143.1);
    assert.equal((await call('get_revenue', { date_range: range, status: 'complete', store_id: 1, currency: 'EUR' })).result.order_count, 1);
    assert.equal((await call('get_revenue', { date_range: range, status: 'complete', store_id: 2 })).result.order_count, 0);
  });

  await scenario('does not combine different currencies or invent one for empty results', async () => {
    orders[1].order_currency_code = 'USD';
    for (const name of ['get_revenue', 'get_product_sales', 'get_category_sales']) {
      const response = await client.callTool({ name, arguments: { date_range: range } });
      assert.equal(response.isError, true);
      assert.match(response.content[0].text, /currencies/);
    }
    assert.equal((await call('get_revenue', { date_range: range, currency: 'EUR' })).result.revenue, 143.1);
    const empty = (await call('get_revenue', { date_range: '2024-01-01 to 2024-02-29', group_by: 'month' })).result;
    assert.equal(empty.currency, null);
    assert.equal(empty.average_order_value, 0);
    assert.equal(empty.periods.length, 2);
    assert.equal((await call('get_category_sales', { date_range: '2024-01-01', group_by: 'month' })).result.categories.length, 0);
  });

  await scenario('rejects invalid input before HTTP requests', async () => {
    for (const args of [{ date_range: range, page_size: 0 }, { date_range: range, current_page: 1.5 },
      { date_range: '2026-08-31 to 2025-03-01' }, { date_range: 'last 0 months' }, { date_range: 'nonsense' }]) {
      await assert.rejects(async () => {
        const response = await client.callTool({ name: 'get_product_sales', arguments: args });
        if (response.isError) throw new Error(response.content[0].text);
      });
    }
    assert.equal(requests.length, 0);
    assert.equal((await client.callTool({ name: 'get_order', arguments: { order_id: 101, increment_id: '000000101' } })).isError, true);
    assert.equal(requests.length, 0);
  });

  await scenario('fails explicitly on unknown categories and Magento failures', async () => {
    let response = await client.callTool({ name: 'get_category_sales', arguments: { date_range: range, category_id: 999 } });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /not found/);
    failure = '/products';
    response = await client.callTool({ name: 'get_category_sales', arguments: { date_range: range } });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /503/);
    failure = '/orders';
    assert.equal((await client.callTool({ name: 'get_revenue', arguments: { date_range: range } })).isError, true);
  });

  await scenario('refuses partial totals if Magento repeats or omits pages', async () => {
    pageCap = 1;
    const pageResponse = await client.callTool({ name: 'get_orders', arguments: { date_range: range } });
    assert.equal(pageResponse.isError, true);
    assert.match(pageResponse.content[0].text, /Incomplete order page/);
    repeatedPage = true;
    let response = await client.callTool({ name: 'get_revenue', arguments: { date_range: range } });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /Repeated record/);
    repeatedPage = false;
    missingPage = true;
    response = await client.callTool({ name: 'get_product_sales', arguments: { date_range: range } });
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /Incomplete/);
  });
});

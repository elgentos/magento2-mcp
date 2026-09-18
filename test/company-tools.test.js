const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const autoAssign = JSON.stringify({ enabled: true, domains: ['acme.com'] });
const company = (id, name, extra = {}) => ({ company_id: id, name, status: 'active', coc_number: `1234567${id}`,
  vat_number: `NL12345678${id}B01`, street: 'Main Street 1', postcode: '1234 AB', city: 'Amsterdam', country_id: 'NL',
  email: `info@${name.toLowerCase()}.com`, telephone: '+31612345678', representative: 'John Doe', auto_assign_config: null, ...extra });

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
    const actual = String(row[field]);
    if (condition === 'in') return value.split(',').includes(actual);
    if (condition === 'like') return actual.toLowerCase().includes(value.replaceAll('%', '').toLowerCase());
    return actual === value;
  };
  const filtered = rows.filter(row => [...groups.values()].every(group => group.some(filter => matches(row, filter))));
  const size = Number(params.get('searchCriteria[pageSize]') || 100);
  const page = Number(params.get('searchCriteria[currentPage]') || 1);
  return { total_count: filtered.length, items: filtered.slice((page - 1) * size, page * size) };
}

// Each MCP server process caches whether the B2B module is available, so unsupported
// instances need their own server process.
async function startServer(t, route) {
  const calls = [];
  const api = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const endpoint = url.pathname.replace('/rest/V1', '');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ endpoint, method: req.method, params: url.searchParams, body });
    const send = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    route({ endpoint, method: req.method, params: url.searchParams, body, send });
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, '../mcp-server.js')], stderr: 'pipe',
    env: { MAGENTO_API_TOKEN: 'mock', MAGENTO_BASE_URL: `http://127.0.0.1:${api.address().port}/rest/V1`, TZ: 'UTC' } });
  const client = new Client({ name: 'company-tests', version: '1' });
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
    } catch (failure) {
      if (failure.code !== -32602) throw failure;
    }
  }
  return { client, call, error, calls };
}

function createB2bRoute(data) {
  return ({ endpoint, method, params, body, send }) => {
    const find = id => data.companies.find(row => row.company_id === Number(id));
    if (endpoint === '/company/search' && method === 'GET') return send(search(data.companies, params));
    if (endpoint === '/company' && method === 'POST') {
      const created = { company_id: data.nextId++, status: 'pending', ...body.company };
      data.companies.push(created);
      return send(created);
    }
    if (endpoint === '/store/storeConfigs') return send(data.storeConfigs);
    let match = endpoint.match(/^\/company\/customer\/(\d+)$/);
    if (match) {
      const assignment = data.companyCustomers.find(row => row.customer_id === Number(match[1]));
      return assignment ? send(find(assignment.company_id)) : send({ message: 'No such entity' }, 404);
    }
    match = endpoint.match(/^\/company\/(\d+)$/);
    if (match) {
      const existing = find(match[1]);
      if (!existing) return send({ message: 'No such entity with id = %1', parameters: [match[1]] }, 404);
      if (method === 'PUT') {
        Object.assign(existing, body.company);
        return send(existing);
      }
      if (method === 'DELETE') {
        data.companies.splice(data.companies.indexOf(existing), 1);
        return send(true);
      }
      return send(existing);
    }
    match = endpoint.match(/^\/company-customer\/customer\/(\d+)$/);
    if (match) {
      const assignment = data.companyCustomers.find(row => row.customer_id === Number(match[1]));
      return assignment ? send(assignment) : send({ message: 'No such entity' }, 404);
    }
    if (endpoint === '/company-customer' && method === 'POST') {
      const input = body.companyCustomer;
      const existing = data.companyCustomers.find(row => row.customer_id === input.customer_id);
      if (existing) {
        Object.assign(existing, input);
        return send(existing);
      }
      const created = { entity_id: data.nextAssignmentId++, ...input };
      data.companyCustomers.push(created);
      return send(created);
    }
    match = endpoint.match(/^\/company-pricing\/(.+)$/);
    if (match && method === 'POST') {
      if (!data.products.includes(decodeURIComponent(match[1]))) return send({ message: 'No such product' }, 404);
      data.companyPrices.set(decodeURIComponent(match[1]), body.companyPrices);
      return send(true);
    }
    match = endpoint.match(/^\/products\/(.+)$/);
    if (match) {
      const sku = decodeURIComponent(match[1]);
      return data.products.includes(sku) ? send({ id: 1, sku }) : send({ message: 'No such product' }, 404);
    }
    return send({ message: `Unexpected endpoint ${method} ${endpoint}` }, 404);
  };
}

function createData() {
  return {
    nextId: 3, nextAssignmentId: 8, products: ['SKU-A'], companyPrices: new Map(),
    storeConfigs: [{ id: 1, website_id: 1, base_currency_code: 'EUR' }],
    companies: [company(1, 'Acme', { auto_assign_config: autoAssign }), company(2, 'Bricks', { status: 'pending', city: 'Utrecht', country_id: 'DE' })],
    companyCustomers: [{ entity_id: 7, company_id: 1, customer_id: 42, role_id: 1 }]
  };
}

test('company tools against a Magento instance with the B2B suite', async t => {
  let data = createData();
  const { client, call, error, calls } = await startServer(t, (request) => createB2bRoute(data)(request));
  async function scenario(name, run) { await t.test(name, async () => { data = createData(); calls.length = 0; await run(); }); }

  await scenario('company tools are discoverable', async () => {
    const names = new Set((await client.listTools()).tools.map(tool => tool.name));
    for (const name of ['get_company_support', 'get_companies', 'get_company', 'create_company', 'update_company',
      'delete_company', 'get_company_customer', 'assign_customer_to_company', 'set_company_prices']) {
      assert.ok(names.has(name), name);
    }
  });

  await scenario('support check reports an available module', async () => {
    const result = (await call('get_company_support')).result;
    assert.deepEqual({ available: result.available, reason: result.reason }, { available: true, reason: null });
  });

  await scenario('search filters by name, status and country name, and paginates', async () => {
    const all = (await call('get_companies')).result;
    assert.equal(all.total_count, 2);
    assert.deepEqual(all.companies.map(row => row.company_id), [1, 2]);
    assert.equal((await call('get_companies', { name: 'acm' })).result.companies[0].name, 'Acme');
    assert.equal((await call('get_companies', { status: 'pending' })).result.companies[0].company_id, 2);
    assert.equal((await call('get_companies', { country: 'Germany' })).result.companies[0].company_id, 2);
    assert.equal((await call('get_companies', { country: 'The Netherlands' })).result.companies[0].company_id, 1);
    assert.equal((await call('get_companies', { city: 'Utrecht' })).result.total_count, 1);
    assert.equal((await call('get_companies', { coc_number: '12345671' })).result.companies[0].company_id, 1);
    const paged = (await call('get_companies', { page_size: 1, current_page: 1 })).result;
    assert.deepEqual([paged.total_count, paged.companies.length, paged.next_page], [2, 1, 2]);
    assert.equal((await call('get_companies', { page_size: 1, current_page: 2 })).result.next_page, null);
    assert.equal((await call('get_companies', { name: 'nothing here' })).result.total_count, 0);
  });

  await scenario('search parses stored auto-assignment configuration', async () => {
    const companies = (await call('get_companies', { name: 'Acme' })).result.companies;
    assert.deepEqual(companies[0].auto_assign, { enabled: true, domains: ['acme.com'] });
    assert.equal(companies[0].auto_assign_config, autoAssign);
    assert.equal((await call('get_companies', { name: 'Bricks' })).result.companies[0].auto_assign, null);
  });

  await scenario('invalid stored auto-assignment configuration is reported, not thrown', async () => {
    data.companies[0].auto_assign_config = 'not json';
    const parsed = (await call('get_company', { company_id: 1 })).result.auto_assign;
    assert.match(parsed.parse_error, /not valid JSON/);
    assert.equal(parsed.raw, 'not json');
  });

  await scenario('a company is readable by ID and by customer', async () => {
    assert.equal((await call('get_company', { company_id: 1 })).result.name, 'Acme');
    assert.equal((await call('get_company', { customer_id: 42 })).result.company.company_id, 1);
    await error('get_company', { company_id: 99 }, /Company 99 not found/);
    await error('get_company', {}, /exactly one of company_id or customer_id/);
    await error('get_company', { company_id: 1, customer_id: 42 }, /exactly one of company_id or customer_id/);
  });

  await scenario('a customer without a company returns null instead of an error', async () => {
    const result = (await call('get_company', { customer_id: 43 })).result;
    assert.deepEqual({ company: result.company, customer_id: result.customer_id }, { company: null, customer_id: 43 });
    assert.match(result.note, /not assigned to a company/);
    const assignment = (await call('get_company_customer', { customer_id: 43 })).result;
    assert.equal(assignment.assignment, null);
    assert.match(assignment.note, /not assigned to a company/);
  });

  await scenario('an assignment exposes the role within the company', async () => {
    const result = (await call('get_company_customer', { customer_id: 42 })).result;
    assert.deepEqual(result.assignment, { entity_id: 7, company_id: 1, customer_id: 42, role_id: 1 });
  });

  await scenario('create encodes auto-assignment and requires the mandatory fields', async () => {
    const input = { name: 'Nieuw', coc_number: '99999999', vat_number: 'NL999999999B01', street: 'Dorpsstraat 2',
      postcode: '5678 CD', city: 'Utrecht', country_id: 'NL', email: 'info@nieuw.nl', auto_assign: { enabled: true, domains: ['nieuw.nl'] } };
    const created = (await call('create_company', input)).result;
    assert.equal(created.company_id, 3);
    assert.equal(created.status, 'pending');
    assert.deepEqual(created.auto_assign, { enabled: true, domains: ['nieuw.nl'] });
    const sent = calls.find(entry => entry.endpoint === '/company' && entry.method === 'POST').body.company;
    assert.equal(sent.auto_assign_config, JSON.stringify({ enabled: true, domains: ['nieuw.nl'] }));
    assert.equal(sent.auto_assign, undefined);
    await error('create_company', { name: 'Incomplete' });
    await error('create_company', { ...input, email: 'not-an-email' });
    await error('create_company', { ...input, country_id: 'NLD' });
    await error('create_company', { ...input, status: 'archived' });
  });

  await scenario('update changes only the given fields and keeps the rest', async () => {
    const result = await call('update_company', { company_id: 2, changes: { status: 'active', telephone: '+31600000000' } });
    assert.deepEqual(result.changed_fields, ['status', 'telephone']);
    assert.equal(result.previous.status, 'pending');
    assert.equal(result.result.status, 'active');
    assert.equal(result.result.name, 'Bricks');
    assert.equal(result.result.city, 'Utrecht');
    const sent = calls.find(entry => entry.method === 'PUT').body.company;
    assert.equal(sent.company_id, undefined);
    assert.equal(sent.vat_number, 'NL123456782B01');
    assert.equal((await call('get_company', { company_id: 2 })).result.telephone, '+31600000000');
    await error('update_company', { company_id: 2, changes: {} }, /at least one field/);
    await error('update_company', { company_id: 99, changes: { status: 'active' } }, /Company 99 not found/);
  });

  await scenario('update rewrites auto-assignment as a JSON string', async () => {
    await call('update_company', { company_id: 1, changes: { auto_assign: { enabled: false, domains: [] } } });
    assert.deepEqual((await call('get_company', { company_id: 1 })).result.auto_assign, { enabled: false, domains: [] });
  });

  await scenario('delete needs confirmation and returns the deleted record', async () => {
    await error('delete_company', { company_id: 1 });
    await error('delete_company', { company_id: 1, confirm: false });
    assert.ok(!calls.some(entry => entry.method === 'DELETE'));
    const result = await call('delete_company', { company_id: 1, confirm: true });
    assert.equal(result.result.deleted, true);
    assert.equal(result.result.deleted_company.name, 'Acme');
    assert.match(result.warning, /new company_id/);
    assert.equal((await call('get_companies')).result.total_count, 1);
    await error('delete_company', { company_id: 99, confirm: true }, /Company 99 not found/);
  });

  await scenario('assignment verifies the company and reports a move between companies', async () => {
    const fresh = await call('assign_customer_to_company', { company_id: 1, customer_id: 50, role_id: 1 });
    assert.equal(fresh.result.assignment.customer_id, 50);
    assert.equal(fresh.result.previous_assignment, null);
    assert.equal(fresh.warning, undefined);
    const moved = await call('assign_customer_to_company', { company_id: 2, customer_id: 42 });
    assert.equal(moved.result.previous_assignment.company_id, 1);
    assert.match(moved.warning, /belonged to company 1/);
    assert.equal(moved.result.assignment.role_id, 1);
    assert.equal((await call('get_company', { customer_id: 42 })).result.company.company_id, 2);
    await error('assign_customer_to_company', { company_id: 99, customer_id: 42 }, /Company 99 not found/);
    assert.equal(calls.filter(entry => entry.endpoint === '/company-customer' && entry.method === 'POST').length, 2);
  });

  await scenario('company prices replace every tier and need confirmation', async () => {
    const prices = [{ company_id: 1, quantity: 1, price: 10 }, { company_id: 1, quantity: 10, price: 8 }];
    await error('set_company_prices', { sku: 'SKU-A', prices });
    assert.ok(!calls.some(entry => entry.endpoint.startsWith('/company-pricing')));
    const result = await call('set_company_prices', { sku: 'SKU-A', prices, confirm: true });
    assert.deepEqual({ tiers: result.result.tier_count, replaced: result.result.replaced_all_tiers }, { tiers: 2, replaced: true });
    assert.equal(result.result.currency, 'EUR');
    assert.deepEqual(data.companyPrices.get('SKU-A'), prices);
    const sent = calls.find(entry => entry.endpoint.startsWith('/company-pricing')).body;
    assert.equal(sent.sku, 'SKU-A');
    await call('set_company_prices', { sku: 'SKU-A', prices: [], confirm: true });
    assert.deepEqual(data.companyPrices.get('SKU-A'), []);
    await error('set_company_prices', { sku: 'MISSING', prices, confirm: true }, /Product MISSING not found/);
    await error('set_company_prices', { sku: 'SKU-A', prices: [{ company_id: 1, quantity: 0, price: 10 }], confirm: true });
    await error('set_company_prices', { sku: 'SKU-A', prices: [{ company_id: 1, quantity: 1, price: -1 }], confirm: true });
  });
});

test('company tools against a Magento instance without the B2B suite', async t => {
  const { call, error, calls } = await startServer(t, ({ endpoint, method, send }) => {
    if (endpoint.startsWith('/company')) return send({ message: 'Request does not match any route.' }, 404);
    return send({ message: `Unexpected endpoint ${method} ${endpoint}` }, 404);
  });

  await t.test('the support check explains the missing module without failing', async () => {
    const result = (await call('get_company_support')).result;
    assert.equal(result.available, false);
    assert.equal(result.reason, 'module_missing');
    assert.match(result.message, /Elgentos_CompanyAccounts/);
  });

  await t.test('every company tool reports the missing module instead of a raw 404', async () => {
    const missing = /does not have the Elgentos B2B Suite company module/;
    await error('get_companies', {}, missing);
    await error('get_company', { company_id: 1 }, missing);
    await error('get_company', { customer_id: 42 }, missing);
    await error('get_company_customer', { customer_id: 42 }, missing);
    await error('update_company', { company_id: 1, changes: { status: 'active' } }, missing);
    await error('delete_company', { company_id: 1, confirm: true }, missing);
    await error('assign_customer_to_company', { company_id: 1, customer_id: 42 }, missing);
    await error('set_company_prices', { sku: 'SKU-A', prices: [], confirm: true }, missing);
    await error('create_company', { name: 'Acme', coc_number: '1', vat_number: 'NL1B01', street: 'A 1',
      postcode: '1234 AB', city: 'Amsterdam', country_id: 'NL', email: 'info@acme.com' }, missing);
  });

  await t.test('the unsupported instance is probed once and no write is attempted', async () => {
    assert.equal(calls.filter(entry => entry.endpoint.startsWith('/company/search')).length, 1);
    assert.ok(calls.every(entry => entry.method === 'GET'));
  });
});

test('company tools when the API token cannot read companies', async t => {
  const { call, error } = await startServer(t, ({ endpoint, method, send }) => {
    if (endpoint.startsWith('/company')) return send({ message: 'Consumer is not authorized to access %resources' }, 403);
    return send({ message: `Unexpected endpoint ${method} ${endpoint}` }, 404);
  });

  await t.test('the support check names the required permissions', async () => {
    const result = (await call('get_company_support')).result;
    assert.equal(result.available, false);
    assert.equal(result.reason, 'token_rejected');
    assert.match(result.message, /companies_view/);
  });

  await t.test('company tools report the rejected token', async () => {
    await error('get_companies', {}, /rejected the API token/);
    await error('get_company', { company_id: 1 }, /rejected the API token/);
  });
});

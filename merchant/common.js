const { z } = require('zod');
const shared = require('../sales-tools');

const id = z.number().int().positive();
const skus = z.array(z.string().min(1)).min(1).max(100);
const optionalDate = shared.commonSchema.date_range.optional();
const nonCanceledStatus = shared.commonSchema.status.describe('Exact order status; omitted excludes canceled orders');
const asOf = z.string().datetime({ offset: true }).optional().describe('UTC/offset timestamp for a reproducible snapshot; defaults to now');
const pick = (record, fields) => Object.fromEntries(fields.filter(key => record?.[key] !== undefined).map(key => [key, record[key]]));
const timestamp = date => date.toISOString().slice(0, 19).replace('T', ' ');
function parseTimestamp(value) {
  const normalized = String(value).replace(' ', 'T');
  const parsed = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(normalized) ? normalized : `${normalized}Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid Magento timestamp: ${value}`);
  return parsed;
}
function anyFilter(index, field, values) {
  return values.map((value, position) => shared.filter(index, field, value).replaceAll('[filters][0]', `[filters][${position}]`)).join('&');
}
async function mapLimit(items, handler, concurrency = 5) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await handler(items[index], index);
    }
  }));
  return result;
}

function createContext(server, dependencies) {
  const { callMagentoApi: api, fetchAllPages: all, parseDateExpression, buildDateRangeFilter, normalizeCountry } = dependencies;
  function register(name, description, schema, handler) {
    server.tool(name, description, schema, async args => {
      try { return shared.json(await handler(args)); }
      catch (error) { return { content: [{ type: 'text', text: `Error in ${name}: ${error.message}` }], isError: true }; }
    });
  }
  function criteria(args = {}, dateField = 'created_at', extras = [], sortField = 'entity_id') {
    const parts = [];
    let index = 0;
    if (args.date_range) {
      const range = parseDateExpression(args.date_range);
      parts.push(buildDateRangeFilter(dateField, range.startDate, range.endDate));
      index = 2;
    }
    for (const [field, value, condition = 'eq'] of extras) {
      if (value !== undefined) parts.push(shared.filter(index++, field, value, condition));
    }
    parts.push(`searchCriteria[sortOrders][0][field]=${encodeURIComponent(sortField)}&searchCriteria[sortOrders][0][direction]=ASC`);
    return parts.join('&');
  }
  function orderCriteria(args = {}) {
    return criteria(args, 'created_at', [['status', args.status], ['store_id', args.store_id], ['order_currency_code', args.currency]]);
  }
  function matchesOrder(order, args) {
    if (args.status !== undefined && order.status !== args.status) return false;
    if (args.store_id !== undefined && Number(order.store_id) !== args.store_id) return false;
    if (args.currency !== undefined && order.order_currency_code !== args.currency) return false;
    if (!args.country) return true;
    const countries = normalizeCountry(args.country);
    return countries.includes(order.billing_address?.country_id) || (order.extension_attributes?.shipping_assignments || [])
      .some(assignment => countries.includes(assignment.shipping?.address?.country_id));
  }
  async function orders(args = {}) {
    return (await all('/orders', orderCriteria(args))).filter(order => matchesOrder(order, args));
  }
  async function ordersById(ids) {
    const unique = [...new Set(ids.map(Number))];
    const result = new Map();
    for (let offset = 0; offset < unique.length; offset += 100) {
      for (const order of await all('/orders', criteria({}, 'created_at', [['entity_id', unique.slice(offset, offset + 100).join(','), 'in']]))) {
        result.set(Number(order.entity_id), order);
      }
    }
    if (unique.some(orderId => !result.has(orderId))) throw new Error('An order referenced by a document could not be retrieved; refusing incomplete results');
    return result;
  }
  function paged(items, args, name = 'items') {
    return { ...shared.pagination(items.length, args), [name]: shared.page(items, args) };
  }
  async function extension(endpoint, params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((entry, index) => query.set(`${key}[${index}]`, String(entry)));
      else query.set(key, String(value));
    }
    try {
      const data = await api(`/mcp-merchant/${endpoint}?${query}`);
      if (!data || !Array.isArray(data.items) || !Number.isInteger(data.total_count) || data.total_count < 0 ||
          data.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Invalid merchant module response');
      return data;
    } catch (error) {
      if (error.response?.status === 404) throw new Error('This tool requires the bundled Elgentos_McpMerchant Magento module. See magento-module/README.md for installation.');
      throw error;
    }
  }
  return { ...dependencies, api, all, register, criteria, orderCriteria, matchesOrder, orders, ordersById, paged, extension };
}

module.exports = { ...shared, z, id, skus, optionalDate, nonCanceledStatus, asOf, pick, timestamp, parseTimestamp, anyFilter, mapLimit, createContext };

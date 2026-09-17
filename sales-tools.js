const { z } = require('zod');
const { format, addMonths, startOfMonth } = require('date-fns');

const number = value => Number(value || 0);
const round = value => Number(value.toFixed(2));
const quantity = value => Number(value.toFixed(4));
const json = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const dateDescription = "Date expression, e.g. 'last month', 'last 18 months' (complete calendar months), 'YTD', or '2025-03-01 to 2026-08-31'";
const commonSchema = {
  date_range: z.string().describe(dateDescription),
  status: z.string().optional().describe('Exact order status; omitted includes all statuses, including canceled orders'),
  country: z.string().optional().describe('Billing OR shipping country code or name, e.g. NL or The Netherlands'),
  store_id: z.number().int().nonnegative().optional().describe('Restrict to a Magento store ID'),
  currency: z.string().regex(/^[A-Z]{3}$/).optional().describe('Restrict to an order currency, e.g. EUR; different currencies cannot be summed')
};
const paginationSchema = {
  page_size: z.number().int().min(1).max(500).default(100).describe('Results per page (1–500, default 100)'),
  current_page: z.number().int().min(1).default(1).describe('Page number, starting at 1; follow next_page until null')
};
const groupingSchema = {
  group_by: z.enum(['none', 'month']).default('none').describe('Use month for a monthly time series in one call, including empty months')
};
const productFilterSchema = {
  sku: z.string().min(1).optional().describe('Exact ordered SKU'),
  category_id: z.number().int().positive().optional().describe('Current catalog category ID to filter, including descendants by default'),
  include_subcategories: z.boolean().default(true).describe('Include descendants of category_id')
};

function filter(index, field, value, condition = 'eq') {
  const prefix = `searchCriteria[filter_groups][${index}][filters][0]`;
  return `${prefix}[field]=${encodeURIComponent(field)}&${prefix}[value]=${encodeURIComponent(value)}&${prefix}[condition_type]=${condition}`;
}

const orderSort = 'searchCriteria[sortOrders][0][field]=entity_id&searchCriteria[sortOrders][0][direction]=ASC';

function pagination(total, args) {
  const totalPages = Math.ceil(total / args.page_size);
  return {
    total_count: total, page_size: args.page_size, current_page: args.current_page,
    total_pages: totalPages,
    has_more: args.current_page < totalPages,
    next_page: args.current_page < totalPages ? args.current_page + 1 : null
  };
}

function page(items, args) {
  return items.slice((args.current_page - 1) * args.page_size, args.current_page * args.page_size);
}

function getCurrency(orders) {
  const currencies = new Set(orders.map(order => order.order_currency_code || null));
  if (currencies.size > 1) {
    throw new Error('Orders have different or missing currencies. Specify currency to calculate a meaningful total.');
  }
  return currencies.values().next().value || null;
}

function revenueSummary(orders, includeTax) {
  const currency = getCurrency(orders);
  const tax = orders.reduce((sum, order) => sum + number(order.tax_amount), 0);
  const revenue = orders.reduce((sum, order) => sum + number(order.grand_total), 0) - (includeTax ? 0 : tax);
  return {
    revenue: round(revenue), currency, order_count: orders.length,
    average_order_value: orders.length ? round(revenue / orders.length) : 0,
    tax_amount: round(tax)
  };
}

function monthKeys(dateRange) {
  const months = [];
  for (let date = startOfMonth(dateRange.startDate); date <= dateRange.endDate; date = addMonths(date, 1)) {
    months.push(format(date, 'yyyy-MM'));
  }
  return months;
}

// Select the rows carrying sales value once: configurable/fixed bundle parents,
// or dynamic bundle children. Free standalone items are retained.
function salesLines(order) {
  const items = order.items || [];
  const byId = new Map(items.map(item => [String(item.item_id), item]));
  const children = new Map();
  for (const item of items) {
    if (item.parent_item_id) {
      const key = String(item.parent_item_id);
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(item);
    }
  }
  const childPriced = new Set();
  for (const [id, rows] of children) {
    const parent = byId.get(id);
    if (parent?.product_type === 'bundle' && number(parent.row_total) === 0 &&
        rows.some(item => number(item.row_total) !== 0)) childPriced.add(id);
  }
  return items.filter(item => {
    if (childPriced.has(String(item.item_id))) return false;
    return !item.parent_item_id || !byId.has(String(item.parent_item_id)) || childPriced.has(String(item.parent_item_id));
  }).map(item => ({
    order, item,
    // Categorize dynamic bundle components using the sold bundle's categories.
    catalogItem: byId.get(String(item.parent_item_id)) || item
  }));
}

function lineRevenue(item, includeTax) {
  // Magento row_total is before discount and excludes tax. Tax compensation
  // restores the tax portion of discounts when catalog prices include tax.
  return number(item.row_total) - number(item.discount_amount) + number(item.discount_tax_compensation_amount) +
    (includeTax ? number(item.tax_amount) : 0);
}

function categoryIds(product) {
  let ids = product?.custom_attributes?.find(attribute => attribute.attribute_code === 'category_ids')?.value || [];
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch { ids = ids.split(','); }
  }
  if (!Array.isArray(ids)) ids = [ids];
  return [...new Set([...ids, ...(product?.extension_attributes?.category_links || []).map(link => link.category_id)]
    .map(Number).filter(id => Number.isInteger(id) && id > 0))];
}

function orderDetails(order, includeItems = true) {
  const fields = ['entity_id', 'increment_id', 'created_at', 'status', 'store_id', 'order_currency_code',
    'grand_total', 'subtotal', 'tax_amount', 'discount_amount', 'shipping_amount', 'shipping_tax_amount',
    'total_paid', 'total_refunded', 'total_canceled', 'total_due', 'state', 'customer_id', 'customer_email',
    'customer_firstname', 'customer_lastname', 'customer_group_id', 'coupon_code', 'shipping_description',
    'billing_address', 'status_histories'];
  const result = Object.fromEntries(fields.filter(field => order[field] !== undefined).map(field => [field, order[field]]));
  if (order.payment) {
    const paymentFields = ['method', 'amount_ordered', 'amount_paid', 'amount_refunded', 'last_trans_id'];
    result.payment = Object.fromEntries(paymentFields.filter(field => order.payment[field] !== undefined).map(field => [field, order.payment[field]]));
  }
  if (order.extension_attributes?.shipping_assignments) {
    result.shipping = order.extension_attributes.shipping_assignments.map(assignment => assignment.shipping);
  }
  if (includeItems) {
    const itemFields = ['item_id', 'parent_item_id', 'product_id', 'product_type', 'sku', 'name', 'qty_ordered',
      'qty_invoiced', 'qty_shipped', 'qty_canceled', 'qty_refunded', 'price', 'price_incl_tax', 'row_total',
      'row_total_incl_tax', 'tax_amount', 'discount_amount', 'discount_tax_compensation_amount', 'amount_refunded'];
    result.items = (order.items || []).map(item => Object.fromEntries(
      itemFields.filter(field => item[field] !== undefined).map(field => [field, item[field]])
    ));
  }
  return result;
}

function registerSalesTools(server, { callMagentoApi, fetchAllPages, parseDateExpression, buildDateRangeFilter, normalizeCountry, refundService, orderDocuments }) {
  function register(name, description, schema, handler) {
    server.tool(name, description, schema, async args => {
      try { return json(await handler(args)); }
      catch (error) { return { content: [{ type: 'text', text: `Error in ${name}: ${error.message}` }], isError: true }; }
    });
  }

  function orderQuery(args) {
    const dateRange = parseDateExpression(args.date_range);
    let criteria = buildDateRangeFilter('created_at', dateRange.startDate, dateRange.endDate);
    let index = 2;
    for (const [field, value] of [['status', args.status], ['store_id', args.store_id], ['order_currency_code', args.currency]]) {
      if (value !== undefined) criteria += `&${filter(index++, field, value)}`;
    }
    return { dateRange, criteria: `${criteria}&${orderSort}` };
  }

  function queryMetadata(args, dateRange) {
    return {
      ...args, date_range: dateRange.description, status: args.status || 'All', country: args.country || 'All',
      ...(args.country ? { normalized_country: normalizeCountry(args.country).join(', ') } : {}),
      period: { start_date: format(dateRange.startDate, 'yyyy-MM-dd'), end_date: format(dateRange.endDate, 'yyyy-MM-dd') }
    };
  }

  async function loadOrders(args, criteria) {
    const orders = await fetchAllPages('/orders', criteria);
    if (!args.country) return orders;
    const countries = normalizeCountry(args.country);
    return orders.filter(order => countries.includes(order.billing_address?.country_id) ||
      (order.extension_attributes?.shipping_assignments || []).some(assignment => countries.includes(assignment.shipping?.address?.country_id)));
  }

  async function loadCategories() {
    return fetchAllPages('/categories/list', orderSort);
  }

  async function loadCatalog(lines) {
    const ids = [...new Set(lines.map(line => Number(line.catalogItem.product_id)).filter(id => id > 0))];
    const products = new Map();
    // Batch catalog requests instead of fetching one product per order line.
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = await fetchAllPages('/products', `${filter(0, 'entity_id', ids.slice(offset, offset + 100).join(','), 'in')}&${orderSort}`);
      for (const product of batch) products.set(Number(product.id), product);
    }
    const categories = await loadCategories();
    const byId = new Map(categories.map(category => [Number(category.id), category]));
    function ancestors(id) {
      const chain = [];
      const seen = new Set();
      while (byId.has(id) && !seen.has(id)) {
        seen.add(id);
        const category = byId.get(id);
        chain.push(category);
        id = Number(category.parent_id);
      }
      return chain;
    }
    return { products, byId, ancestors };
  }

  async function prepareSales(args, orders, needsCategories) {
    let lines = orders.flatMap(salesLines);
    if (args.sku !== undefined) lines = lines.filter(line => line.item.sku === args.sku);
    let catalog;
    if (needsCategories || args.category_id !== undefined) {
      catalog = await loadCatalog(lines);
      if (args.category_id !== undefined && !catalog.byId.has(args.category_id)) {
        throw new Error(`Category ${args.category_id} not found`);
      }
      for (const line of lines) {
        line.categoryIds = categoryIds(catalog.products.get(Number(line.catalogItem.product_id)));
      }
      if (args.category_id !== undefined) {
        lines = lines.filter(line => line.categoryIds.some(id => args.include_subcategories
          ? catalog.ancestors(id).some(category => Number(category.id) === args.category_id)
          : id === args.category_id));
      }
    }
    const selectedOrders = args.sku !== undefined || args.category_id !== undefined
      ? [...new Set(lines.map(line => line.order))] : orders;
    return { lines, orders: selectedOrders, catalog };
  }

  async function revenue(args) {
    const { dateRange, criteria } = orderQuery(args);
    const orders = await loadOrders(args, criteria);
    let result = revenueSummary(orders, args.include_tax);
    const refunds = args.subtract_refunds
      ? await refundService.select({ ...args, date_basis: args.refund_date_basis }, orders) : [];
    if (args.subtract_refunds) {
      result.currency = getCurrency([...orders, ...refunds.map(row => row.order)]);
      result = refundService.apply(result, refunds, args);
    }
    if (args.group_by === 'month') {
      result.periods = monthKeys(dateRange).map(month => {
        let summary = revenueSummary(orders.filter(order => order.created_at.slice(0, 7) === month), args.include_tax);
        if (args.subtract_refunds) summary = refundService.apply(summary, refunds.filter(row =>
          (args.refund_date_basis === 'order_date' ? row.order.created_at : row.memo.created_at).slice(0, 7) === month), args);
        return { month, ...summary, currency: result.currency };
      });
    }
    return {
      query: queryMetadata(args, dateRange),
      calculation: 'Order grand totals after discounts, including shipping; tax follows include_tax. All statuses included unless status is specified. With subtract_refunds, revenue/net_revenue subtract state=2 credit memos by the chosen refund_date_basis. average_order_value always describes gross baskets; net_average_order_value is only defined for an order_date cohort. Order-date refunds are all recorded refunds to date, including refunds issued after the order period.',
      result
    };
  }

  const revenueSchema = {
    ...commonSchema, ...groupingSchema,
    include_tax: z.boolean().default(true).describe('Include tax (default true)'),
    subtract_refunds: z.boolean().default(false).describe('Subtract actual credit memo amounts; gross basket AOV remains available separately'),
    refund_date_basis: z.enum(['refund_date', 'order_date']).default('refund_date').describe('Refunds issued in the period, or all recorded refunds to the selected order cohort')
  };
  register('get_revenue', 'Get revenue, order count and average order value (AOV). Use group_by=month and date_range="last 18 months" for a complete monthly trend in one call.', revenueSchema, revenue);
  register('get_revenue_by_country', 'Get revenue and average order value filtered by billing or shipping country, optionally grouped by month.', {
    ...revenueSchema, country: commonSchema.country.unwrap()
  }, revenue);

  register('get_orders', 'List all matching orders through pagination, including order lines with SKU, product ID, quantities, discounts and tax. Follow next_page for the complete list.', {
    ...commonSchema, ...paginationSchema,
    include_items: z.boolean().default(true).describe('Include order lines (default true)')
  }, async args => {
    const { dateRange, criteria } = orderQuery(args);
    let items, total;
    if (args.country) {
      const orders = await loadOrders(args, criteria);
      items = page(orders, args);
      total = orders.length;
    } else {
      const response = await callMagentoApi(`/orders?${criteria}&searchCriteria[pageSize]=${args.page_size}&searchCriteria[currentPage]=${args.current_page}`);
      if (!Array.isArray(response.items) || !Number.isInteger(Number(response.total_count)) || Number(response.total_count) < 0) throw new Error('Invalid orders response');
      items = response.items;
      total = Number(response.total_count);
      const expectedCount = Math.min(args.page_size, Math.max(0, total - (args.current_page - 1) * args.page_size));
      if (items.length !== expectedCount) throw new Error('Incomplete order page. Retry with a smaller page_size.');
    }
    return { query: queryMetadata(args, dateRange), result: { ...pagination(total, args), orders: items.map(order => orderDetails(order, args.include_items)) } };
  });

  register('get_order', 'Get one order and all its order lines by internal order ID or displayed order number (increment_id).', {
    order_id: z.number().int().positive().optional().describe('Internal Magento order entity ID; specify this OR increment_id'),
    increment_id: z.string().min(1).optional().describe('Displayed order number, preserving leading zeros; specify this OR order_id'),
    include_documents: z.boolean().default(true).describe('Include invoices, shipments/tracking and credit memos; requires read access to these documents')
  }, async args => {
    if ((args.order_id !== undefined) === (args.increment_id !== undefined)) throw new Error('Specify exactly one of order_id or increment_id');
    let order;
    if (args.order_id !== undefined) order = await callMagentoApi(`/orders/${args.order_id}`);
    else {
      const matches = await fetchAllPages('/orders', `${filter(0, 'increment_id', args.increment_id)}&${orderSort}`);
      if (matches.length > 1) throw new Error('Order number matches multiple stores; use order_id');
      order = matches[0];
    }
    if (!order?.entity_id) throw new Error('Order not found');
    return { result: { ...orderDetails(order), ...(args.include_documents ? await orderDocuments(order.entity_id) : {}) } };
  });

  register('get_categories', 'List catalog categories, with IDs, names, parent IDs and levels for sales filters. Follow next_page for the complete list.', paginationSchema, async args => {
    const categories = await loadCategories();
    return { result: { ...pagination(categories.length, args), categories: page(categories, args).map(category => ({
      id: category.id, name: category.name, parent_id: category.parent_id, level: category.level, path: category.path, is_active: category.is_active
    })) } };
  });

  register('get_product_sales', 'Get sales for EVERY sold product, not just the top 10. Paginate using next_page, filter by exact SKU or category, and sort by quantity or revenue. Totals cover all matching products, not only the returned page.', {
    ...commonSchema, ...productFilterSchema, ...paginationSchema,
    include_tax: z.boolean().default(false).describe('Include item tax in product revenue (default false); revenue is after discounts, excluding shipping'),
    sort_by: z.enum(['quantity', 'revenue', 'sku']).default('quantity'),
    sort_direction: z.enum(['asc', 'desc']).default('desc')
  }, async args => {
    const { dateRange, criteria } = orderQuery(args);
    const selection = await prepareSales(args, await loadOrders(args, criteria), false);
    const summary = revenueSummary(selection.orders, true);
    const products = new Map();
    let totalQuantity = 0, productRevenue = 0;
    for (const { item, order } of selection.lines) {
      const key = item.sku || `product-id:${item.product_id ?? 'unknown'}`;
      if (!products.has(key)) products.set(key, { sku: item.sku || null, product_id: item.product_id || null, name: item.name, quantity: 0, revenue: 0, orders: new Set() });
      const product = products.get(key);
      const amount = lineRevenue(item, args.include_tax);
      product.quantity += number(item.qty_ordered);
      product.revenue += amount;
      product.orders.add(order.entity_id);
      totalQuantity += number(item.qty_ordered);
      productRevenue += amount;
    }
    const rows = [...products.values()].map(({ orders, ...product }) => ({
      ...product, quantity: quantity(product.quantity), revenue: round(product.revenue), order_count: orders.size
    }));
    rows.sort((a, b) => {
      const compared = args.sort_by === 'sku' ? String(a.sku).localeCompare(String(b.sku)) : a[args.sort_by] - b[args.sort_by];
      return (args.sort_direction === 'asc' ? compared : -compared) || String(a.sku).localeCompare(String(b.sku));
    });
    return {
      query: queryMetadata(args, dateRange),
      calculation: 'Product revenue = row_total - discount_amount + discount_tax_compensation_amount, plus tax_amount if include_tax. Shipping excluded. Quantities are ordered quantities, not net of cancellations/refunds. Parent/child lines are counted once. total_revenue is the full grand total of matching orders, including other products, tax and shipping.',
      result: {
        ...pagination(rows.length, args), currency: summary.currency, total_orders: summary.order_count,
        total_order_items: selection.lines.length, total_product_quantity: quantity(totalQuantity),
        average_products_per_order: summary.order_count ? round(totalQuantity / summary.order_count) : 0,
        total_revenue: summary.revenue, product_revenue: round(productRevenue),
        average_revenue_per_product: totalQuantity ? round(productRevenue / totalQuantity) : 0,
        products: page(rows, args),
        top_products: [...rows].sort((a, b) => b.quantity - a.quantity || String(a.sku).localeCompare(String(b.sku))).slice(0, 10)
      }
    };
  });

  register('get_category_sales', 'Get complete sales by product category: revenue, allocated quantity, distinct orders and category revenue per order. Use group_by=month for trends across e.g. last 18 months. Uses all order lines and current catalog membership, not top products.', {
    ...commonSchema, ...productFilterSchema, ...paginationSchema, ...groupingSchema,
    include_tax: z.boolean().default(false).describe('Include item tax in category revenue (default false); shipping excluded'),
    category_level: z.number().int().min(2).default(2).describe('Magento category level to report; 2 = main categories below the store root. Products without a category at this level appear as Uncategorized.')
  }, async args => {
    const { dateRange, criteria } = orderQuery(args);
    const selection = await prepareSales(args, await loadOrders(args, criteria), true);
    const currency = getCurrency(selection.orders);
    const buckets = new Map();
    const months = monthKeys(dateRange);
    let totalRevenue = 0, totalQuantity = 0;
    for (const { item, order, categoryIds: ids } of selection.lines) {
      const matches = [...new Set(ids.flatMap(id => selection.catalog.ancestors(id))
        .filter(category => Number(category.level) === args.category_level).map(category => Number(category.id)))];
      if (!matches.length) matches.push(null);
      const revenue = lineRevenue(item, args.include_tax);
      totalRevenue += revenue;
      totalQuantity += number(item.qty_ordered);
      for (const id of matches) {
        if (!buckets.has(id)) buckets.set(id, { category_id: id, name: selection.catalog.byId.get(id)?.name || 'Uncategorized', revenue: 0, quantity: 0, orders: new Set(), periods: new Map() });
        const bucket = buckets.get(id);
        const month = order.created_at.slice(0, 7);
        if (!bucket.periods.has(month)) bucket.periods.set(month, { revenue: 0, quantity: 0, orders: new Set() });
        for (const target of [bucket, bucket.periods.get(month)]) {
          target.revenue += revenue / matches.length;
          target.quantity += number(item.qty_ordered) / matches.length;
          target.orders.add(order.entity_id);
        }
      }
    }
    function metrics(bucket) {
      return { revenue: round(bucket.revenue), quantity: quantity(bucket.quantity), order_count: bucket.orders.size,
        average_order_value: bucket.orders.size ? round(bucket.revenue / bucket.orders.size) : 0 };
    }
    const categories = [...buckets.values()].sort((a, b) => b.revenue - a.revenue || (a.category_id ?? 0) - (b.category_id ?? 0));
    const result = {
      ...pagination(categories.length, args), currency,
      total_orders: selection.orders.length, total_product_quantity: quantity(totalQuantity), product_revenue: round(totalRevenue),
      categories: page(categories, args).map(bucket => ({ category_id: bucket.category_id, name: bucket.name, ...metrics(bucket) }))
    };
    if (args.group_by === 'month') result.periods = months.map(month => ({
      month,
      categories: page(categories, args).map(bucket => ({ category_id: bucket.category_id, name: bucket.name,
        ...metrics(bucket.periods.get(month) || { revenue: 0, quantity: 0, orders: new Set() }) }))
    }));
    return {
      query: queryMetadata(args, dateRange),
      calculation: {
        revenue: 'Ordered item amounts after discounts; tax follows include_tax; shipping excluded; cancellations/refunds are not subtracted. All statuses included unless filtered.',
        category_membership: 'Current catalog membership, not historical. Configurable/fixed bundle parents are counted once; dynamic bundle children use bundle categories. Missing/deleted products or missing category level are Uncategorized.',
        allocation: 'Revenue and quantity split equally across distinct categories at category_level. Distinct order counts can overlap across categories; rounded category values can differ from totals by rounding.',
        average_order_value: 'Allocated category revenue divided by distinct orders containing that category; this is the category contribution, not the full basket value.',
        pagination: 'Totals cover all categories; categories and each monthly categories array contain the requested page. Follow next_page.'
      },
      result
    };
  });
}

module.exports = {
  registerSalesTools, commonSchema, paginationSchema, groupingSchema, productFilterSchema,
  filter, orderSort, pagination, page, number, round, quantity, json, getCurrency,
  revenueSummary, monthKeys, salesLines, lineRevenue, categoryIds, orderDetails
};

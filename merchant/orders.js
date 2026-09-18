const { id, optionalDate, paginationSchema, pick } = require('./common');

function createOrderDocuments(ctx) {
  return async orderId => {
    const criteria = ctx.criteria({}, 'created_at', [['order_id', orderId]]);
    const [invoices, shipments, creditMemos] = await Promise.all([
      ctx.all('/invoices', criteria), ctx.all('/shipments', criteria), ctx.all('/creditmemos', criteria)
    ]);
    return { invoices, shipments, credit_memos: creditMemos };
  };
}

function registerOrderTools(ctx) {
  ctx.register('get_order_tracking', 'Get shipments and tracking numbers for an order. This is Magento shipment data, not live carrier delivery status.', { order_id: id() }, async ({ order_id }) => {
    // Validate the order so an unknown ID does not look like an unshipped order.
    await ctx.api(`/orders/${order_id}`);
    const shipments = await ctx.all('/shipments', ctx.criteria({}, 'created_at', [['order_id', order_id]]));
    return { result: { order_id, shipment_count: shipments.length, shipments: shipments.map(shipment => ({
      ...pick(shipment, ['entity_id', 'increment_id', 'created_at', 'total_qty', 'items']),
      tracks: (shipment.tracks || []).map(track => pick(track, ['entity_id', 'carrier_code', 'title', 'track_number', 'created_at']))
    })) } };
  });
  ctx.register('get_invoices', 'List invoices and invoice lines by issue period, order or state. Includes paid/open/canceled invoice state and monetary amounts.', {
    date_range: optionalDate, order_id: id().optional(), state: require('./common').z.number().int().min(1).max(3).optional(), ...paginationSchema
  }, async args => ({ query: args, result: ctx.paged(await ctx.all('/invoices', ctx.criteria(args, 'created_at', [
    ['order_id', args.order_id], ['state', args.state]
  ])), args, 'invoices') }));
}

module.exports = { createOrderDocuments, registerOrderTools };

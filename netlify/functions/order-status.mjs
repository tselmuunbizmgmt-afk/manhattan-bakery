import { ORDERS_STORE, json, normalizePhone, clean } from './_shared.mjs';

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const url = new URL(req.url);
  const id = clean(url.searchParams.get('id'), 60).toUpperCase();
  const phone = normalizePhone(url.searchParams.get('phone'));
  if (!id || !phone) return json({ error: 'Order number and phone are required.' }, 400);
  const order = await ORDERS_STORE().get(id, { type: 'json' });
  if (!order || normalizePhone(order.phone).replace(/\D/g,'').slice(-8) !== phone.replace(/\D/g,'').slice(-8)) {
    return json({ error: 'Order not found. Check the order number and phone.' }, 404);
  }
  return json({
    id: order.id, status: order.status, paymentStatus: order.paymentStatus || 'unknown', updatedAt: order.updatedAt, createdAt: order.createdAt,
    fulfillment: order.fulfillment, total: order.total,
    items: order.items.map(({name,qty}) => ({ name, qty }))
  });
};

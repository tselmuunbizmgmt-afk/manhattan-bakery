import { ORDERS_STORE, STATUSES, json, clean, sendEmail, baseEmail, statusLabel, money } from './_shared.mjs';
function authorized(req){return clean(req.headers.get('x-admin-secret'),300) === clean(Netlify.env.get('ADMIN_ORDER_SECRET'),300) && !!Netlify.env.get('ADMIN_ORDER_SECRET');}
export default async (req) => {
  if (req.method !== 'POST') return json({ error:'Method not allowed' },405);
  if (!authorized(req)) return json({ error:'Unauthorized' },401);
  try {
    const body = await req.json();
    const id = clean(body.id,60).toUpperCase();
    const status = clean(body.status,40);
    if (!STATUSES.includes(status)) return json({ error:'Invalid status' },400);
    const store = ORDERS_STORE();
    const order = await store.get(id,{type:'json',consistency:'strong'});
    if (!order) return json({ error:'Order not found' },404);
    if (order.paymentStatus !== 'paid' && status !== 'cancelled') return json({ error:'This order is not confirmed as paid yet.' },409);
    order.status = status; order.updatedAt = new Date().toISOString();
    await store.setJSON(id, order, { metadata:{status,createdAt:order.createdAt} });
    await sendEmail({
      to: order.email,
      subject: `${statusLabel(status)} — ${id}`,
      idempotencyKey: `order-status-${id}-${status}-${order.updatedAt.slice(0,16)}`,
      html: baseEmail(`<h1 style="font-size:26px;margin-top:0">${statusLabel(status)}</h1><p style="color:#aaa">Order <strong style="color:#fff">${id}</strong></p><p style="font-size:18px"><strong>Total: ${money(order.total)}</strong></p><p style="color:#aaa;line-height:1.7">We’ll keep this status updated as your order moves forward.</p>`)
    }).catch(err=>console.error('Status email failed',err));
    return json({ ok:true, order });
  } catch(error){ console.error(error); return json({error:'Could not update order'},500); }
};

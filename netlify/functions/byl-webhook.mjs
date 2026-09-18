import crypto from 'node:crypto';
import { ORDERS_STORE, json, clean, sendEmail, baseEmail, money, SITE_URL } from './_shared.mjs';

function validSignature(rawBody, received, secret) {
  if (!received || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(computed);
  const b = Buffer.from(String(received));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const rawBody = await req.text();
  const secret = Netlify.env.get('BYL_WEBHOOK_SECRET') || '';
  const signature = req.headers.get('Byl-Signature') || req.headers.get('byl-signature') || '';
  if (!validSignature(rawBody, signature, secret)) return json({ error: 'Invalid signature' }, 401);

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }

  try {
    if (event.type === 'checkout.completed') {
      const checkout = event?.data?.object || {};
      const id = clean(checkout.client_reference_id, 60).toUpperCase();
      if (!id) return json({ ok: true });

      const store = ORDERS_STORE();
      const order = await store.get(id, { type: 'json' });
      if (!order) return json({ ok: true });

      if (order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.status = 'received';
        order.paidAt = new Date().toISOString();
        order.updatedAt = order.paidAt;
        order.bylCheckoutId = checkout.id || order.bylCheckoutId;
        order.bylAmountTotal = Number(checkout.amount_total ?? order.total);
        await store.setJSON(id, order, { metadata: { status: order.status, createdAt: order.createdAt } });

        const lines = order.items.map(x => `<tr><td style="padding:7px 0;color:#ddd">${x.qty} × ${x.name}</td><td style="padding:7px 0;text-align:right;color:#fff">${money(x.lineTotal)}</td></tr>`).join('');
        const trackUrl = `${SITE_URL}?track=${encodeURIComponent(id)}`;
        const customerHtml = baseEmail(`
          <h1 style="font-size:26px;margin:0 0 8px">Payment received.</h1>
          <p style="color:#aaa;margin:0 0 22px">Order <strong style="color:#fff">${id}</strong></p>
          <table style="width:100%;border-collapse:collapse">${lines}</table>
          ${order.discount ? `<p style="color:#aaa">Discount: −${money(order.discount)}</p>` : ''}
          <p style="font-size:20px"><strong>Total paid: ${money(order.total)}</strong></p>
          <p style="color:#aaa;line-height:1.6">${order.fulfillment === 'delivery' ? `Delivery to: ${order.address}` : 'Pickup order.'}</p>
          <a href="${trackUrl}" style="display:inline-block;margin-top:14px;background:#f3efe6;color:#080808;text-decoration:none;padding:13px 18px;border-radius:999px;font-size:12px;font-weight:bold">CHECK ORDER STATUS</a>
        `);

        const sends = [sendEmail({
          to: order.email,
          subject: `Payment received — ${id}`,
          html: customerHtml,
          idempotencyKey: `paid-${id}`
        })];

        if (Netlify.env.get('ORDER_NOTIFICATION_EMAIL')) {
          sends.push(sendEmail({
            to: Netlify.env.get('ORDER_NOTIFICATION_EMAIL'),
            subject: `PAID order — ${id}`,
            replyTo: order.email,
            idempotencyKey: `owner-paid-${id}`,
            html: baseEmail(`<h1 style="font-size:24px;margin-top:0">Paid order ${id}</h1><p>${order.name} • ${order.phone} • ${order.email}</p><table style="width:100%">${lines}</table><p><strong>${money(order.total)}</strong> • ${order.fulfillment}</p><p>${order.address || 'Pickup'}<br>${order.notes || ''}</p><p>Open <strong>/ops.html</strong> to manage fulfillment.</p>`)
          }));
        }
        await Promise.allSettled(sends);
      }
    }

    if (event.type === 'payment.awaiting_verification') {
      const payment = event?.data?.object || {};
      const checkoutId = payment?.payable?.id;
      if (checkoutId) {
        const store = ORDERS_STORE();
        const { blobs } = await store.list();
        for (const blob of blobs.slice(-150).reverse()) {
          const order = await store.get(blob.key, { type: 'json' });
          if (order && String(order.bylCheckoutId) === String(checkoutId)) {
            order.paymentStatus = 'pending_verification';
            order.status = 'pending_verification';
            order.updatedAt = new Date().toISOString();
            await store.setJSON(order.id, order, { metadata: { status: order.status, createdAt: order.createdAt } });
            break;
          }
        }
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Webhook processing error', error);
    return json({ error: 'Webhook processing failed' }, 500);
  }
};

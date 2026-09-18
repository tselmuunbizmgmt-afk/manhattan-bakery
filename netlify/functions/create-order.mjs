import { ORDERS_STORE, SUBSCRIBERS_STORE, CATALOG, PROMOS, json, clean, normalizePhone, normalizeEmail, validEmail, orderId, subscriberKey, sendEmail, baseEmail, money } from './_shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const name = clean(body.name, 100);
    const phone = normalizePhone(body.phone);
    const email = normalizeEmail(body.email);
    const address = clean(body.address, 250);
    const notes = clean(body.notes, 500);
    const fulfillment = body.fulfillment === 'pickup' ? 'pickup' : 'delivery';
    const marketingOptIn = body.marketingOptIn === true;
    const promo = clean(body.promo, 40).toUpperCase();
    const requested = Array.isArray(body.items) ? body.items : [];

    if (!name || phone.replace(/\D/g, '').length < 8 || !validEmail(email)) {
      return json({ error: 'Please enter a valid name, phone number and email.' }, 400);
    }
    if (fulfillment === 'delivery' && !address) {
      return json({ error: 'Delivery address is required.' }, 400);
    }
    if (!requested.length) return json({ error: 'Your bag is empty.' }, 400);

    const items = [];
    for (const row of requested) {
      const itemName = clean(row.name, 100);
      const price = CATALOG[itemName];
      const qty = Math.max(1, Math.min(12, Number.parseInt(row.qty, 10) || 1));
      if (!price) return json({ error: `Unavailable item: ${itemName}` }, 400);
      items.push({ name: itemName, price, qty, lineTotal: price * qty });
    }

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountPct = PROMOS[promo] || 0;
    const discount = Math.round(subtotal * discountPct);
    const total = subtotal - discount;
    const id = orderId();
    const now = new Date().toISOString();
    const paymentStatus = fulfillment === 'pickup' ? 'pay_on_pickup' : 'pay_on_delivery';

    const order = {
      id,
      createdAt: now,
      updatedAt: now,
      status: 'received',
      paymentStatus,
      paymentMethod: fulfillment === 'pickup' ? 'pay_on_pickup' : 'cash_on_delivery',
      name,
      phone,
      email,
      address: fulfillment === 'delivery' ? address : '',
      notes,
      fulfillment,
      items,
      promo: discountPct ? promo : '',
      subtotal,
      discount,
      total,
      marketingOptIn
    };

    const store = ORDERS_STORE();
    await store.setJSON(id, order);

    if (marketingOptIn) {
      const subscriberStore = SUBSCRIBERS_STORE();
      const key = subscriberKey(email);
      const existing = await subscriberStore.get(key, { type: 'json' });
      await subscriberStore.setJSON(key, {
        email,
        name,
        token: existing?.token || crypto.randomUUID(),
        active: true,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        source: 'checkout'
      });
    }

    await sendEmail({
      to: email,
      subject: `Order received — ${id}`,
      idempotencyKey: `order-received-${id}`,
      html: baseEmail(`
        <h1 style="font-size:26px;margin-top:0">Order received.</h1>
        <p style="color:#aaa">Order <strong style="color:#fff">${id}</strong></p>
        <p style="font-size:18px"><strong>Total: ${money(total)}</strong></p>
        <p style="color:#aaa;line-height:1.7">${fulfillment === 'pickup' ? 'Payment is due when you collect your order.' : 'Payment is due when your order is delivered.'}</p>
      `)
    }).catch((error) => console.error('Order confirmation email skipped/failed', error));

    const ownerEmail = Netlify.env.get('ORDER_NOTIFICATION_EMAIL');
    if (ownerEmail) {
      await sendEmail({
        to: ownerEmail,
        subject: `New order — ${id}`,
        replyTo: email,
        idempotencyKey: `owner-new-order-${id}`,
        html: baseEmail(`
          <h1 style="font-size:24px;margin-top:0">New order ${id}</h1>
          <p>${name} • ${phone} • ${email}</p>
          <p><strong>${money(total)}</strong> • ${fulfillment}</p>
          <p>${fulfillment === 'delivery' ? address : 'Pickup'}<br>${notes || ''}</p>
        `)
      }).catch((error) => console.error('Owner order email skipped/failed', error));
    }

    return json({
      ok: true,
      order: {
        id,
        status: order.status,
        paymentStatus,
        fulfillment,
        total,
        items: items.map(({ name, qty }) => ({ name, qty }))
      }
    });
  } catch (error) {
    console.error('Create order error', error);
    return json({ error: 'Could not place your order. Please try again.' }, 500);
  }
};

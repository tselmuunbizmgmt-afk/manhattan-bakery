import { ORDERS_STORE, SUBSCRIBERS_STORE, CATALOG, PROMOS, SITE_URL, json, clean, normalizePhone, normalizeEmail, validEmail, orderId, subscriberKey } from './_shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const projectId = clean(Netlify.env.get('BYL_PROJECT_ID'), 120);
    const token = clean(Netlify.env.get('BYL_TOKEN'), 500);
    if (!projectId || !token) return json({ error: 'Online payment is not configured yet.' }, 503);

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
    if (fulfillment === 'delivery' && !address) return json({ error: 'Delivery address is required.' }, 400);
    if (!requested.length) return json({ error: 'Your bag is empty.' }, 400);

    const items = [];
    for (const row of requested) {
      const itemName = clean(row.name, 100);
      const price = CATALOG[itemName];
      const qty = Math.max(1, Math.min(12, Number.parseInt(row.qty, 10) || 1));
      if (!price) return json({ error: `Unavailable item: ${itemName}` }, 400);
      items.push({ name: itemName, price, qty, lineTotal: price * qty });
    }

    const subtotal = items.reduce((sum, x) => sum + x.lineTotal, 0);
    const discountPct = PROMOS[promo] || 0;
    const discount = Math.round(subtotal * discountPct);
    const total = subtotal - discount;
    const id = orderId();
    const now = new Date().toISOString();

    const order = {
      id, createdAt: now, updatedAt: now,
      status: 'awaiting_payment', paymentStatus: 'awaiting_payment',
      name, phone, email,
      address: fulfillment === 'delivery' ? address : '',
      notes, fulfillment, paymentMethod: 'byl', items,
      promo: discountPct ? promo : '',
      subtotal, discount, total, marketingOptIn,
      bylCheckoutId: null
    };

    await ORDERS_STORE().setJSON(id, order, { metadata: { status: order.status, createdAt: now } });

    if (marketingOptIn) {
      const tokenId = crypto.randomUUID();
      await SUBSCRIBERS_STORE().setJSON(subscriberKey(email), {
        email, name, token: tokenId, active: true, createdAt: now, source: 'checkout'
      });
    }

    const bylPayload = {
      success_url: `${SITE_URL}/?payment=success&order=${encodeURIComponent(id)}`,
      cancel_url: `${SITE_URL}/?payment=cancelled&order=${encodeURIComponent(id)}`,
      customer_email: email,
      client_reference_id: id,
      phone_number_collection: false,
      email_collection: false,
      delivery_address_collection: false,
      items: items.map(x => ({
        price_data: {
          unit_amount: x.price,
          product_data: {
            name: x.name,
            client_reference_id: x.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 120)
          }
        },
        quantity: x.qty
      }))
    };

    if (discount > 0) bylPayload.discounts = [{ amount: discount, description: `${promo} discount` }];

    const response = await fetch(`https://byl.mn/api/v1/projects/${encodeURIComponent(projectId)}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bylPayload)
    });

    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok || !data?.data?.url || !data?.data?.id) {
      order.status = 'payment_error';
      order.paymentStatus = 'payment_error';
      order.updatedAt = new Date().toISOString();
      await ORDERS_STORE().setJSON(id, order, { metadata: { status: order.status, createdAt: now } });
      console.error('BYL checkout error', response.status, data);
      return json({ error: 'Payment checkout could not be created. Please try again.' }, 502);
    }

    order.bylCheckoutId = data.data.id;
    order.updatedAt = new Date().toISOString();
    await ORDERS_STORE().setJSON(id, order, { metadata: { status: order.status, createdAt: now } });

    return json({ ok: true, order: { id, total, fulfillment }, checkoutUrl: data.data.url });
  } catch (error) {
    console.error(error);
    return json({ error: 'We could not start payment. Please try again.' }, 500);
  }
};

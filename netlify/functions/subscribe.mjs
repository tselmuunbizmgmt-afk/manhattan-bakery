import { SUBSCRIBERS_STORE, json, clean, normalizeEmail, validEmail, subscriberKey, sendEmail, baseEmail, SITE_URL } from './_shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json();
    const name = clean(body.name, 100);
    const email = normalizeEmail(body.email);
    if (!validEmail(email) || body.consent !== true) return json({ error: 'A valid email and consent are required.' }, 400);
    const store = SUBSCRIBERS_STORE();
    const key = subscriberKey(email);
    const existing = await store.get(key, { type: 'json' });
    const token = existing?.token || crypto.randomUUID();
    const entry = { email, name, token, active: true, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'welcome-popup' };
    await store.setJSON(key, entry);
    const unsub = `${SITE_URL}/.netlify/functions/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: 'You’re on the Manhattan Bakery list',
      idempotencyKey: `welcome-${email}`,
      html: baseEmail(`<h1 style="font-size:26px;margin-top:0">Welcome${name ? `, ${name}` : ''}.</h1><p style="color:#aaa;line-height:1.7">You’ll hear about our grand opening, new weekly muffin drops and limited releases.</p><p style="font-size:18px"><strong>A little taste of Manhattan in every sip & bite.</strong></p><p style="margin-top:30px"><a href="${unsub}" style="color:#777;font-size:11px">Unsubscribe</a></p>`)
    }).catch(err => console.error('Welcome email failed', err));
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Could not subscribe right now.' }, 500);
  }
};

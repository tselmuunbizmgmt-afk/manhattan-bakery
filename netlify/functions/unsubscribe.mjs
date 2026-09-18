import { SUBSCRIBERS_STORE, subscriberKey, normalizeEmail, clean } from './_shared.mjs';
export default async (req) => {
  const url = new URL(req.url);
  const email = normalizeEmail(url.searchParams.get('email'));
  const token = clean(url.searchParams.get('token'), 100);
  const store = SUBSCRIBERS_STORE();
  const key = subscriberKey(email);
  const entry = await store.get(key, { type:'json' });
  if (entry && entry.token === token) {
    entry.active = false; entry.updatedAt = new Date().toISOString();
    await store.setJSON(key, entry);
    return new Response('<!doctype html><body style="background:#080808;color:white;font-family:Arial;padding:60px"><h1>Unsubscribed.</h1><p>You will no longer receive Manhattan Bakery marketing emails.</p></body>', { headers:{'Content-Type':'text/html;charset=utf-8'} });
  }
  return new Response('Invalid unsubscribe link.', { status:400 });
};

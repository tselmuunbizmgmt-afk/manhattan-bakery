import { getStore } from '@netlify/blobs';

export const SITE_URL = 'https://manhattanbakery.online';
export const ORDERS_STORE = () => getStore({ name: 'manhattan-orders', consistency: 'strong' });
export const SUBSCRIBERS_STORE = () => getStore({ name: 'manhattan-subscribers', consistency: 'strong' });

export const CATALOG = Object.freeze({
  'Fifth Avenue Blackout': 15900,
  'Brooklyn Berry Cheesecake': 15900,
  'SoHo Pistachio Cloud': 16900,
  'Empire Salted Caramel': 15900,
  'Central Park Lemon Poppy': 14900,
  'Tribeca Tiramisu Muffin': 16900,
  'Broadway Cinnamon Crumb': 15900,
  'Chelsea Strawberry Matcha Muffin': 16900,
  'Manhattan Classic Blueberry': 13900,
  'Madison Double Chocolate': 14900
});

export const PROMOS = Object.freeze({ MANHATTAN10: 0.10, DROP5: 0.05 });
export const STATUSES = ['received','preparing','ready','out_for_delivery','delivered','cancelled'];

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function clean(value, max = 500) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
}
export function normalizePhone(value) { return clean(value, 40).replace(/[^0-9+]/g, ''); }
export function normalizeEmail(value) { return clean(value, 180).toLowerCase(); }
export function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function money(n) { return `₮${Math.round(n).toLocaleString('en-US')}`; }

export function orderId() {
  const day = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
  return `MB-${day}-${random}`;
}
export function subscriberKey(email) { return `subscriber-${email.replace(/[^a-z0-9@._+-]/gi, '_')}`; }

export async function sendEmail({ to, subject, html, replyTo, idempotencyKey }) {
  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const from = Netlify.env.get('FROM_EMAIL') || 'The Manhattan Bakery <orders@manhattanbakery.online>';
  if (!apiKey || !to) return { skipped: true };
  const body = { from, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) body.reply_to = replyTo;
  const headers = { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch('https://api.resend.com/emails', { method:'POST', headers, body:JSON.stringify(body) });
  let data=null; try { data=await res.json(); } catch {}
  if (!res.ok) throw new Error(`Email provider error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export function baseEmail(inner) {
  return `<!doctype html><html><body style="margin:0;background:#080808;color:#f5f2eb;font-family:Arial,Helvetica,sans-serif"><div style="max-width:640px;margin:auto;padding:36px 24px"><div style="font-size:12px;letter-spacing:.25em;text-transform:uppercase;color:#aaa">THE MANHATTAN BAKERY</div><div style="margin-top:22px;padding:28px;border:1px solid #2a2a2a;border-radius:18px;background:#0e0e0e">${inner}</div><p style="color:#666;font-size:11px;line-height:1.6;margin-top:24px">New York roots. Ulaanbaatar made.<br>${SITE_URL}</p></div></body></html>`;
}

export function statusLabel(status) {
  return ({received:'Order received',preparing:'Preparing your order',ready:'Ready',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'})[status] || status;
}

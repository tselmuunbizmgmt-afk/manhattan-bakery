import { ORDERS_STORE, json, clean } from './_shared.mjs';
function authorized(req){return clean(req.headers.get('x-admin-secret'),300) === clean(Netlify.env.get('ADMIN_ORDER_SECRET'),300) && !!Netlify.env.get('ADMIN_ORDER_SECRET');}
export default async (req) => {
  if (!authorized(req)) return json({ error:'Unauthorized' },401);
  const store = ORDERS_STORE();
  const { blobs } = await store.list();
  const recent = blobs.slice(-100).reverse();
  const orders = (await Promise.all(recent.map(x=>store.get(x.key,{type:'json',consistency:'strong'})))).filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ orders });
};

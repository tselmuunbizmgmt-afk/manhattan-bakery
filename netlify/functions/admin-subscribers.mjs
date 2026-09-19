import { SUBSCRIBERS_STORE, json, clean } from './_shared.mjs';

function authorized(req) {
  const configured = Netlify.env.get('ADMIN_ORDER_SECRET');
  return !!configured && clean(req.headers.get('x-admin-secret'), 300) === clean(configured, 300);
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    const store = SUBSCRIBERS_STORE();
    const { blobs } = await store.list();
    const subscribers = (await Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json' }))))
      .filter(entry => entry?.email)
      .map(entry => ({
        name: entry.name || '',
        email: entry.email,
        active: entry.active === true,
        createdAt: entry.createdAt || '',
        source: entry.source || ''
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return json({
      subscribers,
      activeCount: subscribers.filter(entry => entry.active).length
    });
  } catch (error) {
    console.error('Cannot list subscribers', error);
    return json({ error: 'Could not load subscribers.' }, 500);
  }
};

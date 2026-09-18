import { SUBSCRIBERS_STORE, json, clean, sendEmail, baseEmail, SITE_URL } from './_shared.mjs';
function authorized(req){return clean(req.headers.get('x-admin-secret'),300) === clean(Netlify.env.get('ADMIN_ORDER_SECRET'),300) && !!Netlify.env.get('ADMIN_ORDER_SECRET');}
export default async (req) => {
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  if (!authorized(req)) return json({error:'Unauthorized'},401);
  try {
    const body = await req.json();
    const subject = clean(body.subject,140), heading = clean(body.heading,160), message = clean(body.message,1800), cta = clean(body.cta,80) || 'See the latest drop';
    if (!subject || !heading || !message) return json({error:'Subject, heading and message are required'},400);
    const store = SUBSCRIBERS_STORE();
    const { blobs } = await store.list();
    const subscribers = (await Promise.all(blobs.map(x=>store.get(x.key,{type:'json'})))).filter(x=>x?.active && x?.email);
    let sent = 0;
    for (let i=0;i<subscribers.length;i+=10) {
      const batch = subscribers.slice(i,i+10);
      const results = await Promise.allSettled(batch.map(s=>{
        const unsub=`${SITE_URL}/.netlify/functions/unsubscribe?email=${encodeURIComponent(s.email)}&token=${encodeURIComponent(s.token)}`;
        return sendEmail({to:s.email,subject,html:baseEmail(`<h1 style="font-size:26px;margin-top:0">${heading}</h1><p style="color:#aaa;line-height:1.8;white-space:pre-line">${message}</p><a href="${SITE_URL}" style="display:inline-block;margin-top:14px;background:#f3efe6;color:#080808;text-decoration:none;padding:13px 18px;border-radius:999px;font-size:12px;font-weight:bold">${cta}</a><p style="margin-top:30px"><a href="${unsub}" style="color:#777;font-size:11px">Unsubscribe</a></p>`)});
      }));
      sent += results.filter(r=>r.status==='fulfilled').length;
    }
    return json({ok:true,sent,total:subscribers.length});
  } catch(error){console.error(error);return json({error:'Broadcast failed'},500);}
};

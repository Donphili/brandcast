import { db, PLANS } from './_lib.js';

const E = process.env;
const GRAPH = E.FB_GRAPH_VERSION || 'v21.0';

const copy = (ad) => [ad.business_name, ad.description,
  ad.phone && `Phone: ${ad.phone}`, ad.email && `Email: ${ad.email}`, ad.website && `Web: ${ad.website}`]
  .filter(Boolean).join('\n\n');

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

// Working connectors post from Brandcast's own accounts. Every other platform stays "not_connected"
// until its API access is approved and a connector is added here.
const connectors = {
  async Telegram(ad) {
    if (!E.TELEGRAM_BOT_TOKEN || !E.TELEGRAM_CHANNEL_ID) return { status: 'not_connected' };
    const img = ad.logo_url || ad.photo_urls?.[0];
    const j = await post(`https://api.telegram.org/bot${E.TELEGRAM_BOT_TOKEN}/${img ? 'sendPhoto' : 'sendMessage'}`,
      img ? { chat_id: E.TELEGRAM_CHANNEL_ID, photo: img, caption: copy(ad).slice(0, 1000) } : { chat_id: E.TELEGRAM_CHANNEL_ID, text: copy(ad) });
    return j.ok ? { status: 'posted', id: String(j.result.message_id) } : { status: 'failed', error: j.description };
  },
  async Facebook(ad) {
    if (!E.FACEBOOK_PAGE_ID || !E.FACEBOOK_PAGE_TOKEN) return { status: 'not_connected' };
    const img = ad.logo_url || ad.photo_urls?.[0];
    const j = await post(`https://graph.facebook.com/${GRAPH}/${E.FACEBOOK_PAGE_ID}/${img ? 'photos' : 'feed'}`,
      img ? { url: img, caption: copy(ad), access_token: E.FACEBOOK_PAGE_TOKEN } : { message: copy(ad), access_token: E.FACEBOOK_PAGE_TOKEN });
    return j.id ? { status: 'posted', id: String(j.id) } : { status: 'failed', error: j.error?.message };
  },
};

// Posts a paid ad to the channels its plan allows. The ad goes live only if at least one post succeeds.
export async function publishAd(adId) {
  const { data: ad } = await db.from('ads').select('*').eq('id', adId).single();
  if (!ad || ad.status !== 'paid') return;
  const P = PLANS[ad.plan];
  let posted = 0;
  for (const ch of (ad.channels || []).slice(0, P.channels)) {
    let out;
    try { out = connectors[ch] ? await connectors[ch](ad) : { status: 'not_connected' }; }
    catch (e) { out = { status: 'failed', error: String(e.message || e) }; }
    if (out.status === 'posted') posted++;
    await db.from('ad_posts').upsert({ ad_id: ad.id, channel: ch, status: out.status, external_id: out.id || null, error: out.error || null }, { onConflict: 'ad_id,channel' });
  }
  let end = Date.now() + P.days * 864e5;
  if (ad.origin === 'trial' && ad.expires_at) end = Math.min(end, Date.parse(ad.expires_at));
  if (posted) await db.from('ads').update({ status: 'live', expires_at: new Date(end).toISOString() }).eq('id', ad.id).eq('status', 'paid');
}

import { db } from '../_lib.js';
import { publishAd } from '../_social.js';

// Ends finished ads, then retries approved or paid ads that are not live yet. Vercel Cron calls this daily with the CRON_SECRET.
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  // End ads whose time is up (free-trial ads end when the trial ends).
  await db.from('ads').update({ status: 'expired' }).eq('status', 'live').lt('expires_at', new Date().toISOString());
  const { data } = await db.from('ads').select('id').eq('status', 'paid').limit(25);
  for (const ad of data || []) await publishAd(ad.id);
  res.json({ processed: (data || []).length });
}

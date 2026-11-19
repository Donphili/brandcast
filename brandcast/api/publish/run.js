import { db } from '../_lib.js';
import { publishAd } from '../_social.js';

// Retries paid ads that are not live yet. Vercel Cron calls this daily with the CRON_SECRET.
export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  const { data } = await db.from('ads').select('id').eq('status', 'paid').limit(25);
  for (const ad of data || []) await publishAd(ad.id);
  res.json({ processed: (data || []).length });
}

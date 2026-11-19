import { db, PLANS, TRIAL_PLAN, userFrom, ownedAd } from '../_lib.js';

// Submits an ad during the free trial. It waits for the owner's review before anything is posted.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const { data: prof } = await db.from('profiles').select('free_until').eq('id', user.id).single();
  if (!prof || Date.parse(prof.free_until) <= Date.now()) {
    return res.status(402).json({ error: 'Your free trial has ended. Choose a plan to publish.' });
  }
  const ad = await ownedAd(user, req.body?.adId);
  if (!ad) return res.status(400).json({ error: 'Ad not found.' });
  if (!['draft', 'awaiting_payment'].includes(ad.status)) return res.status(409).json({ error: 'This ad was already submitted.' });

  const P = PLANS[TRIAL_PLAN];
  // A trial ad never runs past the end of the trial.
  const end = Math.min(Date.now() + P.days * 864e5, Date.parse(prof.free_until));
  await db.from('ads').update({ plan: TRIAL_PLAN, origin: 'trial', status: 'pending_review', expires_at: new Date(end).toISOString() }).eq('id', ad.id);
  res.json({ ok: true });
}

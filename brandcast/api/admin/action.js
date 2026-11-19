import { db, adminFrom } from '../_lib.js';
import { publishAd } from '../_social.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const admin = await adminFrom(req);
  if (!admin) return res.status(403).json({ error: 'Admins only.' });

  const { action, adId, userId, days } = req.body || {};

  if (action === 'approve') {
    const { data: ad } = await db.from('ads').select('status, expires_at').eq('id', adId).single();
    if (!ad || ad.status !== 'pending_review') return res.status(409).json({ error: 'This ad is not waiting for review.' });
    if (ad.expires_at && Date.parse(ad.expires_at) <= Date.now()) {
      return res.status(409).json({ error: 'The trial window for this ad has ended. Reactivate the user, then ask them to submit again.' });
    }
    await db.from('ads').update({ status: 'paid' }).eq('id', adId).eq('status', 'pending_review');
    await publishAd(adId);
    return res.json({ ok: true });
  }

  if (action === 'reject') {
    await db.from('ads').update({ status: 'rejected' }).eq('id', adId).eq('status', 'pending_review');
    return res.json({ ok: true });
  }

  // Ends an ad early. It does not delete posts already published on social media.
  if (action === 'takedown') {
    await db.from('ads').update({ status: 'expired' }).eq('id', adId).in('status', ['live', 'paid']);
    return res.json({ ok: true });
  }

  // Sets free access to end `days` from now. 0 ends it today; 14 reactivates for two more weeks.
  if (action === 'set_free_days') {
    const n = Math.max(0, Math.min(365, Number(days) || 0));
    const until = new Date(Date.now() + n * 864e5).toISOString();
    await db.from('profiles').update({ free_until: until }).eq('id', userId);
    return res.json({ ok: true, free_until: until });
  }

  res.status(400).json({ error: 'Unknown action.' });
}

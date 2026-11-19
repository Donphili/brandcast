import { db, PLANS, PAYPAL, userFrom, ownedAd, paypalToken } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const { adId, plan } = req.body || {};
  const P = PLANS[plan];
  const ad = await ownedAd(user, adId);
  if (!P || !ad) return res.status(400).json({ error: 'Invalid ad or plan.' });
  if (ad.status === 'paid' || ad.status === 'live') return res.status(409).json({ error: 'This ad is already paid.' });

  const token = await paypalToken();
  const r = await fetch(`${PAYPAL}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ custom_id: ad.id, amount: { currency_code: 'USD', value: P.usd.toFixed(2) } }],
    }),
  });
  const order = await r.json();
  if (!r.ok) return res.status(502).json({ error: 'PayPal could not start the payment.' });

  await db.from('ads').update({ plan, status: 'awaiting_payment' }).eq('id', ad.id);
  await db.from('payments').insert({
    ad_id: ad.id, user_id: user.id, provider: 'paypal',
    provider_ref: order.id, currency: 'USD', expected_amount: P.usd,
  });
  res.json({ orderId: order.id });
}

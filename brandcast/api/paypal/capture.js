import { db, PAYPAL, userFrom, markPaid, paypalToken } from '../_lib.js';
import { publishAd } from '../_social.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const { orderId } = req.body || {};
  const { data: pay } = await db.from('payments').select('*')
    .eq('provider', 'paypal').eq('provider_ref', orderId).eq('user_id', user.id).single();
  if (!pay) return res.status(404).json({ error: 'Payment not found.' });
  if (pay.status === 'paid') return res.json({ ok: true });

  const token = await paypalToken();
  const r = await fetch(`${PAYPAL}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const order = await r.json();
  const cap = order?.purchase_units?.[0]?.payments?.captures?.[0];
  const ok = r.ok && order.status === 'COMPLETED' && cap?.status === 'COMPLETED'
    && cap.amount.currency_code === 'USD' && Number(cap.amount.value) >= Number(pay.expected_amount);
  if (!ok) return res.status(402).json({ error: 'Payment was not completed.' });

  await markPaid(orderId, Number(cap.amount.value));
  try { await publishAd(pay.ad_id); } catch (e) { console.error('publish failed', e); }
  res.json({ ok: true });
}

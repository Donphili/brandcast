import { db, PLANS, userFrom, ownedAd } from '../_lib.js';
import { opayCall } from '../_opay.js';

// Naira payments (card, bank transfer, USSD) through the OPay hosted checkout page.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const { adId, plan } = req.body || {};
  const P = PLANS[plan];
  const ad = await ownedAd(user, adId);
  if (!P || !ad) return res.status(400).json({ error: 'Invalid ad or plan.' });
  if (ad.status === 'paid' || ad.status === 'live') return res.status(409).json({ error: 'This ad is already paid.' });

  const rate = Number(process.env.NGN_PER_USD);
  if (!rate) return res.status(500).json({ error: 'Naira rate is not configured.' });
  // OPay amounts are sent in kobo by default. Set OPAY_AMOUNT_UNIT=naira if the sandbox test shows otherwise.
  const unit = process.env.OPAY_AMOUNT_UNIT === 'naira' ? 1 : 100;
  const total = Math.round(P.usd * rate * unit);
  const reference = `bc${ad.id.replace(/-/g, '')}${Date.now()}`;
  const site = process.env.SITE_URL;

  const out = await opayCall('/cashier/create', {
    country: 'NG', reference,
    amount: { total, currency: 'NGN' },
    returnUrl: `${site}/app.html?opay=${reference}`,
    cancelUrl: `${site}/app.html`,
    callbackUrl: `${site}/api/opay/webhook`,
    expireAt: 30,
    userInfo: { userId: user.id, userEmail: user.email, userName: ad.business_name.slice(0, 40) },
    product: { name: `Brandcast ${plan} ad`, description: `Ad for ${ad.business_name}`.slice(0, 100) },
  }, process.env.OPAY_PUBLIC_KEY);

  if (out?.code !== '00000' || !out.data?.cashierUrl) return res.status(502).json({ error: 'OPay could not start the payment.' });

  await db.from('ads').update({ plan, status: 'awaiting_payment' }).eq('id', ad.id);
  await db.from('payments').insert({
    ad_id: ad.id, user_id: user.id, provider: 'opay', provider_ref: reference,
    currency: 'NGN', expected_amount: total,
  });
  res.json({ url: out.data.cashierUrl });
}

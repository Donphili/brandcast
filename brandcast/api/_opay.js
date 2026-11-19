import crypto from 'node:crypto';
import { db, markPaid } from './_lib.js';
import { publishAd } from './_social.js';

const BASE = process.env.OPAY_ENV === 'live' ? 'https://liveapi.opaycheckout.com' : 'https://testapi.opaycheckout.com';

const sortDeep = (o) => Array.isArray(o) ? o.map(sortDeep)
  : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortDeep(o[k])])) : o;

// OPay signs requests with HMAC-SHA512 over the key-sorted JSON body, using the private key.
export const sign = (body) => crypto.createHmac('sha512', process.env.OPAY_SECRET_KEY)
  .update(JSON.stringify(sortDeep(body))).digest('hex');

export async function opayCall(path, body, bearer) {
  const r = await fetch(`${BASE}/api/v1/international${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, MerchantId: process.env.OPAY_MERCHANT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Asks OPay directly whether the order was paid. We trust this answer, never the browser or the callback body.
export async function settleOpay(reference) {
  const { data: pay } = await db.from('payments').select('*').eq('provider', 'opay').eq('provider_ref', reference).single();
  if (!pay) return 'unknown';
  if (pay.status === 'paid') return 'paid';
  const body = { country: 'NG', reference };
  const out = await opayCall('/cashier/status', body, sign(body));
  const d = out?.data;
  const ok = out?.code === '00000' && d?.status === 'SUCCESS' && d.amount?.currency === 'NGN'
    && Number(d.amount.total) >= Number(pay.expected_amount);
  if (!ok) return d?.status || 'pending';
  await markPaid(reference, Number(d.amount.total));
  try { await publishAd(pay.ad_id); } catch (e) { console.error('publish failed', e); }
  return 'paid';
}

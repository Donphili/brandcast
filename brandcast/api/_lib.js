import { createClient } from '@supabase/supabase-js';

// Server-only client with the service role key. It bypasses RLS, so it must never reach the browser.
export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Single source of truth for prices. The browser never decides how much to charge.
export const PLANS = {
  starter: { usd: 5, days: 7, channels: 2 },
  growth: { usd: 10, days: 30, channels: 5 },
  everywhere: { usd: 20, days: 90, channels: 12 },
};

export async function userFrom(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  return data?.user || null;
}

export async function ownedAd(user, adId) {
  const { data } = await db.from('ads').select('*').eq('id', adId).eq('user_id', user.id).single();
  return data;
}

export async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

// Marks a pending payment as paid (only once) and unlocks the ad. Safe to call twice.
export async function markPaid(providerRef, paidAmount) {
  const { data: pay } = await db.from('payments')
    .update({ status: 'paid', paid_amount: paidAmount })
    .eq('provider_ref', providerRef).eq('status', 'pending').select().single();
  if (!pay) return null;
  await db.from('ads').update({ status: 'paid' }).eq('id', pay.ad_id).in('status', ['draft', 'awaiting_payment']);
  return pay;
}

export const PAYPAL = process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

export async function paypalToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const r = await fetch(`${PAYPAL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await r.json()).access_token;
}

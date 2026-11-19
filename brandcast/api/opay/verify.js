import { db, userFrom } from '../_lib.js';
import { settleOpay } from '../_opay.js';

// The browser calls this after OPay sends the customer back, to show the result without waiting for the callback.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  const { reference } = req.body || {};
  const { data: pay } = await db.from('payments').select('id').eq('provider_ref', reference).eq('user_id', user.id).single();
  if (!pay) return res.status(404).json({ error: 'Payment not found.' });
  res.json({ status: await settleOpay(reference) });
}

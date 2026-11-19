import { settleOpay } from '../_opay.js';

// OPay calls this when an order changes state. The body is only used to find the order;
// payment is confirmed by asking OPay directly (settleOpay), so a fake call cannot unlock an ad.
export default async function handler(req, res) {
  const reference = req.body?.payload?.reference;
  if (typeof reference === 'string') {
    try { await settleOpay(reference); } catch (e) { console.error('opay webhook', e); }
  }
  res.status(200).json({ ok: true });
}

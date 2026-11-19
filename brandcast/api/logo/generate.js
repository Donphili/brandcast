import { db, userFrom } from '../_lib.js';

const STYLES = ['glossy chrome', 'frosted glass', 'polished gold', 'soft neon glow', 'smooth matte clay', 'iridescent metal'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await userFrom(req);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Logo generator is not configured.' });

  const name = String(req.body?.business_name || '').replace(/["\n\r]/g, ' ').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Enter your business name first.' });

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('logo_generations').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if ((count || 0) >= 10) return res.status(429).json({ error: 'Daily logo limit reached. Try again tomorrow.' });

  const style = STYLES[Math.floor(Math.random() * STYLES.length)];
  const prompt = `A photorealistic 3D rendered brand logo for a business called "${name}". A bold, simple emblem with the name or initials spelled exactly as "${name}", made of ${style}, studio lighting, soft reflections, rich colorful gradient background, centered, no other text.`;

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 }),
  });
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!r.ok || !b64) return res.status(502).json({ error: 'The logo generator is busy. Try again.' });

  await db.from('logo_generations').insert({ user_id: user.id });
  const path = `${user.id}/logos/${Date.now()}.png`;
  const { error } = await db.storage.from('ad-media').upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/png' });
  if (error) return res.status(500).json({ error: 'Could not save the logo.' });
  res.json({ url: db.storage.from('ad-media').getPublicUrl(path).data.publicUrl });
}

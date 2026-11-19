import { db, adminFrom } from '../_lib.js';

export default async function handler(req, res) {
  const admin = await adminFrom(req);
  if (!admin) return res.status(403).json({ error: 'Admins only.' });

  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const { data: profiles } = await db.from('profiles').select('id, free_until, is_admin');
  const { data: ads } = await db.from('ads')
    .select('id, user_id, business_name, description, phone, email, website, logo_url, photo_urls, video_url, channels, audience, plan, origin, status, expires_at, created_at')
    .order('created_at', { ascending: false }).limit(300);

  const prof = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const users = (list?.users || []).map((u) => ({
    id: u.id, email: u.email, created_at: u.created_at,
    free_until: prof[u.id]?.free_until, is_admin: !!prof[u.id]?.is_admin,
  }));
  const emails = Object.fromEntries(users.map((u) => [u.id, u.email]));
  res.json({ users, ads: (ads || []).map((a) => ({ ...a, owner: emails[a.user_id] })) });
}

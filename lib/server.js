import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(process.env.DATABASE_URL);
}
export function cookieValue(req, key) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(x => x.trim()).find(x => x.startsWith(`${key}=`));
  return found ? decodeURIComponent(found.slice(key.length + 1)) : '';
}
export function requestToken(req) {
  const authorization = req.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return cookieValue(req, 'bl_session');
}
export function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `bl_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}
export function clearCookie(res) { setCookie(res, '', 0); }
export async function makeSession(userId, req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expires = new Date(Date.now() + 7 * 86400_000);
  const sql = db();
  await sql`INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (${userId}, ${hash}, ${expires.toISOString()}, ${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || ''}, ${req.headers['user-agent'] || ''})`;
  return { raw, expires };
}
export async function getUser(req) {
  const raw = requestToken(req);
  if (!raw) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  const hash = createHash('sha256').update(raw).digest('hex');
  const sql = db();
  const rows = await sql`SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hash} AND s.revoked_at IS NULL AND s.expires_at > now() LIMIT 1`;
  if (!rows[0]) return null;
  return rows[0];
}
export async function logEvent(user, action, req, success = true) {
  const sql = db();
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
  const device = (req.headers['user-agent'] || '').slice(0, 240);
  await sql`INSERT INTO access_events (user_id, email, action, device, ip_address, success) VALUES (${user?.id || null}, ${user?.email || ''}, ${action}, ${device}, ${ip}, ${success})`;
}
export async function logFailedSignIn(email, req) {
  const sql = db();
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
  const device = (req.headers['user-agent'] || '').slice(0, 240);
  await sql`INSERT INTO access_events (email, action, device, ip_address, success) VALUES (${String(email||'').slice(0,160)}, 'Failed sign-in', ${device}, ${ip}, false)`;
}
export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ error: 'Please sign in to continue.' }); return null; }
  return user;
}
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { res.status(403).json({ error: 'Admin access required.' }); return null; }
  return user;
}
export const hashPassword = password => bcrypt.hash(password, 12);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
export function validateMutation(req, res) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (origin && host && new URL(origin).host !== host) { res.status(403).json({ error: 'Request origin not allowed.' }); return false; }
  return true;
}

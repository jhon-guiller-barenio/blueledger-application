import { db, makeSession, requestToken, clearCookie, getUser, hashPassword, verifyPassword, logEvent, logFailedSignIn, validateMutation } from '../lib/server.js';
import { createHash } from 'node:crypto';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const sql = db();
    if (req.method === 'GET') {
      const user = await getUser(req);
      if (!user) return res.status(200).json({ user: null });
      await sql`UPDATE users SET last_seen_at=now() WHERE id=${user.id}`;
      return res.status(200).json({ user });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!validateMutation(req,res)) return;
    const { action, email, password, name } = req.body || {};
    const normalized = String(email || '').trim().toLowerCase();
    if (action === 'logout') {
      const raw = requestToken(req);
      if (raw) {
        const user = await getUser(req).catch(()=>null);
        const tokenHash = createHash('sha256').update(raw).digest('hex');
        await sql`UPDATE sessions SET revoked_at=now() WHERE token_hash=${tokenHash}`;
        await logEvent(user, 'Signed out', req).catch(()=>{});
      }
      clearCookie(res);
      return res.status(200).json({ ok: true });
    }
    if (!normalized || !/^\S+@\S+\.\S+$/.test(normalized) || String(password||'').length < 10) {
      return res.status(400).json({ error: 'Enter a valid email and a password with at least 10 characters.' });
    }
    let user;
    if (action === 'register') {
      const safeName = String(name || '').trim().slice(0,80);
      if (safeName.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
      const existing = await sql`SELECT id FROM users WHERE email=${normalized} LIMIT 1`;
      if (existing.length) return res.status(409).json({ error: 'An account already exists for this email.' });
      const role = process.env.ADMIN_EMAIL?.trim().toLowerCase() === normalized ? 'admin' : 'user';
      const passwordHash = await hashPassword(password);
      const created = await sql`INSERT INTO users (email,name,password_hash,role,last_seen_at) VALUES (${normalized},${safeName},${passwordHash},${role},now()) RETURNING id,email,name,role`;
      user = created[0];
      await logEvent(user, 'Account created', req);
    } else if (action === 'login') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
      const attempts = await sql`SELECT count(*)::int AS count FROM access_events WHERE action='Failed sign-in' AND email=${normalized} AND ip_address=${ip} AND created_at>now()-interval '15 minutes'`;
      if (attempts[0]?.count >= 8) return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      const found = await sql`SELECT id,email,name,role,password_hash FROM users WHERE email=${normalized} LIMIT 1`;
      if (!found[0] || !(await verifyPassword(password, found[0].password_hash))) {
        await logFailedSignIn(normalized, req).catch(()=>{});
        return res.status(401).json({ error: 'Email or password is incorrect.' });
      }
      user = {id:found[0].id,email:found[0].email,name:found[0].name,role:found[0].role};
      await sql`UPDATE users SET last_seen_at=now() WHERE id=${user.id}`;
      await logEvent(user, 'Signed in', req);
    } else return res.status(400).json({ error: 'Unsupported action.' });
    const session = await makeSession(user.id, req);
    const age = Math.floor((session.expires.getTime()-Date.now())/1000);
    res.setHeader('Set-Cookie', `bl_session=${encodeURIComponent(session.raw)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);
    return res.status(action==='register'?201:200).json({ user, ...(req.headers['x-blueledger-client']==='mobile' ? {sessionToken:session.raw} : {}) });
  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({ error: process.env.DATABASE_URL ? 'The account service is temporarily unavailable.' : 'Backend setup is incomplete: add DATABASE_URL and run schema.sql.' });
  }
}

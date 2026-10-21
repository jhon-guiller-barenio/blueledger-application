import { db, requireAdmin } from '../lib/server.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  try{
    const admin=await requireAdmin(req,res);if(!admin)return;
    const sql=db();
    const [users,events,counts]=await Promise.all([
      sql`SELECT id,email,name,role,created_at,last_seen_at FROM users ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT e.id,e.email,e.action,e.device,e.ip_address,e.created_at,e.success FROM access_events e ORDER BY e.created_at DESC LIMIT 200`,
      sql`SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM sessions WHERE revoked_at IS NULL AND expires_at>now())::int AS active_sessions,(SELECT count(*) FROM access_events WHERE created_at>now()-interval '30 days')::int AS events_30d`
    ]);
    return res.status(200).json({users,events,stats:counts[0]});
  }catch(error){console.error('Admin API error:',error);return res.status(500).json({error:'Could not load access activity.'})}
}

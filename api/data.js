import { db, requireUser, logEvent, validateMutation } from '../lib/server.js';
const n = v => Number(v);
const text = (v,max=120) => String(v||'').trim().slice(0,max);

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try {
    const user=await requireUser(req,res); if(!user)return;
    const sql=db();
    if(req.method==='GET'){
      const [transactions,budgets,products,accounts]=await Promise.all([
        sql`SELECT id,description,category,amount::float AS amount,transaction_type AS type,transaction_date::text AS date,account_name AS account,note FROM transactions WHERE user_id=${user.id} ORDER BY transaction_date DESC,created_at DESC`,
        sql`SELECT id,category,monthly_limit::float AS limit,month_start::text AS month_start FROM budgets WHERE user_id=${user.id} ORDER BY category`,
        sql`SELECT id,name,category,target_amount::float AS price,saved_amount::float AS saved,priority FROM products WHERE user_id=${user.id} ORDER BY created_at DESC`,
        sql`SELECT id,name,account_type AS type,balance::float AS balance,currency FROM accounts WHERE user_id=${user.id} ORDER BY name`
      ]);
      await logEvent(user,'Viewed financial dashboard',req).catch(()=>{});
      return res.status(200).json({transactions,budgets,products,accounts});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(!validateMutation(req,res))return;
    const body=req.body||{}, action=body.action;
    if(action==='add-transaction'){
      const amount=n(body.amount),type=body.type==='income'?'income':'expense';
      if(!text(body.description,80)||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(body.date||''))return res.status(400).json({error:'Check the transaction details and amount.'});
      const rows=await sql`INSERT INTO transactions(user_id,description,category,amount,transaction_type,transaction_date,account_name,note) VALUES(${user.id},${text(body.description,80)},${text(body.category,50)||'Other'},${amount},${type},${body.date},${text(body.account,80)||'Cash'},${text(body.note,160)}) RETURNING id`;
      await logEvent(user,'Added transaction',req);
      return res.status(201).json({id:rows[0].id});
    }
    if(action==='add-budget'){
      const category=text(body.category,50),limit=n(body.limit),month=body.month||new Date().toISOString().slice(0,10).slice(0,7)+'-01';
      if(!category||!Number.isFinite(limit)||limit<0)return res.status(400).json({error:'Check the budget details.'});
      const rows=await sql`INSERT INTO budgets(user_id,category,monthly_limit,month_start) VALUES(${user.id},${category},${limit},${month}) ON CONFLICT(user_id,category,month_start) DO UPDATE SET monthly_limit=excluded.monthly_limit RETURNING id`;
      await logEvent(user,'Updated budget',req);return res.status(200).json({id:rows[0].id});
    }
    if(action==='delete-product'){
      const id=text(body.id,80);if(!id)return res.status(400).json({error:'Product id is required.'});
      const rows=await sql`DELETE FROM products WHERE user_id=${user.id} AND id=${id} RETURNING id`;
      if(!rows.length)return res.status(404).json({error:'Product not found.'});await logEvent(user,'Removed savings goal',req);return res.status(200).json({ok:true});
    }
    if(action==='add-product'){
      const price=n(body.price),saved=n(body.saved||0),name=text(body.name,80);
      if(!name||!Number.isFinite(price)||price<0||!Number.isFinite(saved)||saved<0)return res.status(400).json({error:'Check the goal details.'});
      const rows=await sql`INSERT INTO products(user_id,name,category,target_amount,saved_amount,priority) VALUES(${user.id},${name},${text(body.category,50)||'Personal goal'},${price},${saved},${text(body.priority,30)||'Saving'}) RETURNING id`;
      await logEvent(user,'Added savings goal',req);return res.status(201).json({id:rows[0].id});
    }
    if(action==='update-account'){
      const id=text(body.id,80),balance=n(body.balance);if(!id||!Number.isFinite(balance))return res.status(400).json({error:'Check the new balance.'});
      const rows=await sql`UPDATE accounts SET balance=${balance},updated_at=now() WHERE user_id=${user.id} AND id=${id} RETURNING id`;
      if(!rows.length)return res.status(404).json({error:'Account not found.'});await logEvent(user,'Updated account balance',req);return res.status(200).json({id:rows[0].id});
    }
    if(action==='add-account'){
      const name=text(body.name,80),balance=n(body.balance),type=text(body.type,40)||'Bank account',currency=text(body.currency,3)||'PHP';
      if(!name||!Number.isFinite(balance))return res.status(400).json({error:'Check the account details.'});
      const rows=await sql`INSERT INTO accounts(user_id,name,account_type,balance,currency) VALUES(${user.id},${name},${type},${balance},${currency}) RETURNING id`;
      await logEvent(user,'Added account balance',req);return res.status(201).json({id:rows[0].id});
    }
    return res.status(400).json({error:'Unsupported action.'});
  }catch(error){console.error('Data API error:',error);return res.status(500).json({error:'Could not load or save your information.'})}
}

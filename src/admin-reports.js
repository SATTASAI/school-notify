// Read-only admin reports. Called only after the shared admin/API authorization gate.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const statuses=new Set(['scheduled','queued','sending','done','cancelled']);
const offsetOf=url=>Math.min(100000,Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0)));
export async function adminReports(req,env,deviceOf){
 const url=new URL(req.url),path=url.pathname;if(!path.startsWith('/api/admin/'))return null;
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 if(path==='/api/admin/notifications'){
  const terms=[],values=[],q=(url.searchParams.get('q')||'').trim().slice(0,120),status=url.searchParams.get('status');
  if(q){terms.push('(n.title LIKE ? OR n.body LIKE ? OR n.source LIKE ?)');values.push(...Array(3).fill('%'+q+'%'));}
  if(statuses.has(status)){terms.push('n.status=?');values.push(status);}
  const where=terms.length?' WHERE '+terms.join(' AND '):'',offset=offsetOf(url);
  const [{results},count,summary]=await Promise.all([
   env.DB.prepare(`SELECT n.*,(SELECT COUNT(*) FROM deliveries d WHERE d.notification_id=n.id AND d.status='ok') ok_now,
    (SELECT COUNT(*) FROM deliveries d WHERE d.notification_id=n.id AND d.status='fail') failed_now
    FROM notifications n${where} ORDER BY n.id DESC LIMIT 30 OFFSET ?`).bind(...values,offset).all(),
   env.DB.prepare(`SELECT COUNT(*) total FROM notifications n${where}`).bind(...values).first(),
   env.DB.prepare(`SELECT COUNT(*) total,SUM(status='scheduled') scheduled,SUM(status IN ('queued','sending')) processing,
    SUM(status='done' AND failed>0) with_failures FROM notifications`).first(),
  ]);
  return json({notifications:results,total:count.total,offset,limit:30,summary});
 }
 const match=path.match(/^\/api\/admin\/notifications\/(\d+)$/);
 if(match){
  const id=Number(match[1]),notification=await env.DB.prepare('SELECT * FROM notifications WHERE id=?').bind(id).first();
  if(!notification)return json({error:'ไม่พบการแจ้งเตือน'},404);
  const offset=offsetOf(url),filter=url.searchParams.get('delivery'),where=['ok','fail','pending'].includes(filter)?' AND d.status=?':'',values=where?[id,filter]:[id];
  const [counts,{results},count]=await Promise.all([
   env.DB.prepare(`SELECT COUNT(*) total,SUM(status='ok') ok,SUM(status='fail') fail,SUM(status='pending') pending FROM deliveries WHERE notification_id=?`).bind(id).first(),
   env.DB.prepare(`SELECT d.id,d.subscription_id,d.status,d.http_status,s.label,s.refs,s.roles,s.user_agent,s.last_ok_at
    FROM deliveries d LEFT JOIN subscriptions s ON s.id=d.subscription_id WHERE d.notification_id=?${where} ORDER BY d.id LIMIT 30 OFFSET ?`).bind(...values,offset).all(),
   env.DB.prepare(`SELECT COUNT(*) total FROM deliveries d WHERE d.notification_id=?${where}`).bind(...values).first(),
  ]);
  return json({notification,counts,deliveries:results.map(({user_agent,...r})=>({...r,device:deviceOf(user_agent,'')})),total:count.total,offset,limit:30});
 }
 return json({error:'not found'},404);
}

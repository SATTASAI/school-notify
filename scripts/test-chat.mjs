import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { fixture } from './chat-fixture.mjs';
const {db,env,token}=await fixture();
const jobs=[];
const ctx={waitUntil(p){jobs.push(p);}};
async function request(path, {method='GET',body,cookie,admin=false,origin}={}) {
  const headers={'content-type':'application/json'};if(cookie)headers.cookie=cookie;if(admin)headers.authorization='Bearer test-admin';if(origin)headers.origin=origin;
  const response=await worker.fetch(new Request('https://notify.test'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
  return {response,data:await response.json()};
}
const login=async(ref='u:1',role='teacher')=>{
  const {response}=await request('/api/chat/session',{method:'POST',body:{token:token(ref,role)}});
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  return response.headers.get('set-cookie').split(';')[0];
};
assert.equal((await request('/api/chat/messages')).response.status,401);
for(const bad of [token()+'x',token('u:1','teacher',1)])assert.equal((await request('/api/chat/session',{method:'POST',body:{token:bad}})).response.status,401);
const first=await login(),second=await login('u:2','parent');
assert.equal((await request('/api/chat/session',{method:'POST',cookie:first,body:{token:token('u:1','teacher',1)}})).response.status,200);
assert.equal((await request('/api/chat/session',{method:'POST',cookie:first,body:{token:token('u:2','parent',1)}})).response.status,401);
assert.equal((await request('/api/chat/admin/conversations')).response.status,401);
assert.equal((await request('/api/chat/messages',{method:'POST',cookie:first,origin:'https://evil.test',body:{body:'bad',requestId:'1234567890123456'}})).response.status,403);
const body={body:'สอบถามงานโรงเรียน <script>alert(1)</script>',requestId:'unique-request-0001'};
assert.equal((await request('/api/chat/messages',{method:'POST',cookie:first,body})).response.status,201);
await request('/api/chat/messages',{method:'POST',cookie:first,body});
assert.equal(db.prepare('SELECT COUNT(*) n FROM messages').get().n,1);
assert.equal((await request('/api/chat/messages',{cookie:second})).data.messages.length,0);
const t=Date.now()-5000;
const insert=db.prepare(`INSERT INTO notifications(title,body,roles,refs,send_at,status,created_at,updated_at,source) VALUES(?,?,?,?,?,?,?,?,?)`);
for(const [title,roles,refs,status,time] of [
  ['broadcast','all',null,'done',t],['private','all','["u:1"]','done',t],['other account','all','["u:2"]','done',t],['parents','parent',null,'done',t],['scheduled','all',null,'scheduled',t],['future','all',null,'done',Date.now()+600000],['cancelled','all',null,'cancelled',t]
])insert.run(title,title,roles,refs,time,status,t,t,'test');
let result=await request('/api/chat/messages?ref=u:2',{cookie:first});
assert.deepEqual(result.data.messages.filter(m=>m.kind==='school').map(m=>m.title).sort(),['broadcast','private']);
assert.deepEqual((await request('/api/chat/messages',{cookie:second})).data.messages.map(m=>m.title).sort(),['broadcast','other account','parents']);
assert.equal((await request('/api/chat/messages',{cookie:first,method:'POST',body:{body:'x'.repeat(2001),requestId:'unique-request-0002'}})).response.status,400);
let rooms=(await request('/api/chat/admin/conversations',{admin:true})).data.conversations;
assert.equal(rooms.find(r=>r.ref==='u:1').unread,1);
await request('/api/chat/admin/read?ref=u:1',{admin:true,method:'POST',body:{at:Date.now()}});
assert.equal((await request('/api/chat/admin/conversations',{admin:true})).data.conversations.find(r=>r.ref==='u:1').unread,0);
await request('/api/chat/admin/messages?ref=u:1',{admin:true,method:'POST',body:{body:'รับทราบแล้ว',requestId:'admin-request-0001'}});
await request('/api/chat/admin/messages?ref=u:1',{admin:true,method:'POST',body:{body:'รับทราบแล้ว',requestId:'admin-request-0001'}});
assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE source='reply:admin-request-0001'").get().n,1);
await Promise.all(jobs);
result=await request('/api/chat/messages',{cookie:first});assert(result.data.messages.some(m=>m.body==='รับทราบแล้ว'));
assert(!(await request('/api/chat/messages',{cookie:second})).data.messages.some(m=>m.body==='รับทราบแล้ว'));
// More than a page at the exact same millisecond must paginate without omission or duplication.
const statement=db.prepare('INSERT INTO messages(ref,body,request_id,created_at) VALUES(?,?,?,?)');
for(let i=0;i<120;i++)statement.run('u:1','page '+i,'page-request-'+i,t+1);
const seen=new Set();let before='';
do{result=await request('/api/chat/messages'+(before?'?before='+encodeURIComponent(before):''),{cookie:first});for(const m of result.data.messages){const key=m.kind+'-'+m.id;assert(!seen.has(key));seen.add(key);}before=result.data.before;}while(result.data.more);
assert.equal(seen.size,124);
await request('/api/chat/read',{cookie:first,method:'POST',body:{at:Date.now()}});
const readAt=db.prepare('SELECT user_read_at FROM conversations WHERE ref=?').get('u:1').user_read_at;
await request('/api/chat/read',{cookie:first,method:'POST',body:{at:1}});
assert.equal(db.prepare('SELECT user_read_at FROM conversations WHERE ref=?').get('u:1').user_read_at,readAt);
console.log('✓ Signed sessions, CSRF, account/role isolation, private replies, idempotency, read markers and pagination');

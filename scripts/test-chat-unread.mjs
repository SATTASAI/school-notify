import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './chat-fixture.mjs';
const {db,env,token}=await fixture();
let clock=Date.now();const realNow=Date.now;Date.now=()=>clock;
async function request(path,{admin=false,cookie,method='GET',body}={}){
  const response=await worker.fetch(new Request('https://notify.test'+path,{method,headers:{'content-type':'application/json',...(admin?{authorization:'Bearer test-admin'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});
  return {response,data:await response.json()};
}
const unread=async(ref,role='teacher')=>{
  const result=await request('/api/chat/admin/unread?ref='+encodeURIComponent(ref)+'&role='+role,{admin:true});
  assert.equal(result.response.status,200);assert.equal(result.response.headers.get('cache-control'),'no-store');
  return result.data.unread;
};
try{
  assert.equal((await request('/api/chat/admin/unread?ref=u:1')).response.status,401);
  assert.equal((await request('/api/chat/admin/unread?ref=bad',{admin:true})).response.status,400);
  assert.equal(await unread('u:9'),false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM conversations').get().n,0,'badge checks must not create a room');
  const insert=db.prepare(`INSERT INTO notifications(title,body,roles,refs,send_at,status,created_at,updated_at) VALUES('test','private content',?,?,?,?,?,?)`);
  function notification(refs,roles='all',status='done',at=clock){insert.run(roles,refs?JSON.stringify(refs):null,at,status,clock,clock);}
  notification(['u:1']);notification(['u:2'],'parent');notification(['u:9'],'parent');
  notification(['u:9'],'all','scheduled');notification(['u:9'],'all','cancelled');notification(['u:9'],'all','done',clock+60000);
  assert.equal(await unread('u:1'),true);assert.equal(await unread('u:2','parent'),true);assert.equal(await unread('u:9'),false);
  const login=await request('/api/chat/session',{method:'POST',body:{token:token('u:1')}});
  const cookie=login.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/chat/admin/unread?ref=u:2',{cookie})).response.status,401,'user cookies cannot inspect other accounts');
  await request('/api/chat/read',{method:'POST',cookie,body:{at:clock}});
  assert.equal(await unread('u:1'),false);assert.equal(await unread('u:2','parent'),true);
  clock+=1000;
  await request('/api/chat/messages',{method:'POST',cookie,body:{body:'my own reply',requestId:'unread-test-request-0001'}});
  assert.equal(await unread('u:1'),false,'outgoing user messages must not turn on their own badge');
  notification(['u:1']);assert.equal(await unread('u:1'),true);
  await request('/api/chat/admin/read?ref=u:1',{method:'POST',admin:true,body:{at:clock}});
  assert.equal(await unread('u:1'),true,'admin read state must not change the user badge');
  await request('/api/chat/read',{method:'POST',cookie,body:{at:clock}});assert.equal(await unread('u:1'),false);
  clock+=1000;notification(null);assert.equal(await unread('u:1'),true,'broadcast messages also count');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM conversations WHERE ref=?').get('u:9').n,0);
  console.log('✓ Chat badge: authentication, exact recipients/roles, unread/read/new-message transitions, broadcasts and no room creation');
}finally{Date.now=realNow;}

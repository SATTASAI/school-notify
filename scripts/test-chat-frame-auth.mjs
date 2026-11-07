import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './chat-fixture.mjs';
const {db,env,token}=await fixture();
async function request(path,{frameToken,cookie,body}={}){
 const response=await worker.fetch(new Request('https://notify.test'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(frameToken?{'x-chat-token':frameToken}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});
 return {response,data:await response.json()};
}
const one=token('u:1'),two=token('u:2');
for(const signed of [one,two])assert.equal((await request('/api/chat/session',{frameToken:signed,body:{token:signed}})).response.status,200);
const other=await request('/api/chat/session',{body:{token:two}}),cookie=other.response.headers.get('set-cookie').split(';')[0];
const t=Date.now()-100;
db.prepare(`INSERT INTO notifications(title,body,roles,refs,send_at,status,created_at,updated_at) VALUES('private','only account one','all','["u:1"]',?,'done',?,?)`).run(t,t,t);
let r=await request('/api/chat/messages',{frameToken:one});assert.equal(r.response.status,200);assert.equal(r.data.room.ref,'u:1');assert(r.data.messages.some(m=>m.body==='only account one'));
r=await request('/api/chat/messages',{frameToken:one,cookie});assert.equal(r.data.room.ref,'u:1','explicit frame identity must take priority over another account cookie');
r=await request('/api/chat/messages',{frameToken:two});assert.equal(r.data.messages.length,0);
for(const invalid of [one+'x',token('u:1','teacher',1)])assert.equal((await request('/api/chat/messages',{frameToken:invalid,cookie})).response.status,401,'invalid explicit identity must never fall back to another cookie');
assert.equal((await request('/api/chat/admin/conversations',{frameToken:one})).response.status,401);
assert.equal((await request('/api/chat/messages',{frameToken:one,body:{body:'reply without browser cookies',requestId:'frame-auth-request-001'}})).response.status,201);
assert.equal((await request('/api/chat/read',{frameToken:one,body:{at:Date.now()}})).response.status,200);
assert(db.prepare('SELECT user_read_at FROM conversations WHERE ref=?').get('u:1').user_read_at>0);
console.log('✓ Frame authentication: no cookie dependency, signed/expired/forged tokens, account isolation and admin access restrictions');

import assert from 'node:assert/strict';
import {fixture} from './chat-fixture.mjs';
import {queueWelcome} from '../src/welcome.js';
import worker from '../src/index.js';
const {db,env}=await fixture(),t=Date.now();
for(const [id,created] of [[1,t-10000],[2,t+10000]])db.prepare(`INSERT INTO subscriptions(id,endpoint,p256dh,auth,roles,refs,created_at,updated_at) VALUES(?,?,'x','x',',teacher,',',u:1,',?,?)`).run(id,'https://push.test/'+id,created,created);
await queueWelcome(env,{id:2},{ref:'u:1'},t+10000);await queueWelcome(env,{id:2},{ref:'u:1'},t+10001);
assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);
const welcome=db.prepare('SELECT * FROM notifications').get();assert.equal(welcome.title,'ยินดีต้อนรับสู่ School Notify');assert.equal(welcome.total,1);
assert.deepEqual(db.prepare('SELECT subscription_id FROM deliveries').all().map(r=>r.subscription_id),[2]);
// An old scheduled message becomes due after a new device joined: only devices connected at send time qualify.
db.exec('DELETE FROM deliveries;DELETE FROM notifications');
const old=await worker.fetch(new Request('https://notify.test/api/notifications',{method:'POST',headers:{authorization:'Bearer test-admin','content-type':'application/json'},body:JSON.stringify({title:'ข้อความเดิม',roles:['teacher'],sendAt:t-1000})}),env,{waitUntil(p){p.catch(()=>{});}});
assert.equal(old.status,201);
for(let i=0;i<30;i++){if(db.prepare('SELECT COUNT(*) n FROM deliveries').get().n)break;await new Promise(r=>setImmediate(r));}
assert.deepEqual(db.prepare('SELECT subscription_id FROM deliveries').all().map(r=>r.subscription_id),[1]);
console.log('✓ New connection: welcome only to new device, repeat connection idempotent, old notifications exclude newly joined devices');
// Full signed subscribe flow sends only welcome once; reconnecting the same endpoint stays silent.
{
 const {db,env,token}=await fixture(),jobs=[],pushes=[];
 const key=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const p256dh=Buffer.from(await crypto.subtle.exportKey('raw',key.publicKey)).toString('base64url');
 const request=()=>new Request('https://notify.test/api/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({subscription:{endpoint:'https://push.example.test/new-device',keys:{p256dh,auth:Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url')}},token:token(),exclusive:true})});
 const original=globalThis.fetch;globalThis.fetch=async(url)=>{assert.equal(String(url),'https://push.example.test/new-device');pushes.push(url);return new Response('',{status:201});};
 try{
  assert.equal((await worker.fetch(request(),env,{waitUntil(p){jobs.push(p);}})).status,200);await Promise.all(jobs);
  assert.equal(pushes.length,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE source GLOB 'welcome:*'").get().n,1);
  assert.equal(db.prepare('SELECT status FROM deliveries').get().status,'ok');
  assert.equal((await worker.fetch(request(),env,{waitUntil(p){jobs.push(p);}})).status,200);await Promise.all(jobs);assert.equal(pushes.length,1);
 }finally{globalThis.fetch=original;}
 console.log('✓ Signed subscription integration: one encrypted welcome Push, successful delivery, no duplicate on reconnect');
}

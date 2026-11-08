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

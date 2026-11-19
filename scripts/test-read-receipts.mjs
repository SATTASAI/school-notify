import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { fixture } from './chat-fixture.mjs';
const {db,env,token}=await fixture();
const ctx={waitUntil(){}};
async function request(path,{method='GET',body,cookie,admin=false}={}){
  const headers={'content-type':'application/json'};if(cookie)headers.cookie=cookie;if(admin)headers.authorization='Bearer test-admin';
  const response=await worker.fetch(new Request('https://notify.test'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env,ctx);
  return {response,data:await response.json()};
}
const now=Date.now();
db.exec(`INSERT INTO subscriptions(id,endpoint,p256dh,auth,roles,refs,created_at,updated_at) VALUES
 (1,'https://push.test/a','k','a',',teacher,',',u:1,',${now},${now}),(2,'https://push.test/b','k','a',',teacher,',',u:2,',${now},${now});
 INSERT INTO notifications(id,title,roles,send_at,status,created_at,updated_at) VALUES(10,'ประกาศ','all',${now-5000},'done',${now},${now});
 INSERT INTO deliveries(notification_id,subscription_id,status) VALUES(10,1,'ok'),(10,2,'ok');`);
// Push click from device b marks only that device.
assert.equal((await request('/api/read',{method:'POST',body:{id:10,endpoint:'https://push.test/b'}})).response.status,200);
assert.equal((await request('/api/read',{method:'POST',body:{id:'x',endpoint:''}})).response.status,400);
assert.deepEqual(db.prepare('SELECT subscription_id FROM deliveries WHERE read_at IS NOT NULL').all().map(r=>r.subscription_id),[2]);
// Opening the chat room as u:1 marks u:1's device read too.
const {response}=await request('/api/chat/session',{method:'POST',body:{token:token('u:1','teacher')}});
const cookie=response.headers.get('set-cookie').split(';')[0];
assert.equal((await request('/api/chat/read',{method:'POST',cookie,body:{at:now}})).response.status,200);
assert.equal(db.prepare('SELECT COUNT(*) n FROM deliveries WHERE read_at IS NOT NULL').get().n,2);
// Admin report shows the read count; the room exposes both read points for chat receipts.
const list=(await request('/api/admin/notifications',{admin:true})).data;assert.equal(list.notifications[0].read_now,2);
const detail=(await request('/api/admin/notifications/10',{admin:true})).data;assert.equal(detail.counts.read,2);assert.ok(detail.deliveries.every(d=>d.read_at));
const room=(await request('/api/chat/messages',{cookie})).data.room;assert.equal(room.user_read_at,now);assert.equal(room.admin_read_at,0);
console.log('✓ Read receipts: push click, chat read, admin counts');

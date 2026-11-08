import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import worker from '../src/index.js';
import {fixture} from './chat-fixture.mjs';
const {db,env}=await fixture();const t=Date.now();
for(let i=1;i<=65;i++)db.prepare(`INSERT INTO notifications(id,title,body,roles,refs,source,send_at,status,total,sent,failed,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(i,'ประกาศ '+i,i===65?'<img src=x onerror=alert(1)>':'รายละเอียด '+i,'teacher','["u:1"]','system',t+86400000,i===65?'done':'scheduled',i===65?3:0,i===65?1:0,i===65?1:0,t,t);
db.prepare(`INSERT INTO subscriptions(id,endpoint,p256dh,auth,roles,refs,label,user_agent,created_at,updated_at) VALUES(1,'https://secret-push.test/key','PRIVATE-P256','PRIVATE-AUTH',',teacher,',',u:1,','ครูทดสอบ','iPhone',?,?)`).run(t,t);
for(const [id,subscription_id,status,http] of [[1,1,'ok',201],[2,2,'fail',410],[3,3,'pending',null]])db.prepare('INSERT INTO deliveries VALUES(?,?,?,?,?)').run(id,65,subscription_id,status,http);
async function request(path,auth=true,method='GET',body){return worker.fetch(new Request('https://notify.test'+path,{method,headers:{...(auth?{authorization:'Bearer test-admin'}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});}
assert.equal((await request('/api/admin/notifications',false)).status,401);
let report=await (await request('/api/admin/notifications?offset=30')).json();assert.equal(report.total,65);assert.equal(report.notifications.length,30);assert.equal(report.notifications[0].id,35);assert.equal(report.summary.scheduled,64);
assert.equal((await (await request('/api/admin/notifications?q=ประกาศ%2065&status=done')).json()).total,1);
assert.equal((await (await request('/api/admin/notifications?q=%27%20OR%201=1--')).json()).total,0);
let detail=await (await request('/api/admin/notifications/65?delivery=fail')).json();assert.equal(detail.total,1);assert.equal(detail.counts.ok,1);assert.equal(detail.counts.fail,1);assert.equal(detail.counts.pending,1);assert.equal(detail.deliveries[0].http_status,410);
assert.equal((await request('/api/admin/notifications/9999')).status,404);assert.equal((await request('/api/admin/notifications',true,'POST',{})).status,405);
const subscriptions=await (await request('/api/subscriptions?prefix=')).json();assert.equal(subscriptions.subscriptions[0].label,'ครูทดสอบ');assert.deepEqual(subscriptions.subscriptions[0].roles,['teacher']);
for(const value of [detail,subscriptions]){const s=JSON.stringify(value);assert(!s.includes('PRIVATE'));assert(!s.includes('secret-push.test'));assert(!s.includes('p256dh'));}
const html=await readFile(new URL('../public/admin.html',import.meta.url),'utf8'),js=await readFile(new URL('../public/admin.js',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://notify.test/admin',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};w.confirm=()=>true;
w.SchoolPasskeys={mount(){},api:async()=>({})};w.sessionStorage.setItem('notifyToken','test-admin');
const posted=[];w.fetch=async(path,opts={})=>{if(opts.method==='POST')posted.push({path,body:JSON.parse(opts.body||'{}')});return request(path,!!opts.headers?.authorization,opts.method||'GET',opts.body?JSON.parse(opts.body):undefined);};
w.eval(js);
async function until(fn){for(let i=0;i<120;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI timed out');}
await until(()=>w.document.getElementById('sTotal').textContent==='1');const $=id=>w.document.getElementById(id);
assert(!$('app').classList.contains('hidden'));assert.equal($('recent').querySelectorAll('img').length,0);assert.match($('recent').textContent,/<img src=x/);
w.document.querySelector('[data-tab="history"]').click();await until(()=>$('history').children.length===30);assert.equal($('historyPrev').disabled,true);$('historyNext').click();await until(()=>$('historyPage').textContent.startsWith('31'));assert.equal($('historyPrev').disabled,false);
$('recent').querySelector('[data-detail="65"]').click();await until(()=>$('detailTitle').textContent==='ประกาศ 65');assert.equal($('detailContent').querySelectorAll('img').length,0);assert.match($('detailContent').textContent,/บริการ Push รับแล้ว 1/);assert.equal($('deliveries').children.length,3);assert.equal($('cancelNotification').hidden,true);
$('copyNotification').click();assert.equal($('title').value,'ประกาศ 65');assert.equal(posted.length,0);assert(!$('composeForm').closest('[data-panel]').classList.contains('hidden'));
$('title').value='ทดสอบตั้งเวลา';$('body').value='ข้อความปลอดภัย';$('sendAt').value='2030-01-02T08:00';$('composeForm').dispatchEvent(new w.Event('input',{bubbles:true}));$('composeForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert($('confirmDialog').hasAttribute('open'));assert.equal(posted.length,0);
$('confirmSend').click();await until(()=>posted.length===1);await until(()=>$('sendMsg').textContent.includes('ตั้งเวลา'));assert.equal(posted[0].body.sendAt,Date.parse('2030-01-02T08:00+07:00'));assert.equal(posted[0].body.title,'ทดสอบตั้งเวลา');assert.equal(posted[0].path,'/api/notifications');
$('deviceSearch').value='ไม่มีชื่อ';$('deviceSearch').dispatchEvent(new w.Event('input'));assert.match($('devices').textContent,/ไม่พบอุปกรณ์/);
dom.window.close();console.log('✓ Admin console: authorization, filtered pagination, detailed delivery states, missing devices, no push secrets, safe text, navigation, copy-as-draft and confirmed Bangkok scheduled send');

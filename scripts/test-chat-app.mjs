import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './chat-fixture.mjs';
const {env,db,token}=await fixture();const root=fileURLToPath(new URL('../',import.meta.url));const script=await fs.readFile(root+'public/chat.js','utf8');const errors=[];
async function ui(file,url,admin=false,mobile=false,embedded=false){
 const dom=new JSDOM(await fs.readFile(root+'public/'+file,'utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;const parent=embedded?new JSDOM('',{url:'https://system.banpadengschool.ac.th/'}).window:null;const posted=[];if(parent){Object.defineProperty(w,'parent',{value:parent});parent.postMessage=(data,origin)=>posted.push({data,origin});}const timers=[];w.setInterval=(fn,ms)=>{timers.push({fn,ms});return timers.length;};let readRequests=0,requests=0;
 w.matchMedia=q=>({matches:q.includes('max-width')?mobile:false});w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let resize;w.visualViewport={height:844,addEventListener(type,fn){resize=fn;}};
 if(admin)w.sessionStorage.setItem('notifyToken','test-admin');let cookie='',fail=false,hold=false,release;
 const requestIds=[];
 w.fetch=async(path,opts={})=>{
  requests++;if(path==='/api/chat/read')readRequests++;
  if(embedded)assert.equal(opts.headers['x-chat-token'],new URL(url).searchParams.get('t'));
  if(path==='/api/chat/messages'&&opts.method==='POST'){
    requestIds.push(JSON.parse(opts.body).requestId);
    if(fail){fail=false;throw Error('offline');}
    if(hold){hold=false;await new Promise(r=>release=r);}
  }
  const headers={...opts.headers,...(cookie&&!embedded?{cookie}:{})};const r=await worker.fetch(new Request(new URL(path,w.location),{...opts,headers}),env,{waitUntil(p){p.catch(e=>errors.push(e));}});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;
 };
 w.addEventListener('error',e=>errors.push(e.error));w.eval(await fs.readFile(root+'public/admin-nav.js','utf8'));w.eval(script+'\nwindow.__chatTesting=()=>({loading,busy});window.__setMessagesForTest=items=>{messages=items;render();};');return {w,dom,parent,posted,timers,get reads(){return readRequests;},get requests(){return requests;},signal(visible,origin='https://system.banpadengschool.ac.th',source=parent){w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{type:'school-chat-visibility',visible}}));},$:id=>w.document.getElementById(id),requestIds,fail(){fail=true;},hold(){hold=true;},release(){release();},resize(height){w.visualViewport.height=height;resize();}};
}
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('UI state timed out');}
function draft(x,text){x.$('draft').value=text;x.$('draft').dispatchEvent(new x.w.Event('input'));}
const t=Date.now()-1000;db.prepare(`INSERT INTO notifications(title,body,url,roles,send_at,status,source,created_at,updated_at,actions) VALUES(?,?,?,'all',?,'done','system',?,?,?)`).run('ประกาศโรงเรียน','ประชุมเวลา 15.30 น.','https://school.test',t,t,t,'[{"title":"รายละเอียด","url":"https://school.test/work"}]');
const user=await ui('index.html','https://notify.test/?t='+token(),false,true);await until(()=>!user.$('draft').disabled);
assert(user.$('messenger').classList.contains('room-open'));assert.equal(user.w.document.querySelector('aside'),null);assert.equal(user.w.document.querySelectorAll('main a[href]').length,0);assert.equal(user.$('messages').querySelectorAll('a').length,0);assert.match(user.$('messages').textContent,/ประกาศโรงเรียน/);assert(user.$('connection').classList.contains('quiet'));
user.$('threadSettings').click();assert(user.$('personalSettings').hasAttribute('open'));assert(user.$('connectAccount').classList.contains('hidden'));user.$('themePreference').value='dark';user.$('themePreference').onchange();assert.equal(user.w.document.body.dataset.theme,'dark');user.$('textPreference').value='large';user.$('textPreference').onchange();assert.equal(user.w.document.body.dataset.textSize,'large');assert.equal(JSON.parse(user.w.localStorage.getItem('notifyAppearance')).text,'large');user.$('closeSettings').click();assert(!user.$('personalSettings').hasAttribute('open'));
user.resize(480);assert.equal(user.w.document.documentElement.style.getPropertyValue('--app-height'),'480px');
draft(user,'<img src=x onerror=alert(1)>');assert.equal(user.w.sessionStorage.getItem('notifyDraft:u:1'),user.$('draft').value);
user.hold();const sending=user.$('composer').onsubmit({preventDefault(){}});assert.equal(user.$('messages').querySelectorAll('.pending').length,1);assert(user.$('draft').readOnly);user.release();await sending;assert.equal(user.$('messages').querySelectorAll('.pending').length,0);assert.equal(user.$('messages').querySelectorAll('img').length,0);assert.match(user.$('messages').textContent,/<img src=x/);assert.equal(user.$('draft').value,'');assert.equal(user.$('messages').querySelectorAll('.outgoing').length,1);
draft(user,'ข้อความไม่หายเมื่อส่งไม่สำเร็จ');user.fail();await user.$('composer').onsubmit({preventDefault(){}});assert.equal(user.$('draft').value,'ข้อความไม่หายเมื่อส่งไม่สำเร็จ');assert.equal(user.$('messages').querySelectorAll('.pending').length,0);assert(!user.$('send').disabled);assert(user.$('connection').classList.contains('error'));await user.$('composer').onsubmit({preventDefault(){}});assert.equal(user.requestIds.at(-1),user.requestIds.at(-2));assert.equal(db.prepare('SELECT COUNT(*) n FROM messages').get().n,2);
const a=await ui('inbox.html','https://notify.test/inbox',true);await until(()=>a.$('roomList').children.length);a.$('roomList').querySelector('button').click();await until(()=>a.$('messages').textContent.includes('<img src=x'));assert(a.$('messages').querySelectorAll('a.detail-link').length>0);assert.equal(a.w.document.querySelectorAll('.admin-bottom-bar a').length,5);assert(a.w.document.body.classList.contains('admin-authenticated'));a.w.document.querySelector('[data-admin-route=messages]').click();assert(!a.$('messenger').classList.contains('room-open'));a.$('roomList').querySelector('button').click();await until(()=>!a.w.__chatTesting().loading);a.$('showRoomDetails').click();assert.match(a.$('roomDetails').textContent,/u:1/);a.$('findMessages').click();a.$('messageSearch').value='NO-MATCH-QUERY';a.$('messageSearch').dispatchEvent(new a.w.Event('input'));assert.equal(a.$('messages').querySelectorAll('.message:not(.no-match)').length,0);a.$('findMessages').click();assert(a.$('messages').querySelectorAll('.message:not(.no-match)').length>0);a.$('unreadRooms').click();assert.match(a.$('roomSummary').textContent,/ห้อง/);a.$('allRooms').click();draft(a,'รับทราบแล้ว');await a.$('composer').onsubmit({preventDefault(){}});assert.match(a.$('messages').textContent,/รับทราบแล้ว/);
const signedout=await ui('index.html','https://notify.test/',false,true);await until(()=>!signedout.$('gate').classList.contains('hidden'));assert(signedout.$('composer').classList.contains('hidden'));assert.equal(signedout.w.document.querySelectorAll('main a[href]').length,0);signedout.$('connectSettings').click();assert(signedout.$('personalSettings').hasAttribute('open'));assert(!signedout.$('connectAccount').classList.contains('hidden'));
const frame=await ui('index.html','https://notify.test/?t='+token('u:8')+'&embedded=1&chat=1',false,true,true);await until(()=>!frame.$('draft').disabled);
assert(frame.w.document.body.classList.contains('embedded-chat'));assert.equal(frame.reads,0,'hidden frame initialization cannot mark messages read');assert(frame.posted.some(p=>p.data.type==='school-chat-ready'&&p.origin==='https://system.banpadengschool.ac.th'));
frame.signal(true,'https://evil.test');await new Promise(r=>setImmediate(r));assert.equal(frame.reads,0);
frame.signal(true,'https://system.banpadengschool.ac.th',frame.w);await new Promise(r=>setImmediate(r));assert.equal(frame.reads,0);
frame.signal(true);await until(()=>frame.reads>0);assert(frame.posted.some(p=>p.data.type==='school-chat-read'));
draft(frame,'เก็บข้อความร่างเมื่อย่อแชท');frame.$('timeline').scrollTop=123;frame.signal(false);const beforeRequests=frame.requests;await frame.timers.find(t=>t.ms===15000).fn();assert.equal(frame.requests,beforeRequests,'hidden chat must stop polling');assert.equal(frame.$('draft').value,'เก็บข้อความร่างเมื่อย่อแชท');
frame.signal(true);await new Promise(r=>setImmediate(r));assert.equal(frame.$('draft').value,'เก็บข้อความร่างเมื่อย่อแชท');assert.equal(frame.$('timeline').scrollTop,123);assert(frame.w.location.search.includes('embedded=1'));await until(()=>!frame.w.__chatTesting().loading);
// Renewal links are tappable only for official school system messages; HTML stays text.
const renewal='https://selfservice.ksp.or.th/';
const bodyNode=user.w.document.createElement('div');
user.w.eval('appendMessageBody')(bodyNode,{kind:'school',source:'system',body:'ต่ออายุ: '+renewal+'\n<img src=x onerror=alert(1)>'});
assert.equal(bodyNode.querySelectorAll('a').length,1);assert.equal(bodyNode.querySelector('a').href,renewal);
assert.equal(bodyNode.querySelector('a').target,'_blank');assert.equal(bodyNode.querySelector('a').rel,'noopener noreferrer');
assert.equal(bodyNode.querySelectorAll('img').length,0);assert.match(bodyNode.textContent,/<img src=x/);
for(const message of [
 {kind:'user',source:'system',body:renewal},
 {kind:'school',source:'admin-reply',body:renewal},
 {kind:'school',source:'system',body:'https://selfservice.ksp.or.th.evil.test/ https://selfservice.ksp.or.th/@evil https://evil.test/'},
]){const n=user.w.document.createElement('div');user.w.eval('appendMessageBody')(n,message);assert.equal(n.querySelectorAll('a').length,0);assert.equal(n.textContent,message.body);}
// Transfer links render in the actual recipient chat, including embedded/mobile.
const transferUrl='https://system.banpadengschool.ac.th/dmcreport/?view=notices';
for(const view of [user,frame]){
 view.w.__setMessagesForTest([{id:991,kind:'school',source:'system',title:'แจ้งย้ายเข้าใหม่',body:'ตรวจสอบแจ้งย้าย: '+transferUrl,created_at:Date.now()}]);
 const link=view.$('messages').querySelector('a.message-link');assert(link);assert.equal(link.href,transferUrl);assert.equal(link.target,'_blank');
}
for(const body of [transferUrl+'&redirect=https://evil.test/', 'https://system.banpadengschool.ac.th.evil.test/dmcreport/?view=notices', 'https://system.banpadengschool.ac.th/dmcreport/?view=other']){
 const el=user.w.document.createElement('div');user.w.eval('appendMessageBody')(el,{kind:'school',source:'system',body});assert.equal(el.querySelectorAll('a').length,0);
}
const plain=user.w.document.createElement('div');user.w.eval('appendMessageBody')(plain,{kind:'user',source:'system',body:transferUrl});assert.equal(plain.querySelectorAll('a').length,0);
// Link destinations are unique across inline body links, actions and the detail URL.
const linksNode=a.w.document.createElement('div');
const notice={kind:'school',source:'system',body:'ต่ออายุ: '+renewal+'\n'+renewal,
 url:'https://school.test/account',actions:JSON.stringify([
 {title:'ต่ออายุ',url:renewal},{title:'อัปเดตข้อมูล',url:'https://school.test/account'},
 {title:'ซ้ำ',url:'https://school.test/account'},{title:'',url:'https://school.test/another'},
 {title:'อันตราย',url:'javascript:alert(1)'},null])};
const linked=a.w.eval('appendMessageBody')(linksNode,notice);a.w.eval('appendMessageActions')(linksNode,notice,linked);
assert.equal(linksNode.querySelectorAll('a').length,3);
assert.equal(linksNode.querySelectorAll('a.message-link').length,1);
assert.deepEqual([...linksNode.querySelectorAll('a')].map(n=>n.textContent),[renewal,'อัปเดตข้อมูล','เปิดลิงก์ ↗']);
// Existing renewal messages discard stale detail/account links and expose only KSP.
for(const view of [user,a]){
 const bubble=view.w.document.createElement('div');
 const message={kind:'school',source:'system',title:'ต่ออายุใบประกอบวิชาชีพ',body:'เหลือ 86 วัน\nต่ออายุ: '+renewal+'\nหลังต่ออายุ กรุณาอัปเดตข้อมูล',
 url:'https://system.banpadengschool.ac.th/notification.html?key=leave:1',actions:JSON.stringify([{title:'เปิดใบลา',url:'https://school.test/leave.html'},{title:'อัปเดตข้อมูล',url:'https://school.test/account.html'}])};
 const seen=view.w.eval('appendMessageBody')(bubble,message);view.w.eval('appendMessageActions')(bubble,message,seen);
 assert.equal(bubble.querySelectorAll('a').length,1);assert.equal(bubble.querySelector('a').href,renewal);
 assert.equal(bubble.querySelector('a').textContent,'ต่ออายุใบประกอบวิชาชีพ ↗');assert(!bubble.textContent.includes('ต่ออายุ:'));
}
assert.equal(errors.length,0);for(const x of [user,a,signedout,frame]){x.dom.window.close();x.parent?.close();}console.log('✓ App UI: single room, no outgoing links, personal settings, appearance persistence, viewport resize, instant send, draft recovery, retry identity, embedded visibility/draft/scroll retention and admin compatibility');

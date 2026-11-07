import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {fixture} from './chat-fixture.mjs';
const {env,db,token}=await fixture();const root=fileURLToPath(new URL('../',import.meta.url));const script=await fs.readFile(root+'public/chat.js','utf8');const errors=[];
async function ui(file,url,admin=false,mobile=false){
 const dom=new JSDOM(await fs.readFile(root+'public/'+file,'utf8'),{url,runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.matchMedia=q=>({matches:q.includes('max-width')?mobile:false});w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let resize;w.visualViewport={height:844,addEventListener(type,fn){resize=fn;}};
 if(admin)w.sessionStorage.setItem('notifyToken','test-admin');let cookie='',fail=false,hold=false,release;
 const requestIds=[];
 w.fetch=async(path,opts={})=>{
  if(path==='/api/chat/messages'&&opts.method==='POST'){
    requestIds.push(JSON.parse(opts.body).requestId);
    if(fail){fail=false;throw Error('offline');}
    if(hold){hold=false;await new Promise(r=>release=r);}
  }
  const headers={...opts.headers,...(cookie?{cookie}:{})};const r=await worker.fetch(new Request(new URL(path,w.location),{...opts,headers}),env,{waitUntil(p){p.catch(e=>errors.push(e));}});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return r;
 };
 w.addEventListener('error',e=>errors.push(e.error));w.eval(script);return {w,dom,$:id=>w.document.getElementById(id),requestIds,fail(){fail=true;},hold(){hold=true;},release(){release();},resize(height){w.visualViewport.height=height;resize();}};
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
const a=await ui('inbox.html','https://notify.test/inbox',true);await until(()=>a.$('roomList').children.length);a.$('roomList').querySelector('button').click();await until(()=>a.$('messages').textContent.includes('<img src=x'));assert(a.$('messages').querySelectorAll('a.detail-link').length>0);draft(a,'รับทราบแล้ว');await a.$('composer').onsubmit({preventDefault(){}});assert.match(a.$('messages').textContent,/รับทราบแล้ว/);
const signedout=await ui('index.html','https://notify.test/',false,true);await until(()=>!signedout.$('gate').classList.contains('hidden'));assert(signedout.$('composer').classList.contains('hidden'));assert.equal(signedout.w.document.querySelectorAll('main a[href]').length,0);signedout.$('connectSettings').click();assert(signedout.$('personalSettings').hasAttribute('open'));assert(!signedout.$('connectAccount').classList.contains('hidden'));
assert.equal(errors.length,0);for(const x of [user,a,signedout])x.dom.window.close();console.log('✓ App UI: single room, no outgoing links, personal settings, appearance persistence, viewport resize, instant send, draft recovery, retry identity and admin compatibility');

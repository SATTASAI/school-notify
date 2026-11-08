const $ = id => document.getElementById(id);
const admin = document.body.dataset.admin === 'true';
const qs = new URLSearchParams(location.search);
const schoolOrigin = 'https://system.banpadengschool.ac.th';
const embedded = !admin && qs.get('embedded') === '1' && window.parent !== window;
let embeddedVisible = !embedded;
function notifySchool(type){if(embedded)window.parent.postMessage({type},schoolOrigin);}
if(embedded){
  document.body.classList.add('embedded-chat');
  window.addEventListener('message',event=>{
    if(event.origin!==schoolOrigin || event.source!==window.parent || event.data?.type!=='school-chat-visibility')return;
    embeddedVisible=event.data.visible===true;
    if(!embeddedVisible){saveDraft();$('draft').blur();}
    else if(active)load();
  });
}
let token = admin ? sessionStorage.getItem('notifyToken') || '' : '';
let ref = '', rooms = [], messages = [], before = null, more = false, busy = false, active = false, pendingId = null, loading = false;
const cache = new Map(), readThrough = new Map();
const messageId = qs.get('message');
let focused = false, optimistic = null;
const max = admin ? 1000 : 2000;
const fmtTime = t => new Date(t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
const fmtDate = t => new Date(t).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
async function api(path, options = {}) {
  const res = await fetch('/api/chat/' + (admin?'admin/':'') + path, { ...options, headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+token}:{}),...(embedded&&qs.get('t')?{'x-chat-token':qs.get('t')}:{}),...options.headers} });
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ'); e.status=res.status; throw e; }
  return data;
}
function state(text,error=false){ $('connection').textContent=text; $('connection').classList.toggle('error',error); $('connection').classList.toggle('quiet',!error && active && !loading); }
function saveDraft(){if(!ref)return;try{sessionStorage.setItem('notifyDraft:'+ref,$('draft').value);}catch{}}
function storedDraft(){try{return sessionStorage.getItem('notifyDraft:'+ref)||'';}catch{return '';}}
function dateLabel(t){if(admin)return fmtDate(t);const date=new Date(t),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);return date.toDateString()===today.toDateString()?'วันนี้':date.toDateString()===yesterday.toDateString()?'เมื่อวาน':fmtDate(t);}
function gate(){ active=false; notifySchool('school-chat-error'); $('connectAccount')?.classList.remove('hidden'); $('logout')?.classList.add('hidden'); $('gate').classList.remove('hidden'); $('composer').classList.add('hidden'); state('ยังไม่ได้เชื่อมบัญชี'); }
function nearBottom(){return $('timeline').scrollHeight - $('timeline').scrollTop - $('timeline').clientHeight < 100;}
function safeLink(value){try{const u=new URL(value,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function appendMessageBody(bubble,message){
  const body=String(message.body||'');
  // Only the official renewal URL in school system messages becomes a link.
  // Keep user text and all other URLs as text, and never parse message HTML.
  const matches=message.kind==='school'&&message.source==='system'
    ? [...body.matchAll(/https:\/\/selfservice\.ksp\.or\.th\/(?=$|\s)/g)] : [];
  let offset=0;
  for(const match of matches){
    bubble.append(document.createTextNode(body.slice(offset,match.index)));
    const link=node('a','',match[0]);link.href=match[0];link.target='_blank';link.rel='noopener noreferrer';
    bubble.append(link);offset=match.index+match[0].length;
  }
  bubble.append(document.createTextNode(body.slice(offset)));
}
function render(scroll=false){
  const fragment=document.createDocumentFragment(); let day='', previous=null;
  for(const m of [...messages,...(optimistic?[optimistic]:[])]){
    const date=dateLabel(m.created_at); if(date!==day){fragment.append(node('div','day',date));day=date;}
    const outgoing=admin?m.kind==='school':m.kind==='user';
    const grouped=!admin && previous && previous.kind===m.kind && m.created_at-previous.created_at<300000 && dateLabel(previous.created_at)===date;
    const row=node('article','message'+(outgoing?' outgoing':'')+(grouped?' grouped':'')+(m.pending?' pending':''));row.id='message-'+m.kind+'-'+m.id;
    if(!outgoing)row.append(node('span','mini-avatar',admin?'ผู้ใช้':'บปด'));
    const content=node('div','message-content');
    if(!outgoing)content.append(node('div','sender',admin?($('accountName')?.textContent||'ผู้ใช้'):(m.source==='admin-reply'||m.source?.startsWith('reply:'))?'แอดมินโรงเรียน':'โรงเรียนบ้านป่าเด็ง'));
    const bubble=node('div','bubble');
    if(m.title&&!(m.source==='admin-reply'||m.source?.startsWith('reply:')))bubble.append(node('strong','',m.title));
    appendMessageBody(bubble,m);
    let actions=[];try{actions=JSON.parse(m.actions||'[]');}catch{}
    if(admin) for(const a of [...(m.url?[{title:'ดูรายละเอียด ↗',url:m.url}]:[]),...actions]){const href=safeLink(a.url);if(!href)continue;const link=node('a','detail-link',a.title);link.href=href;link.target='_blank';link.rel='noopener noreferrer';bubble.append(link);}
    content.append(bubble,node('time','',m.pending?'กำลังส่ง…':fmtTime(m.created_at)+(outgoing?(admin?' · ส่งแล้ว':' · ส่งแล้ว ✓'):'')));row.append(content);fragment.append(row);previous=m;
  }
  $('messages').replaceChildren(fragment);$('welcome').classList.toggle('hidden',messages.length>0||Boolean(optimistic));$('older').classList.toggle('hidden',!more);
  if(!admin && $('preview')){const last=messages.at(-1);$('preview').textContent=last?(last.kind==='user'?'คุณ: ':'')+(last.body||last.title):'ประกาศและข้อความจากโรงเรียน';}
  if(scroll){$('timeline').scrollTop=$('timeline').scrollHeight;$('newMessages').classList.add('hidden');}
  if(messageId&&!focused){const target=$('message-school-'+messageId);if(target){target.scrollIntoView({block:'center'});target.classList.add('highlight');focused=true;}}
}
async function markRead(){
  if(!active||document.hidden||!embeddedVisible||(!admin&&$('personalSettings')?.open)||(matchMedia('(max-width:700px)').matches&&!$('messenger').classList.contains('room-open'))||!nearBottom())return;
  const at=messages.at(-1)?.created_at;if(!at)return;
  const key=(admin?'admin:':'user:')+ref, previous=readThrough.get(key)||0;
  if(previous>=at)return;
  readThrough.set(key,at);
  try{await api('read'+(admin?'?ref='+encodeURIComponent(ref):''),{method:'POST',body:JSON.stringify({at})});}
  catch(error){if(readThrough.get(key)===at)readThrough.set(key,previous);throw error;}
  $('unread')?.classList.add('hidden');
  notifySchool('school-chat-read');
}
async function load(older=false){
  if(loading||!active||(admin&&!ref))return;loading=true;
  const selected=ref;
  try{
    const params=new URLSearchParams();if(admin)params.set('ref',ref);if(older&&before)params.set('before',before);
    const data=await api('messages?'+params);
    if(admin&&selected!==ref)return;
    if(!admin){
      if(!ref){ref=data.room.ref;$('draft').value=storedDraft();updateDraft();}
      $('accountName').textContent=data.room.label;$('accountInitial').textContent=data.room.label.slice(0,2);
      $('accountRole').textContent=({teacher:'ครู / บุคลากร',parent:'ผู้ปกครอง',student:'นักเรียน'})[data.room.role]||'บัญชีโรงเรียน';
      $('connectAccount').classList.add('hidden');$('logout').classList.remove('hidden');
    }
    const stick=nearBottom(), oldHeight=$('timeline').scrollHeight, oldTop=$('timeline').scrollTop;
    let changed=false;
    for(const m of data.messages){const key=m.kind+'-'+m.id;const old=cache.get(key);if(!old||old.created_at!==m.created_at||old.body!==m.body){changed=true;}cache.set(key,m);}
    messages=[...cache.values()].sort((a,b)=>a.created_at-b.created_at||a.kind.localeCompare(b.kind)||a.id-b.id);
    if(older||!before){before=data.before;more=data.more;}
    if(changed||!messages.length){render(!older&&stick);if(older)$('timeline').scrollTop=oldTop+$('timeline').scrollHeight-oldHeight;else if(!stick){$('timeline').scrollTop=oldTop;$('newMessages').classList.remove('hidden');}}
    if(!admin&&$('unread'))$('unread').classList.toggle('hidden',!messages.some(m=>m.kind==='school'&&m.created_at>data.room.user_read_at));
    state(admin?'ข้อความส่วนตัวกับผู้ใช้ · อัปเดตอัตโนมัติ':'ข้อความอัปเดตแล้ว');
    await markRead();
  }catch(e){state(e.message+' · จะลองเชื่อมต่ออีกครั้ง',true);if(e.status===401)gate();}finally{loading=false;if(!admin&&active&&!$('connection').classList.contains('error'))$('connection').classList.add('quiet');if(admin&&selected!==ref)load();}
}
function renderRooms(){
  const list=$('roomList');list.replaceChildren();const search=$('search').value.toLowerCase();
  for(const room of rooms.filter(r=>(r.label+' '+r.ref).toLowerCase().includes(search))){const row=node('button','conversation'+(ref===room.ref?' active':''));row.append(node('span','avatar',room.label.slice(0,2)));const text=node('span','conversation-copy');text.append(node('span','conversation-title',room.label),node('span','preview',room.preview||'ยังไม่มีข้อความตอบกลับ'));row.append(text);if(room.unread)row.append(node('span','unread',String(room.unread)));row.onclick=()=>selectRoom(room);list.append(row);}
  if(!list.children.length)list.append(node('p','section-label',search?'ไม่พบผู้ใช้':'ยังไม่มีผู้ใช้เปิดห้องข้อความ'));
}
async function loadRooms(){const data=await api('conversations');rooms=data.conversations;renderRooms();}
async function selectRoom(room){
  // Preserve each unsent draft while switching rooms.
  if(ref)sessionStorage.setItem('notifyDraft:'+ref,$('draft').value);
  ref=room.ref;cache.clear();messages=[];before=null;more=false;pendingId=null;
  document.querySelector('.header-copy h2').textContent=room.label;
  $('draft').value=sessionStorage.getItem('notifyDraft:'+ref)||'';updateDraft();
  $('messenger').classList.add('room-open');$('welcome').classList.remove('hidden');$('messages').replaceChildren();
  await load();await loadRooms();
}
function updateDraft(){const d=$('draft');d.style.height='auto';d.style.height=Math.min(140,d.scrollHeight)+'px';$('count').textContent=d.value.length+'/'+max;$('count').classList.toggle('near-limit',d.value.length>=max-200);$('send').disabled=!active||busy||!d.value.trim();}
$('draft').addEventListener('input',()=>{pendingId=null;saveDraft();updateDraft();});
$('draft').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!matchMedia('(pointer:coarse)').matches){e.preventDefault();$('composer').requestSubmit();}});
$('composer').onsubmit=async e=>{
  e.preventDefault();const body=$('draft').value.trim();if(!body||busy||!active)return;busy=true;updateDraft();const selected=ref;
  pendingId ||= crypto.randomUUID();
  $('draft').readOnly=true;
  if(!admin){optimistic={id:'pending',kind:'user',body,created_at:Date.now(),pending:true};render(true);}
  try{const result=await api('messages'+(admin?'?ref='+encodeURIComponent(ref):''),{method:'POST',body:JSON.stringify({body,requestId:pendingId})});
    if(selected===ref){
      if(!admin){const saved={...optimistic,id:result.id,pending:false};cache.set('user-'+result.id,saved);messages=[...cache.values()].sort((a,b)=>a.created_at-b.created_at||a.kind.localeCompare(b.kind)||a.id-b.id);optimistic=null;render(true);}
      $('draft').value='';pendingId=null;saveDraft();$('timeline').scrollTop=$('timeline').scrollHeight;await load();
    }
  }catch(err){optimistic=null;if(!admin)render(true);state(err.message+' · ข้อความยังอยู่ กดส่งเพื่อลองใหม่',true);}finally{busy=false;$('draft').readOnly=false;updateDraft();}
};
$('older').onclick=()=>load(true);
$('newMessages').onclick=()=>{$('timeline').scrollTop=$('timeline').scrollHeight;$('newMessages').classList.add('hidden');markRead().catch(()=>{});};
let readTimer;
$('timeline').onscroll=()=>{if(nearBottom()){$('newMessages').classList.add('hidden');clearTimeout(readTimer);readTimer=setTimeout(()=>markRead().catch(()=>{}),300);}};
if($('back'))$('back').onclick=()=>{$('messenger').classList.remove('room-open');if(admin)loadRooms().catch(()=>{});};
$('openRoom')?.addEventListener('click',()=>{$('messenger').classList.add('room-open');markRead().catch(()=>{});});
$('logout').onclick=async()=>{if(admin){sessionStorage.removeItem('notifyToken');location.href='/admin';}else{await fetch('/api/chat/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});location.href='/';}};
$('search')?.addEventListener('input',renderRooms);
async function init(){
  if(admin){if(!token){gate();return;}await loadRooms();active=true;state('เลือกผู้ใช้เพื่ออ่านและตอบข้อความ');}
  else{
    if(!qs.has('t')&&['role','ref','label'].some(k=>qs.has(k))){location.replace('/setup?'+qs);return;}
    const link=qs.get('t');if(link){$('manifestLink').href='/manifest.webmanifest?t='+encodeURIComponent(link);await api('session',{method:'POST',body:JSON.stringify({token:link})});const clean=new URL(location.href);clean.searchParams.delete('t');history.replaceState(null,'',clean.pathname+clean.search);}
    active=true;$('messenger').classList.add('room-open');await load();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
  }
  $('draft').disabled=false;updateDraft();
  if(active)notifySchool('school-chat-ready');
}
if(!admin) initPersonalSettings();
init().catch(e=>{gate();state(e.message,true);});
setInterval(()=>{if(document.hidden||!active||!embeddedVisible)return;if(admin)loadRooms().catch(e=>state(e.message,true));load();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active&&embeddedVisible){if(admin)loadRooms().catch(()=>{});load();}});
window.addEventListener('online',()=>{if(embeddedVisible)load();});
window.addEventListener('offline',()=>state('ออฟไลน์ · ข้อความร่างของคุณยังอยู่',true));

function initPersonalSettings(){
  const dialog=$('personalSettings'),theme=$('themePreference'),text=$('textPreference');
  let saved={};try{saved=JSON.parse(localStorage.getItem('notifyAppearance')||'{}')||{};}catch{}
  theme.value=['system','light','dark'].includes(saved.theme)?saved.theme:'system';
  text.value=saved.text==='large'?'large':'normal';
  const dark=matchMedia('(prefers-color-scheme: dark)');
  function apply(){
    const mode=theme.value==='system'?(dark.matches?'dark':'light'):theme.value;
    document.body.dataset.theme=mode;document.body.dataset.textSize=text.value;
    document.querySelector('meta[name="theme-color"]').content=mode==='dark'?'#162132':'#ffffff';
    try{localStorage.setItem('notifyAppearance',JSON.stringify({theme:theme.value,text:text.value}));}catch{}
  }
  theme.onchange=text.onchange=apply;dark.addEventListener?.('change',apply);apply();
  function openSettings(){dialog.showModal();}
  $('threadSettings').onclick=$('connectSettings').onclick=openSettings;
  $('closeSettings').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>markRead().catch(()=>{}));
  dialog.addEventListener('click',e=>{if(e.target===dialog){const rect=dialog.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)dialog.close();}});
  $('send').addEventListener('pointerdown',e=>{if(document.activeElement===$('draft'))e.preventDefault();});
  const viewport=window.visualViewport;
  function resize(){const stick=nearBottom();document.documentElement.style.setProperty('--app-height',(embedded?window.innerHeight:(viewport?.height||window.innerHeight))+'px');if(stick)requestAnimationFrame(()=>{$('timeline').scrollTop=$('timeline').scrollHeight;});}
  viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);resize();
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{$('messenger').style.setProperty('--composer-height',$('composer').offsetHeight+'px');}).observe($('composer'));
}

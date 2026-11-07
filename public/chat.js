const $ = id => document.getElementById(id);
const admin = document.body.dataset.admin === 'true';
const qs = new URLSearchParams(location.search);
let token = admin ? sessionStorage.getItem('notifyToken') || '' : '';
let ref = '', rooms = [], messages = [], before = null, more = false, busy = false, active = false, pendingId = null, loading = false;
const cache = new Map();
const messageId = qs.get('message');
let focused = false;
const max = admin ? 1000 : 2000;
const fmtTime = t => new Date(t).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
const fmtDate = t => new Date(t).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});
async function api(path, options = {}) {
  const res = await fetch('/api/chat/' + (admin?'admin/':'') + path, { ...options, headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+token}:{}),...options.headers} });
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ'); e.status=res.status; throw e; }
  return data;
}
function state(text,error=false){ $('connection').textContent=text; $('connection').classList.toggle('error',error); }
function gate(){ active=false; $('gate').classList.remove('hidden'); $('composer').classList.add('hidden'); state('ยังไม่ได้เชื่อมบัญชี'); }
function nearBottom(){return $('timeline').scrollHeight - $('timeline').scrollTop - $('timeline').clientHeight < 100;}
function safeLink(value){try{const u=new URL(value,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function render(scroll=false){
  const fragment=document.createDocumentFragment(); let day='';
  for(const m of messages){
    const date=fmtDate(m.created_at); if(date!==day){fragment.append(node('div','day',date));day=date;}
    const outgoing=admin?m.kind==='school':m.kind==='user';
    const row=node('article','message'+(outgoing?' outgoing':''));row.id='message-'+m.kind+'-'+m.id;
    if(!outgoing)row.append(node('span','mini-avatar',admin?'ผู้ใช้':'บปด'));
    const content=node('div','message-content');
    if(!outgoing)content.append(node('div','sender',admin?($('accountName')?.textContent||'ผู้ใช้'):(m.source==='admin-reply'||m.source?.startsWith('reply:'))?'แอดมินโรงเรียน':'โรงเรียนบ้านป่าเด็ง'));
    const bubble=node('div','bubble');
    if(m.title&&!(m.source==='admin-reply'||m.source?.startsWith('reply:')))bubble.append(node('strong','',m.title));
    bubble.append(document.createTextNode(m.body));
    let actions=[];try{actions=JSON.parse(m.actions||'[]');}catch{}
    for(const a of [...(m.url?[{title:'ดูรายละเอียด ↗',url:m.url}]:[]),...actions]){const href=safeLink(a.url);if(!href)continue;const link=node('a','detail-link',a.title);link.href=href;link.target='_blank';link.rel='noopener noreferrer';bubble.append(link);}
    content.append(bubble,node('time','',fmtTime(m.created_at)+(outgoing?' · ส่งแล้ว':'')));row.append(content);fragment.append(row);
  }
  $('messages').replaceChildren(fragment);$('welcome').classList.toggle('hidden',messages.length>0);$('older').classList.toggle('hidden',!more);
  if(!admin){const last=messages.at(-1);$('preview').textContent=last?(last.kind==='user'?'คุณ: ':'')+(last.body||last.title):'ประกาศและข้อความจากโรงเรียน';}
  if(scroll)$('timeline').scrollTop=$('timeline').scrollHeight;
  if(messageId&&!focused){const target=$('message-school-'+messageId);if(target){target.scrollIntoView({block:'center'});target.classList.add('highlight');focused=true;}}
}
async function markRead(){
  if(!active||document.hidden||(matchMedia('(max-width:700px)').matches&&!$('messenger').classList.contains('room-open'))||!nearBottom())return;
  const at=messages.at(-1)?.created_at;if(!at)return;
  await api('read'+(admin?'?ref='+encodeURIComponent(ref):''),{method:'POST',body:JSON.stringify({at})});
  $('unread')?.classList.add('hidden');
}
async function load(older=false){
  if(loading||!active||(admin&&!ref))return;loading=true;
  const selected=ref;
  try{
    const params=new URLSearchParams();if(admin)params.set('ref',ref);if(older&&before)params.set('before',before);
    const data=await api('messages?'+params);
    if(selected!==ref)return;
    if(!admin){$('accountName').textContent=data.room.label;$('accountInitial').textContent=data.room.label.slice(0,2);}
    const stick=nearBottom(), oldHeight=$('timeline').scrollHeight, oldTop=$('timeline').scrollTop;
    let changed=false;
    for(const m of data.messages){const key=m.kind+'-'+m.id;if(!cache.has(key)){cache.set(key,m);changed=true;}}
    messages=[...cache.values()].sort((a,b)=>a.created_at-b.created_at||a.kind.localeCompare(b.kind)||a.id-b.id);
    if(older||!before){before=data.before;more=data.more;}
    if(changed||!messages.length){render(!older&&stick);if(older)$('timeline').scrollTop=oldTop+$('timeline').scrollHeight-oldHeight;else if(!stick)$('newMessages').classList.remove('hidden');}
    if(!admin)$('unread').classList.toggle('hidden',!messages.some(m=>m.kind==='school'&&m.created_at>data.room.user_read_at));
    state('ข้อความส่วนตัวกับ'+(admin?'ผู้ใช้':'แอดมินโรงเรียน')+' · อัปเดตอัตโนมัติ');
    await markRead();
  }catch(e){state(e.message+' · จะลองเชื่อมต่ออีกครั้ง',true);if(e.status===401)gate();}finally{loading=false;if(selected!==ref)load();}
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
function updateDraft(){const d=$('draft');d.style.height='auto';d.style.height=Math.min(140,d.scrollHeight)+'px';$('count').textContent=d.value.length+'/'+max;$('send').disabled=!active||busy||!d.value.trim();}
$('draft').addEventListener('input',()=>{pendingId=null;updateDraft();});
$('draft').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!matchMedia('(pointer:coarse)').matches){e.preventDefault();$('composer').requestSubmit();}});
$('composer').onsubmit=async e=>{
  e.preventDefault();const body=$('draft').value.trim();if(!body||busy||!active)return;busy=true;updateDraft();const selected=ref;
  pendingId ||= crypto.randomUUID();
  try{await api('messages'+(admin?'?ref='+encodeURIComponent(ref):''),{method:'POST',body:JSON.stringify({body,requestId:pendingId})});
    if(selected===ref){$('draft').value='';pendingId=null;sessionStorage.removeItem('notifyDraft:'+ref);$('timeline').scrollTop=$('timeline').scrollHeight;await load();}
  }catch(err){state(err.message+' · ข้อความยังอยู่ กดส่งเพื่อลองใหม่',true);}finally{busy=false;updateDraft();}
};
$('older').onclick=()=>load(true);
$('newMessages').onclick=()=>{$('timeline').scrollTop=$('timeline').scrollHeight;$('newMessages').classList.add('hidden');markRead().catch(()=>{});};
let readTimer;
$('timeline').onscroll=()=>{if(nearBottom()){$('newMessages').classList.add('hidden');clearTimeout(readTimer);readTimer=setTimeout(()=>markRead().catch(()=>{}),300);}};
$('back').onclick=()=>{$('messenger').classList.remove('room-open');if(admin)loadRooms().catch(()=>{});};
$('openRoom')?.addEventListener('click',()=>{$('messenger').classList.add('room-open');markRead().catch(()=>{});});
$('logout').onclick=async()=>{if(admin){sessionStorage.removeItem('notifyToken');location.href='/admin';}else{await fetch('/api/chat/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});location.href='/';}};
$('search')?.addEventListener('input',renderRooms);
async function init(){
  if(admin){if(!token){gate();return;}await loadRooms();active=true;state('เลือกผู้ใช้เพื่ออ่านและตอบข้อความ');}
  else{
    if(!qs.has('t')&&['role','ref','label'].some(k=>qs.has(k))){location.replace('/setup?'+qs);return;}
    const link=qs.get('t');if(link){$('manifestLink').href='/manifest.webmanifest?t='+encodeURIComponent(link);$('settingsLink').href=$('threadSettings').href='/setup?t='+encodeURIComponent(link);await api('session',{method:'POST',body:JSON.stringify({token:link})});history.replaceState(null,'',messageId?'/?chat=1&message='+encodeURIComponent(messageId):(qs.get('chat')==='1'?'/?chat=1':'/'));}
    active=true;$('logout').classList.remove('hidden');if(messageId||qs.get('chat')==='1')$('messenger').classList.add('room-open');await load();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
  }
  $('draft').disabled=false;updateDraft();
}
init().catch(e=>{gate();state(e.message,true);});
setInterval(()=>{if(document.hidden||!active)return;if(admin)loadRooms().catch(e=>state(e.message,true));load();},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active){if(admin)loadRooms().catch(()=>{});load();}});
window.addEventListener('online',()=>load());

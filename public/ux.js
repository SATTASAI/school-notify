// UX layer shared by admin console, admin inbox and user chat:
// chip filters, fold/unfold long content, floating create button and swipe between admin tabs.
(()=>{
 const d=document,body=d.body,mobile=window.matchMedia('(max-width:700px)');
 const consolePage=body.classList.contains('admin-console');
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;

 /* ---------- Chip filters (the original <select> stays as the source of truth) ---------- */
 const chipRows=[];
 function chipify(select,place='after'){
  if(!select||select.dataset.uxChips)return;select.dataset.uxChips='1';
  const row=d.createElement('div');row.className='ux-chips';row.setAttribute('role','radiogroup');row.setAttribute('aria-label',select.getAttribute('aria-label')||'ตัวกรอง');
  const sync=()=>row.querySelectorAll('.ux-chip').forEach(b=>{const on=b.dataset.value===select.value;b.classList.toggle('active',on);b.setAttribute('aria-checked',String(on));});
  for(const option of select.options){
   const b=d.createElement('button');b.type='button';b.className='ux-chip';b.setAttribute('role','radio');b.dataset.value=option.value;b.textContent=option.textContent;
   b.addEventListener('click',()=>{if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}sync();b.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:reduced()?'auto':'smooth'});});
   row.append(b);
  }
  select.classList.add('ux-chip-source');select.addEventListener('change',sync);
  if(place==='parent')select.parentElement.after(row);else select.after(row);
  chipRows.push(sync);sync();
 }
 ['historyStatus','deviceStatus','deliveryStatus'].forEach(id=>chipify(d.getElementById(id)));
 chipify(d.getElementById('roomRole'),'parent');

 /* ---------- Fold long content ---------- */
 const opened=new Set();
 // Line-clamped text blocks: [selector, key resolver]
 const lineTargets=[
  ['.history-row > div:first-child > p',el=>'h'+(el.closest('.history-row')?.querySelector('[data-detail]')?.dataset.detail||'')],
  ['#previewBody',()=> 'preview'],
  ['#detailContent .message-body',()=> 'detail'],
  ['#confirmContent .message-body',()=> 'confirm']
 ];
 function toggleFor(el,key,labels){
  let t=el.nextElementSibling;
  if(!t||!t.classList.contains('ux-more')){t=d.createElement('button');t.type='button';t.className='ux-more';t.hidden=true;
   t.addEventListener('click',e=>{e.stopPropagation();const open=!el.classList.contains('ux-open');el.classList.toggle('ux-open',open);if(open)opened.add(t.dataset.key);else opened.delete(t.dataset.key);t.textContent=open?labels[1]:labels[0];t.setAttribute('aria-expanded',String(open));});
   el.after(t);}
  t.dataset.key=key;return t;
 }
 function setToggle(t,show,open,labels){const text=open?labels[1]:labels[0];if(t.hidden!==!show)t.hidden=!show;if(t.textContent!==text)t.textContent=text;t.setAttribute('aria-expanded',String(open));}
 function scanLines(){
  for(const [selector,keyOf] of lineTargets)for(const el of d.querySelectorAll(selector)){
   if(!el.offsetParent)continue;
   const key=keyOf(el),labels=['ดูเพิ่ม','ย่อลง'],open=opened.has(key);
   if(!el.classList.contains('ux-clamp'))el.classList.add('ux-clamp');
   if(el.classList.contains('ux-open')!==open)el.classList.toggle('ux-open',open);
   const t=toggleFor(el,key,labels);
   setToggle(t,open||el.scrollHeight>el.clientHeight+2,open,labels);
  }
 }
 // Message bubbles: height fold, keeps links and actions inside.
 function scanBubbles(){
  const timeline=d.getElementById('timeline');
  const atBottom=timeline&&timeline.scrollHeight-timeline.scrollTop-timeline.clientHeight<6;let changed=false;
  for(const el of d.querySelectorAll('.bubble')){
   if(!el.offsetParent||el.dataset.uxFold==='short')continue;
   if(!el.dataset.uxFold){if(el.textContent.length<260){el.dataset.uxFold='short';continue;}el.dataset.uxFold='long';}
   const key='m'+(el.closest('[id]')?.id||el.textContent.slice(0,40)),open=opened.has(key),labels=['อ่านต่อ','ย่อข้อความ'];
   if(!open&&!el.classList.contains('ux-fold')){el.classList.add('ux-fold');changed=true;}
   if(el.classList.contains('ux-open')!==open)el.classList.toggle('ux-open',open);
   const t=toggleFor(el,key,labels);
   const overflow=open||el.scrollHeight>el.clientHeight+8;
   if(!overflow){el.classList.remove('ux-fold');el.dataset.uxFold='short';t.remove();continue;}
   setToggle(t,true,open,labels);
  }
  if(changed&&atBottom)timeline.scrollTop=timeline.scrollHeight;
 }

 /* ---------- Collapsible device cards (mobile) ---------- */
 function scanCards(){
  for(const card of d.querySelectorAll('.device-card')){
   if(card.querySelector(':scope > .ux-card-toggle'))continue;
   const key='d'+(card.dataset.id||''),t=d.createElement('button');t.type='button';t.className='ux-card-toggle';
   const apply=open=>{card.classList.toggle('ux-card-open',open);t.textContent=open?'ซ่อนข้อมูลเครื่อง':'ข้อมูลเครื่อง';t.setAttribute('aria-expanded',String(open));};
   t.addEventListener('click',()=>{const open=!card.classList.contains('ux-card-open');if(open)opened.add(key);else opened.delete(key);apply(open);});
   card.classList.add('ux-card');apply(opened.has(key));
   const actions=card.querySelector(':scope > .actions');if(actions)actions.before(t);else card.append(t);
  }
 }

 let queued=false;
 function scan(){queued=false;scanLines();scanBubbles();if(consolePage)scanCards();chipRows.forEach(sync=>sync());}
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(scan);}
 new MutationObserver(records=>{if(records.some(r=>!(r.target.classList?.contains('ux-more'))))schedule();}).observe(body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','open']});
 window.addEventListener('resize',()=>{d.querySelectorAll('[data-ux-fold="short"]').forEach(el=>delete el.dataset.uxFold);schedule();});
 schedule();

 if(!consolePage)return;
 const tabs=()=>window.NotifyAdmin;

 /* ---------- Floating create button ---------- */
 const fab=d.createElement('button');fab.type='button';fab.className='ux-fab';fab.setAttribute('aria-label','สร้างแจ้งเตือน');
 fab.innerHTML=(window.NotifyAdminUI?.svg?.('compose')||'＋')+'<span>สร้างแจ้งเตือน</span>';
 fab.addEventListener('click',()=>{tabs()?.tab('compose');});body.append(fab);
 const main=d.querySelector('.console-main');let lastTop=0;
 main?.addEventListener('scroll',()=>{const top=main.scrollTop;if(Math.abs(top-lastTop)<8)return;fab.classList.toggle('ux-fab-compact',top>lastTop&&top>60);lastTop=top;},{passive:true});

 /* ---------- Swipe between admin tabs (mobile) ---------- */
 const routes=['overview','compose','history','devices','messages'];
 let start=null,locked=null;
 const ignore=el=>el.closest('input,textarea,select,button,a,label,summary,.ux-chips,dialog,[contenteditable]')||[...function*(){for(let n=el;n&&n!==main;n=n.parentElement)yield n;}()].some(n=>n.scrollWidth>n.clientWidth+4&&getComputedStyle(n).overflowX!=='visible');
 function panel(){return d.querySelector('[data-panel]:not(.hidden)');}
 function reset(){const p=panel();if(p){p.style.transition=reduced()?'':'transform 180ms ease';p.style.transform='';setTimeout(()=>{p.style.transition='';},200);}}
 main?.addEventListener('touchstart',e=>{
  start=null;locked=null;
  if(!mobile.matches||e.touches.length!==1||!body.classList.contains('admin-authenticated')||d.querySelector('dialog[open]')||d.documentElement.classList.contains('admin-keyboard-open'))return;
  const t=e.touches[0];if(t.clientX<24||t.clientX>window.innerWidth-24||ignore(e.target))return;
  start={x:t.clientX,y:t.clientY,time:Date.now()};
 },{passive:true});
 main?.addEventListener('touchmove',e=>{
  if(!start)return;const t=e.touches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  if(locked===null&&Math.hypot(dx,dy)>10)locked=Math.abs(dx)>Math.abs(dy)*1.6?'x':'y';
  if(locked==='x'&&!reduced()){const p=panel();if(p)p.style.transform='translate3d('+dx*0.25+'px,0,0)';}
 },{passive:true});
 function end(e){
  if(!start)return;const t=e.changedTouches?.[0],dx=t?t.clientX-start.x:0,quick=Date.now()-start.time<700,horizontal=locked==='x';start=null;reset();
  if(!horizontal||!quick||Math.abs(dx)<60)return;
  const current=routes.indexOf(tabs()?.current()),next=routes[current+(dx<0?1:-1)];
  if(!next)return;if(next==='messages'){location.href='/inbox';return;}
  tabs()?.tab(next);
 }
 main?.addEventListener('touchend',end,{passive:true});main?.addEventListener('touchcancel',()=>{start=null;reset();},{passive:true});
})();

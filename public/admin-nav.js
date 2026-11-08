// Shared admin navigation. Mobile uses five persistent destinations; desktop keeps the sidebar.
(()=>{
 const consolePage=document.body.classList.contains('admin-console');
 const chatPage=document.body.classList.contains('admin-chat');
 if(!consolePage&&!chatPage)return;
 const icons={overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',compose:'<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="5"/>',history:'<path d="M4 7V3m0 4h4M4 7a9 9 0 1 1-1 7M12 7v5l3 2"/>',devices:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/>',messages:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4h2A8.5 8.5 0 0 1 21 11.5Z"/><path d="M7 10h9M7 14h6"/>'};
 Object.assign(icons,{refresh:'<path d="M20 7v5h-5M4 17v-5h5M6.2 6.2a8 8 0 0 1 13 2M17.8 17.8a8 8 0 0 1-13-2"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',back:'<path d="m15 5-7 7 7 7"/>',send:'<path d="m5 12 7-7 7 7M12 5v15"/>',settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h3l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3Z"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',logout:'<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h12"/>'});
 const svg=key=>'<svg class="admin-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(icons[key]||icons.overview)+'</svg>';
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const running=new WeakMap();
 function animate(el,frames,options={}){if(!el||reduced?.matches||typeof el.animate!=='function')return null;running.get(el)?.cancel();const a=el.animate(frames,{duration:220,easing:'cubic-bezier(.22,.8,.25,1)',...options});running.set(el,a);a.finished?.catch(()=>{});return a;}
 function reveal(el,direction=1){animate(el,[{opacity:.35,transform:'translate3d('+direction*10+'px,6px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}]);}
 function openDialog(dialog){delete dialog.dataset.uiClosing;if(!dialog.open)dialog.showModal();animate(dialog,[{opacity:0,transform:'translate3d(0,24px,0) scale(.985)'},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}],{duration:240});}
 function closeDialog(dialog){if(dialog.dataset.uiClosing)return;dialog.dataset.uiClosing='true';const a=animate(dialog,[{opacity:1,transform:'translate3d(0,0,0)'},{opacity:0,transform:'translate3d(0,16px,0)'}],{duration:130});if(!a){delete dialog.dataset.uiClosing;dialog.close();return;}a.finished.then(()=>{if(running.get(dialog)===a){delete dialog.dataset.uiClosing;dialog.close();}}).catch(()=>{delete dialog.dataset.uiClosing;});}
 function button(id,key,label){const el=document.getElementById(id);if(!el)return;el.innerHTML=svg(key)+(label?'<span class="button-caption">'+label+'</span>':'');if(label)el.setAttribute('aria-label',label);}
 document.querySelectorAll('.console-nav [data-tab]').forEach(el=>{const span=el.querySelector('span');if(span)span.innerHTML=svg(el.dataset.tab);});
 const inboxLink=document.querySelector('.console-nav a[href="/inbox"] span');if(inboxLink)inboxLink.innerHTML=svg('messages');
 button('btnReload','refresh','รีเฟรช');button('btnLogout','logout','ออกจากระบบ');button('closeDetail','close');button('findMessages','search','ค้นหาข้อความ');button('showRoomDetails','person','ข้อมูลผู้ใช้');
 if(chatPage){button('back','back');button('logout','logout');button('send','send');button('settingsLink','settings');}
 document.querySelectorAll('.console-header [data-tab="compose"]').forEach(el=>{el.innerHTML=svg('compose')+'<span>สร้างแจ้งเตือน</span>';});
 document.querySelectorAll('dialog.admin-dialog').forEach(dialog=>dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog(dialog);}));
 const nav=document.createElement('nav');nav.className='admin-bottom-bar';nav.setAttribute('aria-label','เมนูหลักแอดมิน');
 const items=[['overview','ภาพรวม','ภาพรวม'],['compose','สร้าง','สร้างแจ้งเตือน'],['history','ประวัติ','ประวัติการส่ง'],['devices','ผู้รับ','ผู้รับและอุปกรณ์'],['messages','ข้อความ','กล่องข้อความ']];
 for(const [key,label,title] of items){const a=document.createElement('a');a.href=key==='messages'?'/inbox':'/admin?view='+key;a.dataset.adminRoute=key;if(consolePage&&key!=='messages')a.dataset.tab=key;a.setAttribute('aria-label',title);a.innerHTML='<span class="bottom-icon">'+svg(key)+'</span><span>'+label+'</span>';if(key==='messages'){const badge=document.createElement('b');badge.dataset.navUnread='';badge.className='bottom-unread hidden';a.firstElementChild.append(badge);}if(chatPage&&key==='messages'){a.classList.add('active');a.setAttribute('aria-current','page');}nav.append(a);}
 const indicator=document.createElement('span');indicator.className='nav-active-indicator';indicator.setAttribute('aria-hidden','true');nav.prepend(indicator);document.body.append(nav);
 function setActive(key){const index=items.findIndex(item=>item[0]===key);if(index<0)return;nav.style.setProperty('--nav-index',index);nav.querySelectorAll('a').forEach(a=>{const active=a.dataset.adminRoute===key;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
 window.NotifyAdminUI={svg,reveal,animate,openDialog,closeDialog,setActive,reducedMotion:()=>Boolean(reduced?.matches)};setActive(chatPage?'messages':'overview');
 const viewportValues=new Map();
 function value(key,value){if(viewportValues.get(key)===value)return;viewportValues.set(key,value);document.documentElement.style.setProperty(key,value);}
 function viewport(){const v=window.visualViewport;value('--admin-vh',(v?.height||window.innerHeight)+'px');const inset=Math.max(0,window.innerHeight-((v?.height||window.innerHeight)+(v?.offsetTop||0)));value('--admin-keyboard-inset',inset+'px');if(nav.offsetHeight>0)value('--admin-nav-height',nav.offsetHeight+'px');}
 let scheduled=false;function scheduleViewport(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;viewport();});}
 viewport();window.addEventListener('resize',scheduleViewport);window.visualViewport?.addEventListener('resize',scheduleViewport);window.visualViewport?.addEventListener('scroll',scheduleViewport);
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(scheduleViewport).observe(nav);
})();

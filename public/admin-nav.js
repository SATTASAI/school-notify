// Shared admin navigation. Mobile uses five persistent destinations; desktop keeps the sidebar.
(()=>{
 const consolePage=document.body.classList.contains('admin-console');
 const chatPage=document.body.classList.contains('admin-chat');
 if(!consolePage&&!chatPage)return;
 const icons={overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',compose:'<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="5"/>',history:'<path d="M4 7V3m0 4h4M4 7a9 9 0 1 1-1 7M12 7v5l3 2"/>',devices:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 18h4"/>',messages:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4h2A8.5 8.5 0 0 1 21 11.5Z"/><path d="M7 10h9M7 14h6"/>'};
 const nav=document.createElement('nav');nav.className='admin-bottom-bar';nav.setAttribute('aria-label','เมนูหลักแอดมิน');
 const items=[['overview','ภาพรวม','ภาพรวม'],['compose','สร้าง','สร้างแจ้งเตือน'],['history','ประวัติ','ประวัติการส่ง'],['devices','ผู้รับ','ผู้รับและอุปกรณ์'],['messages','ข้อความ','กล่องข้อความ']];
 for(const [key,label,title] of items){const a=document.createElement('a');a.href=key==='messages'?'/inbox':'/admin?view='+key;a.dataset.adminRoute=key;if(consolePage&&key!=='messages')a.dataset.tab=key;a.setAttribute('aria-label',title);a.innerHTML='<span class="bottom-icon"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icons[key]+'</svg></span><span>'+label+'</span>';if(key==='messages'){const badge=document.createElement('b');badge.dataset.navUnread='';badge.className='bottom-unread hidden';a.firstElementChild.append(badge);}if(chatPage&&key==='messages'){a.classList.add('active');a.setAttribute('aria-current','page');}nav.append(a);}
 document.body.append(nav);
 function viewport(){const v=window.visualViewport;document.documentElement.style.setProperty('--admin-vh',(v?.height||window.innerHeight)+'px');const inset=Math.max(0,window.innerHeight-((v?.height||window.innerHeight)+(v?.offsetTop||0)));document.documentElement.style.setProperty('--admin-keyboard-inset',inset+'px');if(nav.offsetHeight>0)document.documentElement.style.setProperty('--admin-nav-height',nav.offsetHeight+'px');}
 viewport();window.addEventListener('resize',viewport);window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(viewport).observe(nav);
})();

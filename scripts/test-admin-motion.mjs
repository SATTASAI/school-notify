import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const script=await readFile(new URL('../public/admin-nav.js',import.meta.url),'utf8');
for(const reduce of [false,true]){
 const dom=new JSDOM('<body class="admin-console"><section id="panel"></section><dialog id="dialog"></dialog></body>',{url:'https://notify.test/admin',runScripts:'outside-only'}),w=dom.window,animations=[],frames=[],listeners={};
 w.matchMedia=()=>({matches:reduce});w.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
 w.visualViewport={height:800,offsetTop:0,addEventListener(type,fn){listeners[type]=fn;}};
 Object.defineProperty(w,'innerHeight',{value:800,writable:true});
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.Element.prototype.animate=function(keyframes,options){let finish,reject;const finished=new Promise((r,j)=>{finish=r;reject=j;});const a={finished,cancelled:false,cancel(){this.cancelled=true;reject(Error('cancelled'));},finish,keyframes,options};animations.push(a);return a;};
 w.eval(script);const ui=w.NotifyAdminUI,nav=w.document.querySelector('.admin-bottom-bar'),panel=w.document.getElementById('panel'),dialog=w.document.getElementById('dialog');
 ui.setActive('devices');assert.equal(nav.style.getPropertyValue('--nav-index'),'3');assert.equal(nav.querySelector('[aria-current=page]').dataset.adminRoute,'devices');
 ui.reveal(panel);ui.reveal(panel,-1);
 if(reduce)assert.equal(animations.length,0);else{assert.equal(animations.length,2);assert(animations[0].cancelled);assert.equal(animations[1].keyframes[0].transform,'translate3d(-10px,6px,0)');}
 ui.openDialog(dialog);assert(dialog.open);ui.closeDialog(dialog);
 if(reduce)assert(!dialog.open);else{assert(dialog.open);animations.at(-1).finish();await Promise.resolve();assert(!dialog.open);}
 w.visualViewport.height=510;listeners.resize();listeners.resize();assert.equal(frames.length,1);frames.shift()();assert.equal(w.document.documentElement.style.getPropertyValue('--admin-vh'),'510px');assert.equal(w.document.documentElement.style.getPropertyValue('--admin-keyboard-inset'),'290px');
 dom.window.close();
}
console.log('✓ Admin motion: interruptible transitions, reduced-motion preference, dialog lifecycle, navigation indicator and coalesced keyboard viewport updates');

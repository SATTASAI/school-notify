import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const file=process.argv[2] || new URL('../public/sw.js',import.meta.url);
const system=/school-system|banpadeng-school-db/.test(String(file));
const origin=system?'https://system.banpadengschool.ac.th':'https://notify.banpadengschool.ac.th';
const source=await readFile(file,'utf8');
function setup({reject=false,lookupFails=false}={}){
 const listeners={},calls=[];let shown;
 const self={location:{origin},addEventListener(name,fn){listeners[name]=fn;},registration:{showNotification(title,data){shown=data;return Promise.resolve();}},clients:{
  openWindow(url){calls.push(['open',url]);return reject?Promise.reject(new Error('openWindow denied')):Promise.resolve(null);},
  async matchAll(){calls.push(['lookup']);if(lookupFails)throw Error('no clients');return [{url:origin+'/dashboard.html',async navigate(url){calls.push(['navigate',url]);return this;},async focus(){calls.push(['focus']);return this;}}];}
 }};
 vm.runInNewContext(source,{self,URL,console:{error(){}}});
 return {listeners,calls,get shown(){return shown;}};
}
async function click(fixture,data={},action=''){
 let pending;fixture.listeners.notificationclick({notification:{data,close(){}},action,waitUntil(p){pending=p;}});
 assert.equal(fixture.calls[0][0],'open','openWindow must run synchronously before asynchronous lookups');
 await pending;return new URL(fixture.calls[0][1]);
}
for(const data of [{id:42,url:'/?message=42'},{url:'https://notify.banpadengschool.ac.th/?message=42'}]){
 const f=setup(),target=await click(f,data);assert.equal(target.origin,origin);assert.equal(target.searchParams.get('message'),'42');assert.equal(target.pathname,system?'/notify-chat.html':'/');assert.equal(f.calls.length,1);
}
const legacy=await click(setup(),{url:'/notification.html?key=leave:12'});assert.equal(legacy.pathname,system?'/notify-chat.html':'/');
const fallback=setup({reject:true});await click(fallback,{id:4});assert.deepEqual(fallback.calls.map(c=>c[0]),['open','lookup','navigate','focus']);
await click(setup({reject:true,lookupFails:true}),{url:'http://['});
const action=await click(setup(),{actions:['/leave.html?request=7']},'a0');assert.equal(action.pathname,'/leave.html');
const external=await click(setup(),{actions:['https://example.com/detail']},'a0');assert.equal(external.pathname,'/go.html');assert.equal(external.searchParams.get('to'),'https://example.com/detail');
for(const path of ['/leave.html?request=7','/leave.html?view=approval&request=7','/notification.html']){
 const workUrl='https://system.banpadengschool.ac.th'+path;
 const target=await click(setup(),{id:42,workUrl});
 assert.equal(system?target.href:target.searchParams.get('to'),workUrl);
 if(!system)assert.equal(target.pathname,'/go.html');
 assert.equal((await click(setup(),{workUrl,actions:['/leave.html?request=8']},'a0')).searchParams.get('request'),'8');
}
assert.equal((await click(setup(),{id:42,workUrl:'https://example.com/leave.html'})).searchParams.get('message'),'42');
const album='https://activity.banpadengschool.ac.th/#/album/7';
assert.equal((await click(setup(),{id:42,workUrl:album})).searchParams.get('to'),album);
assert.equal((await click(setup(),{id:42,workUrl:'https://activity.banpadengschool.ac.th/'})).searchParams.get('message'),'42');
assert.equal((await click(setup(),{actions:['javascript:alert(1)']},'a0')).pathname,system?'/notify-chat.html':'/');
const pushed=setup(),workUrl='https://system.banpadengschool.ac.th/leave.html?request=7';let pending;pushed.listeners.push({data:{json:()=>({id:42,title:'test',workUrl})},waitUntil(p){pending=p;}});await pending;assert.equal(pushed.shown.data.id,42);assert.equal(pushed.shown.data.workUrl,workUrl);
console.log('✓ Notification click: immediate window open, correct origin, message IDs, legacy banners, recovery and action buttons');

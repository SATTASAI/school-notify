import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import worker from '../src/index.js';
const env={UI_VERSION:{id:'release-2'}};
const response=await worker.fetch(new Request('https://notify.test/api/ui-version'),env,{});
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{version:'release-2'});
const source=(await readFile(new URL('../public/chat.js',import.meta.url),'utf8')).split('// Both standalone Notify')[1];
async function run(options={}){
 let reloads=0,requests=0;const listeners={};
 const draft={value:options.draft||''};
 const context={uiVersion:undefined,checkingUI:undefined,active:true,busy:false,loading:false,optimistic:null,embeddedVisible:true,document:{hidden:false,activeElement:null,querySelector:()=>({content:'release-1'}),addEventListener:(type,fn)=>listeners[type]=fn},$:id=>id==='draft'?draft:{open:false},nearBottom:()=>true,saveDraft(){},location:{reload(){reloads++;}},window:{addEventListener:(type,fn)=>listeners[type]=fn},setInterval(fn,ms){assert.equal(ms,60000);},AbortSignal,async fetch(url,opts){requests++;assert.equal(url,'/api/ui-version');assert.equal(opts.cache,'no-store');if(options.fail)throw Error('offline');return {ok:true,json:async()=>({version:options.version??'release-2'})};},...options.context};
 vm.createContext(context);vm.runInContext('// Both standalone Notify'+source,context);await vm.runInContext('refreshUI()',context);return {reloads,requests};
}
assert.deepEqual(await run(),{reloads:1,requests:1});
for(const options of [{draft:'unsent'},{context:{busy:true}},{context:{loading:true}},{context:{optimistic:{}}},{context:{embeddedVisible:false}},{context:{nearBottom:()=>false}},{context:{$:id=>id==='draft'?{value:''}:{open:true}}}])assert.equal((await run(options)).requests,0);
for(const options of [{version:'release-1'},{version:''},{fail:true}])assert.equal((await run(options)).reloads,0);
console.log('✓ UI releases: public noncached version, same-release/offline handling, hidden/draft/send/history/settings guards');

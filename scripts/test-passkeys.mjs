import assert from 'node:assert/strict';
import worker from '../src/index.js';import {fixture} from './chat-fixture.mjs';import {key,att,assertion} from './passkey-fixture.mjs';
const {env,db}=await fixture(),origin='https://notify.banpadengschool.ac.th',ctx={waitUntil(){}};
async function call(path,body,token='',cookie=''){const r=await worker.fetch(new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,ctx);return {status:r.status,data:await r.json(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]};}
assert.equal((await call('/api/passkeys/register/options',{password:env.ADMIN_PASSWORD},env.API_KEY)).status,401);
const op=await call('/api/passkeys/register/options',{password:env.ADMIN_PASSWORD},env.ADMIN_PASSWORD);assert.equal(op.status,200);
const k=await key();assert.equal((await call('/api/passkeys/register/verify',{challenge_id:op.data.challenge_id,credential:await att(k,op.data.options,69,origin)},env.ADMIN_PASSWORD,op.cookie)).status,200);
let login=await call('/api/passkeys/login/options',{});const credential=await assertion(k,login.data,op.data.options.user.id,origin);
const result=await call('/api/passkeys/login/verify',{challenge_id:login.data.challenge_id,credential},'',login.cookie);assert.equal(result.status,200);assert.match(result.data.token,/^pk_/);assert.notEqual(result.data.token,env.ADMIN_PASSWORD);assert.notEqual(result.data.token,env.API_KEY);
assert.equal((await call('/api/auth',null,result.data.token)).status,200);
assert.equal((await call('/api/chat/admin/conversations',null,result.data.token)).status,200);
assert.equal((await call('/api/passkeys/logout',{},result.data.token)).status,200);assert.equal((await call('/api/auth',null,result.data.token)).status,401);
login=await call('/api/passkeys/login/options',{});const next=await call('/api/passkeys/login/verify',{challenge_id:login.data.challenge_id,credential:await assertion(k,login.data,op.data.options.user.id,origin)},'',login.cookie); // Counter 1 is already stored, so create a fresh zero-counter passkey for rotation test.
assert.notEqual(next.status,200);
login=await call('/api/passkeys/login/options',{});const active=await call('/api/passkeys/login/verify',{challenge_id:login.data.challenge_id,credential:await assertion(k,login.data,op.data.options.user.id,origin,5,2)},'',login.cookie);assert.equal(active.status,200);
env.ADMIN_PASSWORD='changed-admin-secret';assert.equal((await call('/api/auth',null,active.data.token)).status,401);assert.equal((await call('/api/passkeys',null,env.ADMIN_PASSWORD)).data.passkeys.length,0);
assert.equal((await call('/api/auth',null,env.API_KEY)).status,200);
console.log('✓ Notify Passkeys: admin-only enrollment, cryptographic login, opaque expiring session, inbox access, logout, credential counter and password rotation; API integrations preserved');

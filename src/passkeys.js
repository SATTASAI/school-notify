import {handlePasskeys,hash,ensurePasskeys} from './lib/passkeys.js';
const ready=new WeakMap();
async function schema(env){if(!ready.has(env.DB)){const p=env.DB.prepare('CREATE TABLE IF NOT EXISTS notify_admin_sessions(token_hash TEXT PRIMARY KEY,version TEXT NOT NULL,expires_at INTEGER NOT NULL)').run().catch(e=>{ready.delete(env.DB);throw e;});ready.set(env.DB,p);}await ready.get(env.DB);}
const version=env=>hash('notify-admin-v1|'+env.ADMIN_PASSWORD);
export async function passkeyAdminSession(request,env){const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!/^pk_[A-Za-z0-9_-]{43}$/.test(token)||!env.ADMIN_PASSWORD)return false;await schema(env);const s=await env.DB.prepare('SELECT version FROM notify_admin_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token),Date.now()).first();return !!s&&s.version===await version(env);}
export async function handleNotifyPasskeys(request,env,safeEqual){
 if(new URL(request.url).pathname==='/api/passkeys/logout'&&request.method==='POST'){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return Response.json({error:'คำขอไม่ถูกต้อง'},{status:403});
  await schema(env);const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');await env.DB.prepare('DELETE FROM notify_admin_sessions WHERE token_hash=?').bind(await hash(token)).run();return Response.json({ok:true});
 }
 if(!env.ADMIN_PASSWORD)return Response.json({error:'ยังไม่ได้ตั้งรหัสผ่านแอดมิน'},{status:503});
 const v=await version(env),admin={id:'admin',username:'notify-admin',full_name:'แอดมิน School Notify',passkey_version:v};
 return handlePasskeys(request,env,{namespace:'notify:'+v,current:async r=>{const token=(r.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');return safeEqual(token,env.ADMIN_PASSWORD)||await passkeyAdminSession(r,env)?admin:null;},lookup:async(r,e,id)=>id==='admin'?admin:null,stepUp:async(r,e,u,password)=>safeEqual(password,env.ADMIN_PASSWORD),issue:async()=>{
  await schema(env);const bytes=crypto.getRandomValues(new Uint8Array(32));const token='pk_'+btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  await env.DB.batch([env.DB.prepare('DELETE FROM notify_admin_sessions WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('INSERT INTO notify_admin_sessions(token_hash,version,expires_at) VALUES(?,?,?)').bind(await hash(token),v,Date.now()+12*3600000)]);
  return Response.json({ok:true,token},{headers:{'Cache-Control':'no-store'}});
 }});
}

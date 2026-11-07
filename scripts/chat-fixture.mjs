import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
export async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  const prepare = sql => {
    let args=[];
    const wrapper = {
      bind(...values){args=values;return wrapper;},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},
    };return wrapper;
  };
  const env={API_KEY:'test-only-secret',ADMIN_PASSWORD:'test-admin',DB:{prepare,async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}}};
  const token=(ref='u:1',role='teacher',exp=Date.now()+3600000)=>{
    const body=Buffer.from(JSON.stringify({ref,role,label:ref==='u:1'?'ครูป่าเด็ง':'ผู้ใช้ '+ref,exp})).toString('base64url');
    return body+'.'+createHmac('sha256',env.API_KEY).update(body).digest('base64url');
  };
  return {db,env,token};
}

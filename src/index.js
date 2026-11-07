import { chatRoute } from './chat.js';
import { generateVapidKeys, sendPush, b64uEncode, b64uDecode } from './webpush.js';

const ROLES = ['teacher', 'parent', 'student'];
const BATCH = 40; // จำนวน push ต่อ 1 รอบ (ต่ำกว่าเพดาน subrequest ของแผนฟรี)
const MAX_REFS = 80;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const now = () => Date.now();

// ---------- helpers ----------
let vapidCache = null;
async function getVapid(env) {
  if (vapidCache) return vapidCache;
  const q = env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'");
  let row = await q.first();
  if (!row) {
    const keys = await generateVapidKeys();
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
    row = await q.first();
  }
  vapidCache = JSON.parse(row.value);
  return vapidCache;
}

const subject = (env) => env.VAPID_SUBJECT || 'https://notify.banpadengschool.ac.th';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(ea, eb);
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function isAuthorized(req, env) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return safeEqual(token, env.API_KEY) || safeEqual(token, env.ADMIN_PASSWORD);
}

// เก็บเป็นชุดแบบ ",a,b," เพื่อค้นด้วย LIKE ได้
const toSet = (arr) => {
  const items = [...new Set((arr || []).map((s) => String(s).trim()).filter(Boolean))];
  return items.length ? `,${items.join(',')},` : ',';
};
const fromSet = (s) => (s || '').split(',').filter(Boolean);
const listInput = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []).map((s) => String(s).trim()).filter(Boolean);

// ลิงก์ผูกบัญชีจากระบบอื่น: t = base64url(JSON {ref, role, label, exp}) + '.' + HMAC-SHA256(API_KEY)
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64uEncode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}
async function verifyLinkToken(env, token, allowExpired = false) {
  if (typeof token !== 'string' || !env.API_KEY) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, await hmac(env.API_KEY, body))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64uDecode(body)));
    if (!data.ref || (!allowExpired && !(data.exp > now())) || !ROLES.includes(data.role)) return null;
    return data;
  } catch { return null; }
}
const TRUSTED_REF = /^u:/; // รหัสที่ผูกด้วยลิงก์ที่ลงชื่อแล้วเท่านั้น พิมพ์เองไม่ได้

async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}

// ---------- subscriptions ----------
async function subscribe(req, env) {
  const b = await readJson(req);
  const sub = b?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !/^https:\/\//.test(sub.endpoint)) {
    return json({ error: 'ข้อมูล subscription ไม่ถูกต้อง' }, 400);
  }
  const link = b.token ? await verifyLinkToken(env, b.token) : null;
  if (b.token && !link) return json({ error: 'ลิงก์เชื่อมบัญชีหมดอายุหรือไม่ถูกต้อง กรุณากดปุ่มจากระบบโรงเรียนอีกครั้ง' }, 400);
  // สมัครได้เฉพาะผ่านลิงก์จากระบบโรงเรียน (ผูกบัญชี) — เปิดให้สมัครเองได้ด้วยตัวแปร OPEN_SUBSCRIBE=true
  if (!link && env.OPEN_SUBSCRIBE !== 'true') return json({ error: 'กรุณาเปิดรับแจ้งเตือนผ่านระบบโรงเรียน (บัญชีของฉัน)' }, 403);
  const roles = listInput(b.roles).filter((r) => ROLES.includes(r));
  if (link && !roles.includes(link.role)) roles.push(link.role);
  if (!roles.length) return json({ error: 'กรุณาเลือกสถานะ (ครู/ผู้ปกครอง/นักเรียน)' }, 400);
  const refs = listInput(b.refs).filter((r) => !TRUSTED_REF.test(r)).slice(0, 20);
  if (link) refs.push(link.ref);
  const label = (link?.label || b.label || '').toString().slice(0, 100) || null;
  const ua = (link && typeof b.userAgent === 'string' ? b.userAgent : req.headers.get('user-agent') || '').slice(0, 200);

  const existing = await env.DB.prepare('SELECT roles, refs FROM subscriptions WHERE endpoint = ?').bind(sub.endpoint).first();
  const mergedRoles = b.replace || !existing ? roles : [...fromSet(existing.roles), ...roles];
  // exclusive (ส่งมาจากระบบโรงเรียน): เครื่องนี้ผูกกับบัญชีล่าสุดที่กดเปิดเท่านั้น — กันเครื่องใช้ร่วมกันได้รับแจ้งเตือนของคนอื่น
  const exclusive = Boolean(link && b.exclusive);
  const existingRefs = existing ? fromSet(existing.refs) : [];
  const keptTrusted = exclusive ? [] : existingRefs.filter((r) => TRUSTED_REF.test(r));
  const mergedRefs = exclusive ? [...existingRefs.filter((r) => !TRUSTED_REF.test(r)), ...refs]
    : b.replace || !existing ? [...keptTrusted, ...refs] : [...existingRefs, ...refs];
  const t = now();
  await env.DB.prepare(
    `INSERT INTO subscriptions (endpoint, p256dh, auth, roles, refs, label, user_agent, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, roles = ?4, refs = ?5,
       label = COALESCE(?6, label), user_agent = ?7, updated_at = ?8, fail_count = 0`
  ).bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, toSet(mergedRoles), toSet(mergedRefs), label, ua, t).run();

  const row = await env.DB.prepare('SELECT roles, refs, label FROM subscriptions WHERE endpoint = ?').bind(sub.endpoint).first();
  return json({ ok: true, roles: fromSet(row.roles), refs: fromSet(row.refs), label: row.label });
}

async function subscriptionInfo(req, env) {
  const b = await readJson(req);
  if (!b?.endpoint) return json({ error: 'missing endpoint' }, 400);
  const row = await env.DB.prepare('SELECT roles, refs, label FROM subscriptions WHERE endpoint = ?').bind(b.endpoint).first();
  if (!row) return json({ subscribed: false });
  return json({ subscribed: true, roles: fromSet(row.roles), refs: fromSet(row.refs), label: row.label });
}

async function unsubscribe(req, env) {
  const b = await readJson(req);
  if (!b?.endpoint) return json({ error: 'missing endpoint' }, 400);
  await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(b.endpoint).run();
  return json({ ok: true });
}

async function testPush(req, env) {
  const b = await readJson(req);
  const row = b?.endpoint && (await env.DB.prepare('SELECT * FROM subscriptions WHERE endpoint = ?').bind(b.endpoint).first());
  if (!row) return json({ error: 'ยังไม่ได้ลงทะเบียน' }, 404);
  const payload = JSON.stringify({ title: 'ทดสอบการแจ้งเตือน', body: 'เครื่องนี้รับการแจ้งเตือนจากโรงเรียนได้แล้ว ✅', url: 'https://notify.banpadengschool.ac.th/?chat=1', tag: 'test' });
  const status = await sendPush(row, payload, await getVapid(env), subject(env)).catch(() => 0);
  return json({ ok: status >= 200 && status < 300, status });
}

// ---------- notifications ----------
function parseSendAt(v) {
  if (v === undefined || v === null || v === '') return now();
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

async function createNotification(req, env, ctx) {
  const b = await readJson(req);
  const title = (b?.title || '').toString().trim().slice(0, 120);
  const body = (b?.body || '').toString().trim().slice(0, 1000);
  if (!title) return json({ error: 'ต้องมีหัวข้อ (title)' }, 400);
  let url = (b.url || '').toString().trim() || null;
  if (url && !/^https?:\/\//.test(url) && !url.startsWith('/')) return json({ error: 'url ต้องขึ้นต้นด้วย http(s):// หรือ /' }, 400);

  let roles = listInput(b.roles);
  roles = roles.includes('all') || !roles.length ? 'all' : roles.filter((r) => ROLES.includes(r)).join(',');
  if (!roles) return json({ error: 'roles ต้องเป็น teacher, parent, student หรือ all' }, 400);
  const refs = listInput(b.refs);
  if (refs.length > MAX_REFS) return json({ error: `refs ได้ไม่เกิน ${MAX_REFS} รายการต่อครั้ง` }, 400);

  // ปุ่มบนแจ้งเตือน (Android/คอมพิวเตอร์ แสดงได้ไม่เกิน 2 ปุ่ม; iPhone ไม่แสดงปุ่ม)
  const actions = (Array.isArray(b.actions) ? b.actions : []).slice(0, 2)
    .map((a) => ({ title: String(a?.title || '').trim().slice(0, 40), url: String(a?.url || '').trim() }))
    .filter((a) => a.title && (/^https?:\/\//.test(a.url) || a.url.startsWith('/')));
  const sendAt = parseSendAt(b.sendAt);
  if (Number.isNaN(sendAt)) return json({ error: 'sendAt ไม่ถูกต้อง' }, 400);
  const scheduled = sendAt > now() + 30_000;
  const t = now();
  const res = await env.DB.prepare(
    `INSERT INTO notifications (title, body, url, roles, refs, source, send_at, status, created_at, updated_at, actions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(title, body, url, roles, refs.length ? JSON.stringify(refs) : null, (b.source || 'api').toString().slice(0, 50),
    sendAt, scheduled ? 'scheduled' : 'queued', t, t, actions.length ? JSON.stringify(actions) : null).run();
  const id = res.meta.last_row_id;
  if (!scheduled) ctx.waitUntil(startSend(env, id));
  return json({ ok: true, id, status: scheduled ? 'scheduled' : 'queued', sendAt }, 201);
}

async function startSend(env, id) {
  const claim = await env.DB.prepare(
    "UPDATE notifications SET status = 'sending', updated_at = ? WHERE id = ? AND status IN ('queued', 'scheduled')"
  ).bind(now(), id).run();
  if (claim.meta.changes !== 1) return;
  const n = await env.DB.prepare('SELECT roles, refs FROM notifications WHERE id = ?').bind(id).first();

  const where = [];
  const binds = [id];
  if (n.roles !== 'all') {
    const roles = n.roles.split(',');
    where.push(`(${roles.map(() => 'roles LIKE ?').join(' OR ')})`);
    binds.push(...roles.map((r) => `%,${r},%`));
  }
  const refs = n.refs ? JSON.parse(n.refs) : [];
  if (refs.length) {
    where.push(`(${refs.map(() => 'refs LIKE ?').join(' OR ')})`);
    binds.push(...refs.map((r) => `%,${r},%`));
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO deliveries (notification_id, subscription_id, status)
     SELECT ?, id, 'pending' FROM subscriptions ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`
  ).bind(...binds).run();
  const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM deliveries WHERE notification_id = ?').bind(id).first();
  await env.DB.prepare('UPDATE notifications SET total = ? WHERE id = ?').bind(c.c, id).run();
  await processBatch(env, id);
}

async function processBatch(env, id) {
  const n = await env.DB.prepare('SELECT * FROM notifications WHERE id = ?').bind(id).first();
  if (!n || n.status !== 'sending') return;
  await env.DB.prepare('UPDATE notifications SET updated_at = ? WHERE id = ?').bind(now(), id).run();

  const { results } = await env.DB.prepare(
    `SELECT d.id AS did, s.id AS sid, s.endpoint, s.p256dh, s.auth
     FROM deliveries d JOIN subscriptions s ON s.id = d.subscription_id
     WHERE d.notification_id = ? AND d.status = 'pending' LIMIT ?`
  ).bind(id, BATCH).all();

  if (results.length) {
    const vapid = await getVapid(env);
    const payload = JSON.stringify({ title: n.title, body: n.body, url: 'https://notify.banpadengschool.ac.th/?chat=1&message=' + n.id, tag: `n${n.id}`, id: n.id, actions: n.actions ? JSON.parse(n.actions) : undefined });
    const statuses = await Promise.all(results.map((r) => sendPush(r, payload, vapid, subject(env)).catch(() => 0)));
    const t = now();
    const stmts = [];
    statuses.forEach((status, i) => {
      const r = results[i];
      const ok = status >= 200 && status < 300;
      stmts.push(env.DB.prepare('UPDATE deliveries SET status = ?, http_status = ? WHERE id = ?').bind(ok ? 'ok' : 'fail', status, r.did));
      if (ok) stmts.push(env.DB.prepare('UPDATE subscriptions SET last_ok_at = ?, fail_count = 0 WHERE id = ?').bind(t, r.sid));
      else if (status === 404 || status === 410) stmts.push(env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(r.sid));
      else stmts.push(env.DB.prepare('UPDATE subscriptions SET fail_count = fail_count + 1 WHERE id = ?').bind(r.sid));
    });
    await env.DB.batch(stmts);
  }
  // ผู้รับที่ถูกลบ subscription ไปแล้วจะไม่ถูก JOIN — ปิดสถานะไว้
  await env.DB.prepare(
    `UPDATE deliveries SET status = 'fail' WHERE notification_id = ? AND status = 'pending'
     AND subscription_id NOT IN (SELECT id FROM subscriptions)`
  ).bind(id).run();

  const left = await env.DB.prepare("SELECT COUNT(*) AS c FROM deliveries WHERE notification_id = ? AND status = 'pending'").bind(id).first();
  if (left.c > 0) return continueLater(env, id);
  await finish(env, id);
}

// เรียกตัวเองผ่าน service binding เพื่อเริ่มรอบใหม่ (ได้โควต้า subrequest ใหม่)
async function continueLater(env, id) {
  if (!env.SELF) return; // ไม่มี binding: cron จะส่งต่อทุกนาที
  await env.SELF.fetch('https://self/internal/continue', {
    method: 'POST',
    headers: { 'x-internal-key': env.API_KEY || '', 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

async function finish(env, id) {
  await env.DB.prepare(
    `UPDATE notifications SET status = 'done', finished_at = ?1, updated_at = ?1,
       sent = (SELECT COUNT(*) FROM deliveries WHERE notification_id = ?2 AND status = 'ok'),
       failed = (SELECT COUNT(*) FROM deliveries WHERE notification_id = ?2 AND status = 'fail')
     WHERE id = ?2`
  ).bind(now(), id).run();
}

async function listNotifications(env) {
  const { results } = await env.DB.prepare(
    `SELECT n.*, (SELECT COUNT(*) FROM deliveries d WHERE d.notification_id = n.id AND d.status = 'ok') AS ok_now
     FROM notifications n ORDER BY n.id DESC LIMIT 50`
  ).all();
  return json({ notifications: results });
}

async function cancelNotification(env, id) {
  const r = await env.DB.prepare("UPDATE notifications SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'")
    .bind(now(), id).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'ยกเลิกได้เฉพาะรายการที่ตั้งเวลาไว้และยังไม่ส่ง' }, 400);
}

async function stats(env) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
       SUM(roles LIKE '%,teacher,%') AS teacher,
       SUM(roles LIKE '%,parent,%') AS parent,
       SUM(roles LIKE '%,student,%') AS student
     FROM subscriptions`
  ).first();
  return json({ total: row.total || 0, teacher: row.teacher || 0, parent: row.parent || 0, student: row.student || 0 });
}

// รหัสที่มีเครื่องรับอยู่ (ให้ระบบอื่นรู้ว่าต้องส่งให้ใคร) เช่น /api/refs?prefix=u:
async function listRefs(env, prefix) {
  const { results } = await env.DB.prepare('SELECT refs FROM subscriptions WHERE refs LIKE ?').bind(`%,${prefix}%`).all();
  const refs = new Set();
  for (const r of results) for (const ref of fromSet(r.refs)) if (ref.startsWith(prefix)) refs.add(ref);
  return json({ refs: [...refs] });
}

function deviceOf(ua, endpoint) {
  const u = ua || '';
  if (/iPhone|iPod/.test(u)) return 'iPhone';
  if (/iPad/.test(u)) return 'iPad';
  if (/Android/.test(u)) return 'Android';
  if (/Windows/.test(u)) return 'คอมพิวเตอร์ (Windows)';
  if (/Macintosh|Mac OS X/.test(u)) return 'คอมพิวเตอร์ (Mac)';
  if (/CrOS|Linux/.test(u)) return 'คอมพิวเตอร์';
  const host = (() => { try { return new URL(endpoint).host; } catch { return ''; } })();
  if (host.endsWith('push.apple.com')) return 'อุปกรณ์ Apple';
  if (host.includes('googleapis.com')) return 'Chrome / Android';
  if (host.includes('mozilla')) return 'Firefox';
  if (host.includes('windows.com')) return 'Edge';
  return 'ไม่ทราบ';
}

// รายการเครื่องที่ผูกรหัสตาม prefix (ให้ระบบโรงเรียนแสดงหน้าตรวจสอบ) — ไม่ส่ง endpoint/คีย์ออกไป
async function listSubscriptions(env, prefix) {
  const { results } = await env.DB.prepare(
    'SELECT id, refs, endpoint, user_agent, created_at, last_ok_at, fail_count FROM subscriptions WHERE refs LIKE ? ORDER BY id'
  ).bind(`%,${prefix}%`).all();
  return json({ subscriptions: results.map((r) => ({
    id: r.id, refs: fromSet(r.refs).filter((x) => x.startsWith(prefix)), device: deviceOf(r.user_agent, r.endpoint),
    created_at: r.created_at, last_ok_at: r.last_ok_at, fail_count: r.fail_count,
  })) });
}

function manifest(url) {
  const t = url.searchParams.get('t');
  const start = t && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(t) ? `/?t=${t}` : '/';
  return new Response(JSON.stringify({
    name: 'แจ้งเตือน โรงเรียนบ้านป่าเด็ง', short_name: 'แจ้งเตือน บปด.', start_url: start, scope: '/', display: 'standalone',
    background_color: '#f4f7fb', theme_color: '#1e66d2', lang: 'th',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }), { headers: { 'content-type': 'application/manifest+json; charset=utf-8' } });
}

// ---------- cron ----------
async function runCron(env) {
  const due = await env.DB.prepare("SELECT id FROM notifications WHERE status = 'scheduled' AND send_at <= ? ORDER BY send_at LIMIT 5")
    .bind(now()).all();
  for (const r of due.results) await startSend(env, r.id);
  // ต่องานที่ค้าง (เช่น ส่งไม่จบเพราะ error)
  const stale = await env.DB.prepare("SELECT id FROM notifications WHERE status IN ('sending', 'queued') AND updated_at < ? LIMIT 5")
    .bind(now() - 120_000).all();
  for (const r of stale.results) {
    const n = await env.DB.prepare('SELECT status FROM notifications WHERE id = ?').bind(r.id).first();
    if (n.status === 'queued') await startSend(env, r.id);
    else await processBatch(env, r.id);
  }
}

// ---------- router ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    const m = req.method;

    try {
      const chat = await chatRoute(req, env, ctx, { verifyLinkToken, hmac, authorized: isAuthorized(req, env), createNotification });
      if (chat) return chat;
      if (p === '/manifest.webmanifest') return manifest(url);
      if (p === '/api/config' && m === 'GET') return json({ openSubscribe: env.OPEN_SUBSCRIBE === 'true' });
      if (p === '/api/vapid-public-key' && m === 'GET') return json({ publicKey: (await getVapid(env)).publicKey });
      if (p === '/api/subscribe' && m === 'POST') return await subscribe(req, env);
      if (p === '/api/subscription' && m === 'POST') return await subscriptionInfo(req, env);
      if (p === '/api/unsubscribe' && m === 'POST') return await unsubscribe(req, env);
      if (p === '/api/test' && m === 'POST') return await testPush(req, env);

      if (p === '/internal/continue' && m === 'POST') {
        if (!safeEqual(req.headers.get('x-internal-key') || '', env.API_KEY)) return json({ error: 'forbidden' }, 403);
        const b = await readJson(req);
        ctx.waitUntil(processBatch(env, Number(b?.id)));
        return json({ ok: true }, 202);
      }

      if (p.startsWith('/api/')) {
        if (!isAuthorized(req, env)) return json({ error: 'unauthorized' }, 401);
        if ((p === '/api/notifications' || p === '/api/send') && m === 'POST') return await createNotification(req, env, ctx);
        if (p === '/api/notifications' && m === 'GET') return await listNotifications(env);
        const cm = p.match(/^\/api\/notifications\/(\d+)\/cancel$/);
        if (cm && m === 'POST') return await cancelNotification(env, Number(cm[1]));
        if (p === '/api/stats' && m === 'GET') return await stats(env);
        if (p === '/api/subscriptions' && m === 'GET') return await listSubscriptions(env, url.searchParams.get('prefix') || 'u:');
        if (p === '/api/refs' && m === 'GET') return await listRefs(env, url.searchParams.get('prefix') || '');
        if (p === '/api/auth' && m === 'GET') return json({ ok: true });
        return json({ error: 'not found' }, 404);
      }
    } catch (e) {
      console.error(e);
      return json({ error: 'server error', detail: String(e?.message || e) }, 500);
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};

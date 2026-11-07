// One private room per signed school account. Push subscription endpoints are not login credentials.
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const CHAT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS conversations (ref TEXT PRIMARY KEY, role TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, user_read_at INTEGER NOT NULL DEFAULT 0, admin_read_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL, body TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(ref, request_id))`,
  `CREATE INDEX IF NOT EXISTS idx_messages_ref_time ON messages(ref, created_at, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reply_request ON notifications(source) WHERE source GLOB 'reply:*'`,
];
let schemaReady;
async function ensureSchema(env) {
  if (!schemaReady) schemaReady = env.DB.batch(CHAT_SCHEMA.map(sql => env.DB.prepare(sql))).catch(e => { schemaReady = null; throw e; });
  await schemaReady;
}
export async function chatRoute(req, env, ctx, { verifyLinkToken, hmac, authorized, createNotification }) {
  const url = new URL(req.url), path = url.pathname, method = req.method;
  if (!path.startsWith('/api/chat/')) return null;
  if (method !== 'GET' && req.headers.get('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'forbidden' }, 403);
  if (method === 'POST' && !(req.headers.get('content-type') || '').startsWith('application/json')) return json({ error: 'ต้องส่งข้อมูล JSON' }, 415);
  const cookie = /(?:^|;\s*)notify_chat=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
  const identity = cookie ? await verifyLinkToken(env, cookie) : null;
  const admin = path.startsWith('/api/chat/admin/');
  if (admin && !authorized) return json({ error: 'unauthorized' }, 401);
  if (path === '/api/chat/session' && method === 'POST') {
    const b = await req.json().catch(() => null);
    const link = await verifyLinkToken(env, b?.token);
    // Installed PWA may retain its original signed start URL after that link expires.
    // An existing valid session may continue only for the same signed account; never renew it from an expired link.
    if (!link && identity) {
      const previous = await verifyLinkToken(env, b?.token, true);
      if (previous?.ref === identity.ref) return json({ ok: true });
    }
    if (!link || typeof link.ref !== 'string' || !link.ref.startsWith('u:')) return json({ error: 'เปิดห้องข้อความจากบัญชีของฉันในระบบโรงเรียนอีกครั้ง' }, 401);
    await ensureSchema(env);
    await env.DB.prepare(`INSERT INTO conversations(ref, role, label, created_at) VALUES(?,?,?,?) ON CONFLICT(ref) DO UPDATE SET role=excluded.role, label=excluded.label`).bind(link.ref, link.role, String(link.label || link.ref).slice(0,100), Date.now()).run();
    const body = btoa(unescape(encodeURIComponent(JSON.stringify({ ref: link.ref, role: link.role, label: link.label, exp: Date.now() + 30*86400000 })))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const signed = body + '.' + await hmac(env.API_KEY, body);
    return json({ ok: true }, 200, { 'set-cookie': `notify_chat=${signed}; HttpOnly; Secure; SameSite=Lax; Path=/api/chat; Max-Age=2592000` });
  }
  if (path === '/api/chat/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': 'notify_chat=; HttpOnly; Secure; SameSite=Lax; Path=/api/chat; Max-Age=0' });
  if (!admin && !identity) return json({ error: 'กรุณาเปิดจากบัญชีของฉันในระบบโรงเรียน' }, 401);
  await ensureSchema(env);
  const ref = admin ? url.searchParams.get('ref') : identity.ref;
  if (path === '/api/chat/admin/conversations' && method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT c.*,
      (SELECT body FROM (
        SELECT body,created_at FROM messages WHERE ref=c.ref
        UNION ALL SELECT body,send_at AS created_at FROM notifications WHERE (source='admin-reply' OR source GLOB 'reply:*') AND status IN ('queued','sending','done') AND EXISTS(SELECT 1 FROM json_each(notifications.refs) WHERE value=c.ref)
      ) ORDER BY created_at DESC LIMIT 1) AS preview,
      MAX(COALESCE((SELECT MAX(created_at) FROM messages WHERE ref=c.ref),0),COALESCE((SELECT MAX(send_at) FROM notifications WHERE (source='admin-reply' OR source GLOB 'reply:*') AND status IN ('queued','sending','done') AND EXISTS(SELECT 1 FROM json_each(notifications.refs) WHERE value=c.ref)),0)) AS last_message_at,
      (SELECT COUNT(*) FROM messages WHERE ref=c.ref AND created_at>c.admin_read_at) AS unread
      FROM conversations c ORDER BY COALESCE(last_message_at,c.created_at) DESC LIMIT 500`).all();
    return json({ conversations: results });
  }
  // School server checks one authenticated user's badge without needing a browser chat cookie.
  // Do not create a conversation or mark messages read just because the bottom bar is visible.
  if (path === '/api/chat/admin/unread' && method === 'GET') {
    if (!/^u:\d+$/.test(ref || '')) return json({ error: 'invalid ref' }, 400);
    const room = await env.DB.prepare('SELECT role,user_read_at FROM conversations WHERE ref=?').bind(ref).first();
    const requestedRole = url.searchParams.get('role');
    const role = room?.role || (['teacher','parent','student'].includes(requestedRole) ? requestedRole : 'teacher');
    const result = await env.DB.prepare(`SELECT EXISTS(
      SELECT 1 FROM notifications
      WHERE status IN ('queued','sending','done') AND send_at<=?3 AND send_at>?4
      AND (roles='all' OR instr(','||roles||',', ','||?2||',')>0)
      AND (refs IS NULL OR EXISTS(SELECT 1 FROM json_each(notifications.refs) WHERE value=?1))
    ) AS unread`).bind(ref,role,Date.now(),room?.user_read_at || 0).first();
    return json({ unread: Boolean(result.unread) });
  }
  if (!ref) return json({ error: 'missing ref' }, 400);
  const room = await env.DB.prepare('SELECT * FROM conversations WHERE ref=?').bind(ref).first();
  if (!room) return json({ error: 'ไม่พบห้องข้อความ' }, 404);
  if ((path === '/api/chat/messages' || path === '/api/chat/admin/messages') && method === 'GET') {
    // Exact role/ref comparison prevents wildcard refs and another account's messages leaking into a room.
    const before = url.searchParams.get('before') || 'z';
    const { results } = await env.DB.prepare(`SELECT *, printf('%016d-%s-%012d',created_at,kind,id) AS cursor FROM (
      SELECT id,'user' AS kind,body,'' AS title,NULL AS url,NULL AS actions,'user' AS source,created_at FROM messages WHERE ref=?1
      UNION ALL
      SELECT id,'school' AS kind,body,title,url,actions,source,send_at AS created_at FROM notifications
      WHERE status IN ('queued','sending','done') AND send_at<=?3
      AND (roles='all' OR instr(','||roles||',', ','||?2||',')>0)
      AND (refs IS NULL OR EXISTS(SELECT 1 FROM json_each(notifications.refs) WHERE value=?1))
    ) WHERE printf('%016d-%s-%012d',created_at,kind,id)<?4 ORDER BY created_at DESC,kind DESC,id DESC LIMIT 101`).bind(ref,room.role,Date.now(),before).all();
    const more = results.length > 100;
    const messages = results.slice(0,100).reverse();
    return json({ room, messages, more, before: messages[0]?.cursor });
  }
  if ((path === '/api/chat/read' || path === '/api/chat/admin/read') && method === 'POST') {
    const b = await req.json().catch(() => null);
    const at = Math.min(Date.now(), Number(b?.at) || 0);
    await env.DB.prepare(`UPDATE conversations SET ${admin?'admin_read_at':'user_read_at'}=MAX(${admin?'admin_read_at':'user_read_at'},?) WHERE ref=?`).bind(at,ref).run();
    return json({ ok: true });
  }
  if (path === '/api/chat/messages' && method === 'POST') {
    const b = await req.json().catch(() => null);
    const body = typeof b?.body === 'string' ? b.body.trim() : '';
    if (!body || body.length>2000 || !/^[\w-]{16,80}$/.test(b?.requestId || '')) return json({ error: 'ข้อความต้องมี 1–2,000 ตัวอักษร' }, 400);
    const existing = await env.DB.prepare('SELECT id FROM messages WHERE ref=? AND request_id=?').bind(ref,b.requestId).first();
    if (existing) return json({ ok: true, id: existing.id });
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE ref=? AND created_at>?').bind(ref,Date.now()-60000).first();
    if (recent.n >= 20) return json({ error: 'ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่' },429);
    const r = await env.DB.prepare('INSERT OR IGNORE INTO messages(ref,body,request_id,created_at) VALUES(?,?,?,?)').bind(ref,body,b.requestId,Date.now()).run();
    return json({ ok: true, id: r.meta.last_row_id },201);
  }
  if (path === '/api/chat/admin/messages' && method === 'POST') {
    const b = await req.json().catch(() => null);
    const body = typeof b?.body === 'string' ? b.body.trim() : '';
    if (!body || body.length>1000) return json({ error: 'ข้อความต้องมี 1–1,000 ตัวอักษร' },400);
    if (!/^[\w-]{16,40}$/.test(b.requestId || '')) return json({ error: 'requestId ไม่ถูกต้อง' },400);
    const source = 'reply:' + b.requestId;
    const find = () => env.DB.prepare('SELECT id,refs FROM notifications WHERE source=?').bind(source).first();
    const existing = await find();
    if (existing) return existing.refs === JSON.stringify([ref]) ? json({ok:true,id:existing.id}) : json({error:'requestId ถูกใช้แล้ว'},409);
    try {
      return await createNotification(new Request(req.url,{ method:'POST', headers:{'content-type':'application/json'},body:JSON.stringify({ title:'ข้อความจากโรงเรียน',body,roles:['all'],refs:[ref],source }) }),env,ctx);
    } catch (e) {
      const saved = await find();
      if (saved && saved.refs === JSON.stringify([ref])) return json({ok:true,id:saved.id});
      throw e;
    }
  }
  return json({ error: 'not found' },404);
}

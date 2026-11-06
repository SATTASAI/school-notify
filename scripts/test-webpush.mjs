// ทดสอบการเข้ารหัส aes128gcm (ถอดรหัสฝั่งผู้รับตาม RFC 8291) และลายเซ็น VAPID
import { encryptPayload, generateVapidKeys, vapidHeader, b64uEncode, b64uDecode } from '../src/webpush.js';
import assert from 'node:assert/strict';

const enc = new TextEncoder();
const s = crypto.subtle;
const hkdf = async (salt, ikm, info, len) =>
  new Uint8Array(await s.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await s.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

// ผู้รับ (เบราว์เซอร์จำลอง)
const ua = await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await s.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));

const message = JSON.stringify({ title: 'ทดสอบ', body: 'สวัสดีผู้ปกครอง 👋', url: '/' });
const body = await encryptPayload(b64uEncode(uaPub), b64uEncode(authSecret), message);

const salt = body.slice(0, 16);
const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
const idlen = body[20];
const asPub = body.slice(21, 21 + idlen);
const cipher = body.slice(21 + idlen);
assert.equal(rs, 4096);
assert.equal(idlen, 65);

const asKey = await s.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const shared = new Uint8Array(await s.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
const plain = new Uint8Array(await s.decrypt({ name: 'AES-GCM', iv: nonce }, await s.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
assert.equal(plain[plain.length - 1], 2);
assert.equal(new TextDecoder().decode(plain.slice(0, -1)), message);
console.log('✓ encrypt/decrypt aes128gcm');

// VAPID
const vapid = JSON.parse(JSON.stringify(await generateVapidKeys()));
const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', vapid, 'https://notify.example');
const [, jwt, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, vapid.publicKey);
const [hd, cl, sig] = jwt.split('.');
const claims = JSON.parse(new TextDecoder().decode(b64uDecode(cl)));
assert.equal(claims.aud, 'https://fcm.googleapis.com');
const pub = await s.importKey('raw', b64uDecode(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await s.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uDecode(sig), enc.encode(`${hd}.${cl}`)));
console.log('✓ VAPID JWT signature');

# school-notify: ระบบแจ้งเตือนกลาง โรงเรียนบ้านป่าเด็ง

ส่งแจ้งเตือนเข้ามือถือด้วย **Web Push (PWA)** ฟรี ไม่มีโควต้า ไม่ต้องติดตั้งแอป
รันบน Cloudflare Worker + D1 (`school-notify-db`) และไม่ใช้ npm package ใดๆ (เข้ารหัสด้วย WebCrypto เอง)

| หน้า | ใช้ทำอะไร |
|---|---|
| `/` | หน้าสมัครรับแจ้งเตือน สำหรับครู ผู้ปกครอง และนักเรียน |
| `/admin` | หน้าแอดมิน ใช้พิมพ์ส่ง ตั้งเวลา ดูประวัติ และยกเลิกรายการ |
| `/api/notifications` | API ให้ระบบอื่นเรียกส่งแจ้งเตือนอัตโนมัติ |

## ติดตั้ง

1. ฐานข้อมูล D1 `school-notify-db` สร้างและลงตารางแล้ว (ถ้าต้องสร้างใหม่ให้รัน `schema.sql`)
2. Deploy โดยเชื่อม repo กับ Cloudflare Workers Builds หรือรัน `npx wrangler deploy`
3. ตั้ง Secrets 2 ตัว (Workers → school-notify → Settings → Variables and Secrets)
   - `API_KEY`: คีย์ยาวๆ สุ่มขึ้นมา ให้ระบบอื่นใช้เรียก API
   - `ADMIN_PASSWORD`: รหัสผ่านเข้าหน้า `/admin`
4. โดเมน `notify.banpadengschool.ac.th` ตั้งไว้ใน `wrangler.jsonc` แล้ว
5. VAPID key ไม่ต้องตั้งเอง ระบบสร้างให้ครั้งแรกและเก็บไว้ในตาราง `settings` (ห้ามลบ ถ้าลบ เครื่องที่สมัครไว้ทั้งหมดต้องสมัครใหม่)

> ถ้า deploy ครั้งแรกขึ้น error เรื่อง service `school-notify` ไม่พบ ให้ลบบล็อก `services` ออกชั่วคราว deploy หนึ่งครั้ง แล้วใส่กลับ
> บล็อกนี้ทำให้ส่งรอบละ 40 เครื่องต่อกันได้ทันที ถ้าไม่มีบล็อกนี้ cron จะส่งต่อให้นาทีละ 40 เครื่อง

## ผู้ใช้สมัครรับแจ้งเตือน

- **Android**: เปิดลิงก์ใน Chrome แล้วกด “เปิดรับการแจ้งเตือน”
- **iPhone** (iOS 16.4 ขึ้นไป): เปิดใน Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม → เปิดจากไอคอน แล้วกดเปิดรับ

ลิงก์เติมข้อมูลให้อัตโนมัติได้ เช่น จากระบบผลการเรียน:

```
https://notify.banpadengschool.ac.th/?role=parent&ref=12345&label=ผู้ปกครองด.ช.ก
```

`role` เป็น `teacher` / `parent` / `student` (ใส่หลายค่าคั่นด้วยจุลภาคได้) ส่วน `ref` คือรหัสนักเรียนหรือรหัสครู

## ระบบอื่นเรียกส่ง (อัตโนมัติ)

```js
await fetch('https://notify.banpadengschool.ac.th/api/notifications', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${env.NOTIFY_API_KEY}` },
  body: JSON.stringify({
    title: 'ฝากเงินสำเร็จ',
    body: 'ด.ช.ก ฝากเงิน 20 บาท ยอดคงเหลือ 540 บาท',
    url: 'https://bank.banpadengschool.ac.th/',
    roles: ['parent'],          // หรือ ['all']
    refs: ['12345'],            // ไม่ใส่ = ส่งทุกคนใน roles
    sendAt: '2026-11-07T07:30:00+07:00', // ไม่ใส่ = ส่งทันที
    source: 'bank',
  }),
});
```

| field | จำเป็น | คำอธิบาย |
|---|---|---|
| `title` | ✓ | หัวข้อ (ไม่เกิน 120 ตัวอักษร) |
| `body` | | ข้อความ (ไม่เกิน 1000 ตัวอักษร) |
| `url` | | ลิงก์ที่เปิดเมื่อแตะแจ้งเตือน |
| `roles` | | `teacher`, `parent`, `student`, `all` (ค่าเริ่มต้น `all`) |
| `refs` | | รหัสผู้รับที่ต้องการ ไม่เกิน 80 รหัสต่อครั้ง |
| `sendAt` | | เวลาส่ง เป็น ISO หรือ ms (ถ้าเกินเวลาปัจจุบัน 30 วินาทีขึ้นไปจะถูกตั้งเวลา) |
| `source` | | ชื่อระบบที่ส่ง ใช้แสดงในประวัติ |

API อื่นๆ (ต้องใช้ Bearer): `GET /api/notifications` (50 รายการล่าสุด), `POST /api/notifications/:id/cancel`, `GET /api/stats`

## ทดสอบ

```
npm test   # ตรวจการเข้ารหัส aes128gcm และลายเซ็น VAPID
```

## ผูกบัญชีจากระบบโรงเรียน (ลิงก์ที่ลงชื่อแล้ว)

ระบบโรงเรียนสร้างลิงก์ `https://notify.banpadengschool.ac.th/?t=<token>` ให้ผู้ใช้กดจากหน้าบัญชีของฉัน
- `token = base64url(JSON {ref, role, label, exp}) + "." + base64url(HMAC-SHA256(API_KEY, ส่วนแรก))`
- `ref` ที่ขึ้นต้นด้วย `u:` (เช่น `u:12` = ผู้ใช้ id 12) ผูกได้ผ่านลิงก์นี้เท่านั้น พิมพ์เองไม่ได้ จึงไม่มีใครรับแจ้งเตือนแทนคนอื่นได้
- `manifest.webmanifest?t=...` ใส่ token ไว้ใน start_url ทำให้ไอคอนบนหน้าจอโฮมของ iPhone เปิดมาพร้อมลิงก์
- `GET /api/refs?prefix=u:` คืนรายการรหัสที่มีเครื่องรับอยู่ ให้ระบบโรงเรียนส่งเฉพาะคนที่เปิดรับไว้

## การสมัคร
ค่าเริ่มต้น: สมัครได้เฉพาะผ่านลิงก์ที่ลงชื่อจากระบบโรงเรียน (ผูกบัญชี) — หน้าเว็บนี้จะแนะนำให้ไปเปิดที่ระบบโรงเรียน
ถ้าต้องการให้คนทั่วไป (เช่น ผู้ปกครอง) สมัครเองได้ ตั้งตัวแปร `OPEN_SUBSCRIBE` = `true`

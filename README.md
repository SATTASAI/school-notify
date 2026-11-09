# school-notify: ระบบแจ้งเตือนกลาง โรงเรียนบ้านป่าเด็ง

ส่งแจ้งเตือนเข้ามือถือด้วย **Web Push (PWA)** ฟรี ไม่มีโควต้า ไม่ต้องติดตั้งแอป
รันบน Cloudflare Worker + D1 (`school-notify-db`) และไม่ใช้ npm package ใดๆ (เข้ารหัสด้วย WebCrypto เอง)

| หน้า | ใช้ทำอะไร |
|---|---|
| `/` | กล่องข้อความส่วนตัวกับโรงเรียน หนึ่งห้องต่อบัญชี |
| `/setup` | ตั้งค่ารับการแจ้งเตือน / คู่มือติดตั้ง PWA |
| `/inbox` | แอดมินอ่านคำตอบและตอบกลับรายบุคคล |
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

## ห้องข้อความ

- เปิดลิงก์ที่ลงชื่อ `/?t=...` จากบัญชีของฉันในระบบโรงเรียน เพื่อเชื่อมบัญชี `u:<id>` และเปิดห้องส่วนตัว ใช้ห้องเดียวกันบนทุกอุปกรณ์ของบัญชีนั้น
- การเชื่อมครั้งแรกสร้าง session cookie แบบ HttpOnly / Secure / SameSite=Lax อายุ 30 วัน ไม่ใช้ endpoint ของ Push เป็นรหัสเข้าห้อง
- ผู้ใช้เห็นประกาศที่ตรงกับบทบาทและรหัสบัญชี รวมกับข้อความที่ตอบแอดมิน ไม่เห็นข้อความของบัญชีอื่น ประวัติย้อนหลังโหลดครั้งละ 100 ข้อความ
- แอดมินเข้าผ่าน `/admin` → “เปิดกล่องข้อความ” หรือ `/inbox` ใช้รหัสผ่านเดิม ค้นหาชื่อ อ่าน และตอบกลับเฉพาะผู้ใช้ได้ การตอบกลับส่ง Web Push ให้เครื่องที่ผูกบัญชีนั้นด้วย
- แตะแบนเนอร์หลักแล้วเปิด `/?message=<id>` ลิงก์รายละเอียดและปุ่มดำเนินงานแสดงเฉพาะฝั่งแอดมิน หน้าแชทผู้ใช้ไม่มีปุ่มออกไปหน้าอื่น ปุ่ม action บนการแจ้งเตือนยังเปิดปลายทางเดิม
- ข้อความอัปเดตทุก 15 วินาทีขณะเปิดหน้า มีจำนวนข้อความใหม่และบันทึกจุดที่อ่าน ไม่มีสถานะออนไลน์หรือใบตอบรับการอ่านแบบเรียลไทม์
- ยังไม่รองรับแนบภาพ เพิ่มเพื่อน สร้างกลุ่ม หรือโทร
- บัญชีที่รับ Push แบบสมัครเองโดยไม่มีลิงก์บัญชี `u:` ยังใช้ `/setup` ได้ แต่ไม่มีสิทธิ์เข้าประวัติห้องส่วนตัว
- ตารางห้องสนทนาและข้อความ รวมถึง index ป้องกันการตอบซ้ำ สร้างอัตโนมัติในการเรียก Chat API ครั้งแรก โดยไม่ลบข้อมูลเดิม (รวมอยู่ใน `schema.sql` ด้วย)

ทดสอบด้วย Node.js 24 ขึ้นไป: `npm test` ตรวจ Web Push และ API ห้องข้อความด้วย SQLite จริง ครอบคลุม session หมดอายุ/ปลอม, การแยกบัญชี/บทบาท, การตอบกลับส่วนตัว, ป้องกันส่งซ้ำ, จุดที่อ่าน และประวัติหลายหน้าที่มีเวลาเดียวกัน

### หน้าแชทผู้ใช้

หน้า `/` เปิดห้องสนทนาเต็มจอทันที ไม่มีแถบรายการห้อง ปุ่มกลับ หรือปุ่มเปิดลิงก์ในข้อความ ตั้งค่าส่วนตัวเปิดเป็นหน้าต่างภายในแชท รองรับธีมตามเครื่อง/สว่าง/มืด และขนาดข้อความปกติ/ใหญ่ บันทึกการแสดงผลเฉพาะอุปกรณ์ ชื่อบัญชีใช้ข้อมูลที่ผูกจากระบบโรงเรียน

ช่องพิมพ์ปรับพื้นที่ตามคีย์บอร์ด เก็บข้อความร่างแยกตามบัญชีใน session ของแท็บ แสดงฟองข้อความทันทีเมื่อกดส่ง และเก็บร่างไว้พร้อมใช้ request ID เดิมเมื่อต้องลองส่งใหม่ ไม่มีการแสดงสถานะออนไลน์หรืออ่านแล้วที่ระบบยังตรวจสอบไม่ได้ หน้าแอดมินยังมีเครื่องมือและลิงก์เดิม

`npm test` รวมการทดสอบหน้าจอด้วย DOM: ห้องเดียว, ไม่มีลิงก์ออกนอกหน้า, ตั้งค่าส่วนตัว, การแสดงผล, การปรับ viewport, ส่งทันที, ร่างไม่สูญหายเมื่อล้มเหลว และการตอบกลับของแอดมิน การทดสอบนี้ไม่ใช่การตรวจภาพหรือทดสอบคีย์บอร์ดบน iPhone จริง

### สถานะจุดแดงจากระบบโรงเรียน

`GET /api/chat/admin/unread?ref=u:<id>&role=teacher` ต้องใช้ Bearer ของเซิร์ฟเวอร์หรือแอดมิน และคืนเฉพาะ `{unread: boolean}` แบบไม่แคช ตรวจเฉพาะข้อความโรงเรียนที่ตรงบัญชี/บทบาทและยังไม่อ่าน ไม่รวมข้อความตอบกลับของผู้ใช้ การตรวจจุดแดงไม่สร้างห้องหรือเปลี่ยนสถานะอ่าน จึงใช้ได้ก่อนผู้ใช้เปิดแชทครั้งแรก สถานะอ่านใช้ตารางเดียวกับหน้าแชททุกอุปกรณ์

### แชทภายใน system

โหมด `?embedded=1&t=<signed account link>` ใช้ภายใน iframe จาก `system.banpadengschool.ac.th` เพื่อคง bottom bar ของแอปโรงเรียน ส่ง signed token ในหน่วยความจำผ่าน `X-Chat-Token` สำหรับ Chat API จึงไม่ต้องพึ่งการยอมรับ cookie ภายใน iframe และไม่เก็บ token ใน localStorage Token ที่ปลอมหรือหมดอายุจะไม่ fallback ไปบัญชีจาก cookie อื่น

แชทรับสถานะแสดง/ย่อเฉพาะจาก parent window ของ origin ระบบโรงเรียน เมื่อย่อจะหยุด polling/บันทึกการอ่านและเก็บร่างไว้ เมื่อกลับมาใช้ DOM เดิมจึงคงตำแหน่งอ่านไว้ บัญชีและการออกจากระบบจัดการจาก system ส่วนหน้าตั้งค่าการแสดงผลยังเปิดภายในแชทเดิม

## Face ID / Passkey — Patch 1.2

เข้าสู่ระบบด้วยรหัสผ่านเดิม แล้วเปิด **ตั้งค่า Passkey** เพื่อเพิ่มอุปกรณ์ ครั้งต่อไปกด **Face ID / Passkey** ได้ รหัสผ่านเดิมยังใช้สำรองได้ บัญชีแอดมินแยกจากบัญชีโรงเรียน และหมุน ADMIN_PASSWORD จะยกเลิก Passkey/session แอดมินเดิม

รัน `npm ci` ก่อนทดสอบ/build ตาราง Passkey สร้างแบบ additive ในคำขอแรก ใช้ HTTPS; ไม่มีการเก็บภาพใบหน้า ลายนิ้วมือ หรือ private key

[รายละเอียด วิธีใช้ ขอบเขต และผลตรวจสอบ](https://github.com/SATTASAI/banpadeng-school-db/blob/main/docs/passkeys.md)


## ศูนย์จัดการแอดมิน Notify — Patch 1.2.1

หน้า `/admin` รวมภาพรวมอุปกรณ์ งานตั้งเวลา งานกำลังส่ง และห้องที่ยังไม่อ่าน แยกหน้าสร้างข้อความพร้อมตัวอย่าง/ตรวจสอบก่อนส่ง ประวัติค้นหาและกรองสถานะพร้อมแบ่งหน้า และผู้รับ/อุปกรณ์ที่เลือกเป็นผู้รับเฉพาะได้ เวลาตั้งส่งอ้างอิง Asia/Bangkok เสมอ

เปิดรายละเอียดรายการเพื่อดูข้อความเต็ม ผู้รับ ต้นทาง เวลา ลิงก์ และผลการส่งรายเครื่องพร้อม HTTP status ใช้ข้อความเดิมเป็นแบบร่างใหม่หรือยกเลิกรายการที่ยังตั้งเวลาได้ ผล Push สำเร็จหมายถึงบริการรับข้อความ ไม่ได้ยืนยันว่าเปิดอ่านแล้ว

`/inbox` เพิ่มตัวกรองยังไม่อ่าน/บทบาท ค้นชื่อ รหัสและข้อความล่าสุด แสดงวันเวลาห้อง เปิดข้อมูลบัญชี/จุดอ่าน และค้นหาในประวัติที่โหลดแล้ว ผู้ใช้ธรรมดายังใช้หน้าแชทเดิม ไม่มีการเพิ่มสิทธิ์แอดมิน

API รายงาน `/api/admin/notifications` และ `/api/admin/notifications/:id` ใช้ authorization เดิม อ่านอย่างเดียว และไม่คืน push endpoint หรือคีย์อุปกรณ์ รองรับแบ่งหน้า 30 รายการ `q`, `status`, `offset` และตัวกรอง `delivery=ok|fail|pending` สำหรับรายละเอียด

ตรวจสอบด้วย `npm test` รวม SQLite จริงและ DOM ของแอดมิน และ `npx wrangler deploy --dry-run` การตรวจ DOM ไม่ทดแทนการทดสอบบนอุปกรณ์จริง

ผู้เชื่อมต่อใหม่ได้รับเฉพาะข้อความต้อนรับรายอุปกรณ์ ไม่ส่งข้อความเดิมย้อนหลัง เมื่อมีข้อความใหม่หลังเชื่อมต่อจึงส่งตามปกติ การเชื่อมซ้ำไม่สร้างข้อความต้อนรับซ้ำ และ System บันทึกข้อความค้างก่อนเชื่อมเป็น baseline รวมใบประกอบวิชาชีพและแจ้งย้ายเดิม


### Admin responsive navigation — Patch 1.2.2

มือถือ (กว้างไม่เกิน 700px) ใช้ bottom bar 5 เมนูร่วมกันที่ `/admin` และ `/inbox`: ภาพรวม สร้าง ประวัติ ผู้รับ และข้อความ รองรับ safe area และปรับพื้นที่ตาม visual viewport เมื่อคีย์บอร์ดเปิด ปุ่มข้อความมีจำนวนห้องที่ยังไม่อ่าน และแตะซ้ำในกล่องแชทเพื่อกลับไปรายชื่อห้อง หน้า console สลับแท็บในหน้าเดิมจึงคงแบบร่าง

PC ใช้เมนูด้านข้างและจัดพื้นที่แชทสองคอลัมน์ตามความกว้างจอ ปรับแบบฟอร์ม/ประวัติ/อุปกรณ์/หน้าต่างรายละเอียดตามอุปกรณ์ เมนูมือถือแสดงหลังยืนยันตัวตนเท่านั้น รองรับการเปิดแท็บตรงด้วย `/admin?view=overview|compose|history|devices`


### Native-style refinement — Patch 1.2.3

ปรับฟอนต์ระบบและขนาดตัวอักษรตามลำดับความสำคัญ ใช้ไอคอน SVG ชุดเดียวในเมนู/เครื่องมือ เพิ่มการตอบสนองตอนแตะ ตัวชี้เมนูเคลื่อนตามแท็บ และ animation ระยะสั้นขณะเปิดหน้า/รายละเอียด โดยรองรับ `prefers-reduced-motion`

มือถือใช้พื้นที่เลื่อนภายใน console พร้อมจำตำแหน่งแยกแท็บและรักษาแบบร่าง ไม่โหลดประวัติซ้ำเมื่อสลับกลับโดยไม่จำเป็น รายชื่อห้องที่ข้อมูลไม่เปลี่ยนจะคง DOM เดิมขณะ polling และข้อความเดิมไม่เล่น animation ซ้ำเมื่อมีข้อความใหม่ การปรับคีย์บอร์ดรวมงานผ่าน animation frame เพื่อลด layout work

ทดสอบ lifecycle ของ dialog/animation การยกเลิก animation ที่ถูกขัดจังหวะ reduced motion การจำ scroll และความคงที่ของรายการห้องด้วย DOM; ยังไม่ใช่ผลทดสอบ frame rate บน iPhone จริง


### Shared room UI and deployment updates (Patch 1.2.4)

`public/index.html`, `chat.css` and `chat.js` are the single user-room implementation, including the signed embedded room in System. Admin-only styles do not apply to this room. Cloudflare `UI_VERSION` metadata is injected into the room HTML; the client compares `/api/ui-version` every 60 seconds and on resume. It reloads only when visible, idle, without a draft or open settings, and at the end of history. HTML is served without storage and CSS/JS require revalidation. System keeps its own bottom bar and iframe container. Deploy Notify to publish room updates to both entry points.


### Shared conversation design and action buttons (Patch 1.2.5)

Both `index.html` (including the System frame) and `inbox.html` load `room-ui.css` **after** their other stylesheets. Change this shared stylesheet for message cards, typography, work buttons, composer and touch feedback. The admin shell and role-specific tools remain in `admin-ui.css`. Both roles use `revealMessage` for new-message movement; sender direction remains relative to the viewer. School message actions and detail URLs render for recipients as well as admins, with safe URL validation/deduplication. Delivery-report links remain admin-only. The System iframe allows user-activated work links to open a new tab without navigating the dashboard.

### Admin desktop composer visibility — School Patch 1.4.1 (9 พฤศจิกายน 2569)

แก้ช่องพิมพ์ตอบกลับใน `/inbox` หลุดออกนอกจอ PC เมื่อมีรายการห้องหรือประวัติข้อความยาว โดยจำกัดแถวของ grid ให้พอดีความสูง messenger, ให้คอลัมน์รายชื่อห้องย่อได้ และให้เลื่อนแยกภายในรายชื่อห้องกับประวัติข้อความ ช่องพิมพ์และส่วนหัวไม่ถูกบีบหรือตัดทิ้ง รายละเอียดผู้ใช้มีความสูงจำกัดและเลื่อนภายในได้ ใช้ร่วมกับความสูงมือถือและ bottom bar เดิม

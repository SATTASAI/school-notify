# AGENTS.md — ระบบแจ้งเตือนกลาง (school-notify)

ส่งแจ้งเตือนเข้ามือถือด้วย Web Push (PWA) ฟรี สำหรับครู ผู้ปกครอง นักเรียน มีกล่องข้อความกับโรงเรียน หน้าแอดมินส่ง/ตั้งเวลา และ API ให้ระบบอื่นเรียก · https://notify.banpadengschool.ac.th

## ข้อมูลระบบ

- Cloudflare Worker `school-notify` (`main: src/worker.js`) + `public/` · cron ทุกนาที (ส่งคิว/ตั้งเวลา)
- D1 `DB` = `school-notify-db` (ฐานของตัวเอง ไม่ใช่ฐานกลาง)
- service binding `SELF` (ส่งต่อรอบละ 40 เครื่อง) · มี entrypoint `ActivityNotifications` ให้ bpdactivity เรียก
- Web Push เข้ารหัสด้วย WebCrypto เอง ไม่ใช้ library push

## วิธีทำงานในรีโปนี้ (สำหรับ agent)

1. อ่านไฟล์นี้, `README.md` และเอกสารใน `docs/` (ถ้ามี) ก่อนแก้ทุกครั้ง
2. ทำเฉพาะขอบเขตที่ได้รับมอบหมาย ไม่ refactor, ไม่เปลี่ยนชื่อไฟล์/ตาราง/endpoint และไม่อัปเกรด dependency ถ้าไม่ได้สั่ง
3. ถ้างานกระทบข้อมูลจริง สิทธิ์ผู้ใช้ เงิน หรือระบบอื่น ให้หยุดถามก่อนลงมือ
4. แก้ให้น้อยที่สุดที่ทำให้งานสำเร็จ และเขียน/ปรับ test ที่ครอบคลุมพฤติกรรมที่เปลี่ยน
5. รันคำสั่งตรวจในหัวข้อ "คำสั่ง" ให้ผ่านทั้งหมดก่อน commit
6. ตอบผู้ใช้เป็นภาษาไทย กระชับ ข้อความ UI ทั้งหมดเป็นภาษาไทย

## คำสั่ง

```sh
npm ci
npm test                 # รัน scripts/test-*.mjs ทั้งชุด (webpush, chat, passkeys, admin ฯลฯ)
npm run dev              # wrangler dev
# deploy: npm run deploy — ทำเมื่อได้รับคำสั่งเท่านั้น
```

## โครงสร้างไฟล์

```
src/worker.js      → entry (fetch + scheduled + entrypoints)
src/index.js       → routes หลัก
src/webpush.js     → VAPID/การเข้ารหัส push
src/chat.js        → กล่องข้อความ · src/welcome.js · src/admin-reports.js · src/passkeys.js
public/            → index (inbox ผู้ใช้), setup, admin, inbox, sw.js (service worker)
schema.sql         → ตารางของ school-notify-db
scripts/test-*.mjs → test
```

## ฐานข้อมูล

- ฐาน `school-notify-db` เป็นของรีโปนี้ · schema อยู่ใน `schema.sql` เปลี่ยนแบบเพิ่มเท่านั้น
- VAPID key เก็บในตาราง `settings` — ห้ามลบ/สร้างใหม่ ไม่งั้นทุกเครื่องต้องสมัครใหม่

## กติกาเฉพาะของระบบ (business rules)

- ระบบอื่นส่งผ่าน `/api/notifications` พร้อม `API_KEY`; รักษารูปแบบ request/response เดิม (หลายระบบเรียกอยู่)
- ลิงก์สมัคร `?role=teacher|parent|student&ref=<รหัส>&label=` ต้องทำงานต่อได้
- iPhone ต้องติดตั้งเป็น PWA (iOS 16.4+) ก่อนรับแจ้งเตือน — อย่าตัดคู่มือใน `/setup`
- การแตะแจ้งเตือนต้องเปิดหน้าปลายทางที่ระบบต้นทางส่งมา (ลิงก์เจาะจงรายการ)
- `sw.js` เปลี่ยนแล้วต้องคำนึงถึง cache/เวอร์ชัน (`UI_VERSION`) ไม่ให้เครื่องเก่าค้าง

## ข้อตกลงการเขียนโค้ด

- เวลาและวันที่อิงเวลาไทย `Asia/Bangkok` (UTC+7) ทุกจุด ทั้งการคำนวณวัน ตัดรอบ และ cron; แสดงปีเป็น พ.ศ. แต่เก็บเป็น ISO/ค.ศ.
- SQL ใช้ prepared statement + `.bind()` เท่านั้น ห้ามต่อสตริงจากค่าที่ผู้ใช้ส่งมา
- ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ทุก endpoint (role/status/session ปัจจุบันจากฐาน) อย่าเชื่อค่าจากหน้าเว็บ
- งานที่เขียนหลายแถวต้องเป็น atomic (`db.batch()`) และกันกดซ้ำ (idempotency key) เมื่อเป็นรายการเงินหรือรายการสำคัญ
- การลบข้อมูลสำคัญใช้ soft delete/ยกเลิกพร้อมเหตุผล และบันทึก audit แทนการลบแถว
- หน้าเว็บต้องใช้ได้บนมือถือ (iPhone Safari/PWA) และจอกว้าง ใช้ฟอนต์และสไตล์เดิมของรีโป
- escape ข้อความก่อนใส่ลง HTML เสมอ (กัน XSS) และอย่าเพิ่ม CDN/สคริปต์ภายนอกใหม่ถ้าไม่จำเป็น

## ความปลอดภัยและ secrets

- secret: `API_KEY` (ให้ระบบอื่นเรียก), `ADMIN_PASSWORD` — ห้ามใส่ในโค้ดหรือ log
- ห้ามคืนข้อมูล subscription/endpoint ของผู้ใช้ผ่าน API สาธารณะ
- ห้าม commit secret, token, รหัสผ่าน, `.env`, `.dev.vars`, ไฟล์สำรองฐานข้อมูล หรือข้อมูลนักเรียน/บุคลากรจริงลง Git
- secret ตั้งผ่าน Cloudflare dashboard หรือ `wrangler secret put` เท่านั้น (`keep_vars: true` ทำให้ค่าที่ตั้งใน dashboard ไม่ถูกทับ)
- ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคลของผู้เยาว์: ห้าม log ชื่อ เลขประจำตัว ที่อยู่ หรือข้อมูลผู้ปกครองลง console/observability
- ห้ามปิดหรือผ่อนการตรวจสิทธิ์ การจำกัดความถี่ล็อกอิน Turnstile หรือ passkey เพื่อให้ทดสอบง่าย

## ห้ามแตะ / ต้องระวังเป็นพิเศษ

- `src/webpush.js` (พังแล้วส่งไม่ได้ทั้งโรงเรียน)
- ตาราง `settings` (VAPID)
- บล็อก `services` ใน `wrangler.jsonc`
- entrypoint `ActivityNotifications` ที่ bpdactivity ผูกอยู่

## ระบบที่เชื่อมกัน

- banpadeng-school-db, publicservice, bpdactivity, students-report: ส่งแจ้งเตือนผ่าน API/binding นี้

## Deploy

- `main` เชื่อม Cloudflare Workers Builds (หรือ `npx wrangler deploy`): merge = ขึ้นจริง
- deploy แรกถ้า service `school-notify` ไม่พบ ให้เอาบล็อก `services` ออกชั่วคราวหนึ่งรอบ (ตาม README)

## เลขเวอร์ชันกลาง (แพทช์ข้ามรีโป)

รีโปนี้เชื่อมกับระบบบริหารโรงเรียน (API แจ้งเตือนที่ system/publicservice/bpdactivity เรียก) จึงอยู่ในขอบเขตแพทช์กลาง:

- ทุกชุดการแก้ไขที่ merge/push เข้า `main` ต้องออกเลขแพทช์ใหม่ใน
  [`SATTASAI/banpadeng-school-db/CHANGELOG.md`](https://github.com/SATTASAI/banpadeng-school-db/blob/main/CHANGELOG.md) รวมงานเอกสาร
- อ่านเลขล่าสุดจาก CHANGELOG นั้นก่อนเสมอ ห้ามนับเลขแยกในรีโปนี้
- งานเล็ก/กลางเพิ่มเลขส่วนที่สาม งานใหญ่เพิ่มเลขส่วนที่สอง งานหลายรีโปในชุดเดียวใช้เลขเดียวและลิงก์ PR ทุกรีโป
- รายละเอียดกติกาอยู่ใน `README.md` ของ banpadeng-school-db หัวข้อ "เวอร์ชันและบันทึก Patch Update"

## Checklist ก่อนเปิด PR / merge

- [ ] ทดสอบส่งจริงเฉพาะเครื่องทดสอบ ห้ามส่ง broadcast ถึงผู้ใช้ระหว่างพัฒนา
- [ ] test และ syntax check ทั้งหมดผ่าน
- [ ] ไม่มี secret/ข้อมูลจริงใน diff (`git diff --cached` ตรวจก่อน commit)
- [ ] ไม่แก้ `database_id`, `routes`, `services` และชื่อ Worker ใน wrangler config โดยไม่ได้สั่ง
- [ ] schema เปลี่ยนแบบเพิ่มเท่านั้น (add table/column) และรันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหรือระบบอื่นพัง
- [ ] อัปเดต `README.md`/`docs/` เมื่อพฤติกรรมหรือขั้นตอนติดตั้งเปลี่ยน และบันทึกการตัดสินใจถาวรของผู้ใช้ลงไฟล์นี้
- [ ] commit/PR อธิบายเป็นภาษาไทยว่าเปลี่ยนอะไร เพราะอะไร และทดสอบอย่างไร

// A welcome is queued only for the newly connected device, never other subscribers.
export async function queueWelcome(env,subscription,link,at){
 const source='welcome:'+subscription.id+':'+(link?.ref||'device');
 const refs=JSON.stringify([link?.ref||'device:'+subscription.id]);
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO notifications(title,body,url,roles,refs,source,send_at,status,created_at,updated_at)
   SELECT ?,?,?, 'all',?, ?,?,'sending',?,? WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE source=?)`)
   .bind('ยินดีต้อนรับสู่ School Notify','เชื่อมต่อการแจ้งเตือนโรงเรียนบ้านป่าเด็งสำเร็จแล้ว คุณจะได้รับข้อความใหม่หลังจากนี้ และพิมพ์ตอบกลับแอดมินในห้องข้อความได้','https://notify.banpadengschool.ac.th/',refs,source,at,at,at,source),
  env.DB.prepare(`INSERT OR IGNORE INTO deliveries(notification_id,subscription_id,status)
   SELECT id,?,'pending' FROM notifications WHERE source=?`).bind(subscription.id,source),
  env.DB.prepare(`UPDATE notifications SET total=(SELECT COUNT(*) FROM deliveries WHERE notification_id=notifications.id) WHERE source=?`).bind(source),
 ]);
 return env.DB.prepare('SELECT id,status FROM notifications WHERE source=?').bind(source).first();
}

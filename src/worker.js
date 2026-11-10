import { WorkerEntrypoint } from 'cloudflare:workers';
import { createNotification } from './index.js';

export { default } from './index.js';

// This entrypoint is available through an internal service binding, outside the public API.
export class ActivityNotifications extends WorkerEntrypoint {
  async send(message) {
    if (!Array.isArray(message?.refs) || !message.refs.length || !message.refs.every(ref => /^u:\d+$/.test(ref))) {
      return { ok: false };
    }
    const request = new Request('https://notify.banpadengschool.ac.th/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...message, source: 'bpdactivity-album', roles: ['all'] }),
    });
    return (await createNotification(request, this.env, this.ctx)).json();
  }
}

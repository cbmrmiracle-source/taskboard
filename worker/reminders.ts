import { DEFAULT_REMINDER_TIME, zonedToUtc } from '../shared/dates';
import { all, Env, first, run } from './http';
import { generateVapidKeys, PushMessage, PushSubscriptionRow, sendPush, VapidKeys } from './push';

const DEFAULT_SUBJECT = 'mailto:admin@example.com';

/** Loads the push keys, generating and storing them on first use. */
export async function getVapidKeys(env: Env): Promise<VapidKeys> {
  const row = await first<{ value: string }>(env, "SELECT value FROM app_settings WHERE key = 'vapid'");
  if (row) return JSON.parse(row.value);
  const keys = await generateVapidKeys();
  await run(env, "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vapid', ?)", JSON.stringify(keys));
  const stored = await first<{ value: string }>(env, "SELECT value FROM app_settings WHERE key = 'vapid'");
  return JSON.parse(stored!.value);
}

export async function pushToUser(env: Env, userId: string, message: PushMessage): Promise<number> {
  const subs = await all<PushSubscriptionRow>(env, 'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', userId);
  if (!subs.length) return 0;
  const keys = await getVapidKeys(env);
  let sent = 0;
  for (const sub of subs) {
    try {
      const status = await sendPush(sub, message, keys, env.VAPID_SUBJECT || DEFAULT_SUBJECT);
      if (status === 404 || status === 410) {
        await run(env, 'DELETE FROM push_subscriptions WHERE endpoint = ?', sub.endpoint);
      } else if (status >= 200 && status < 300) {
        sent++;
      } else {
        console.warn(`Push service returned ${status} for ${new URL(sub.endpoint).host}`);
      }
    } catch (err) {
      console.error('Push failed', err);
    }
  }
  return sent;
}

interface DueRow {
  id: string;
  title: string;
  board_id: string;
  board_name: string;
  due_date: string;
  due_time: string | null;
  tz: string;
  recipient: string | null;
}

function describeDue(r: DueRow): string {
  const at = zonedToUtc(r.due_date, r.due_time ?? DEFAULT_REMINDER_TIME, r.tz);
  const opts: Intl.DateTimeFormatOptions = { timeZone: r.tz, weekday: 'short', month: 'short', day: 'numeric' };
  if (r.due_time) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(at));
}

/** Runs every minute from the cron trigger. */
export async function sendDueReminders(env: Env): Promise<void> {
  const ts = Date.now();
  const due = await all<DueRow>(
    env,
    `SELECT t.id, t.title, t.board_id, b.name AS board_name, t.due_date, t.due_time, t.tz,
       COALESCE(t.owner_id, t.created_by) AS recipient
     FROM tasks t JOIN boards b ON b.id = t.board_id
     WHERE t.reminder_at <= ? AND t.reminded_at IS NULL AND t.completed_at IS NULL
     ORDER BY t.reminder_at LIMIT 200`,
    ts,
  );
  if (!due.length) return;
  // Mark first so an overlapping run can't send the same reminder twice.
  await env.DB.batch(due.map((r) => env.DB.prepare('UPDATE tasks SET reminded_at = ? WHERE id = ?').bind(ts, r.id)));
  for (const r of due) {
    if (!r.recipient) continue;
    await pushToUser(env, r.recipient, {
      title: r.title,
      body: `Due ${describeDue(r)} · ${r.board_name}`,
      url: `/#/board/${r.board_id}/task/${r.id}`,
      tag: r.id,
    });
  }
}

import type { ChecklistItem, StatusLabel, User } from '../shared/types';
import { DEFAULT_STATUSES, PALETTE } from '../shared/types';
import { addDays, isValidTimeZone, nextOccurrence, todayIn } from '../shared/dates';
import { createSession, currentUser, destroySession, hashPassword, timingSafeEqual } from './auth';
import { all, color, Ctx, Env, first, HttpError, json, newId, now, num, requiredStr, run, str } from './http';
import { getVapidKeys, pushToUser, sendDueReminders } from './reminders';
import {
  boardGroups,
  createTask,
  firstOpenStatus,
  getBoard,
  getTask,
  TASK_SELECT,
  toBoard,
  toTask,
  updateTask,
} from './tasks';

type Handler = (c: Ctx) => Promise<Response> | Response;
interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  public?: boolean;
}

const routes: Route[] = [];
function route(method: string, path: string, handler: Handler, opts: { public?: boolean } = {}) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, pattern, keys, handler, ...opts });
}

type Row = Record<string, unknown>;

// ---------- Accounts ----------

async function userCount(env: Env): Promise<number> {
  return (await first<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM users'))!.n;
}

route(
  'GET',
  '/api/auth/status',
  async ({ env }) => {
    const n = await userCount(env);
    return json({ hasUsers: n > 0, signupOpen: n === 0 || !!env.INVITE_CODE });
  },
  { public: true },
);

route(
  'POST',
  '/api/auth/signup',
  async ({ env, body }) => {
    const name = requiredStr(body.name, 'Name', 80);
    const email = requiredStr(body.email, 'Email', 200).toLowerCase();
    const password = str(body.password, 'Password', 200);
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    const n = await userCount(env);
    if (n > 0) {
      if (!env.INVITE_CODE) throw new HttpError(403, 'New accounts are closed. Ask the owner to set an invite code.');
      if (!timingSafeEqual(String(body.invite ?? '').trim(), env.INVITE_CODE)) throw new HttpError(403, 'Wrong invite code');
    }
    if (await first(env, 'SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'That email already has an account');
    const tz = isValidTimeZone(body.timezone) ? body.timezone : 'UTC';
    const { hash, salt } = await hashPassword(password);
    const id = newId();
    await run(
      env,
      'INSERT INTO users (id, name, email, pass_hash, pass_salt, color, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      name,
      email,
      hash,
      salt,
      PALETTE[n % PALETTE.length],
      tz,
      now(),
    );
    if (n === 0) await createStarterBoard(env, id, tz);
    return json({ ok: true }, 201, { 'set-cookie': await createSession(env, id) });
  },
  { public: true },
);

route(
  'POST',
  '/api/auth/login',
  async ({ env, body }) => {
    const email = str(body.email, 'Email', 200).toLowerCase();
    const password = str(body.password, 'Password', 200);
    const u = await first<{ id: string; pass_hash: string; pass_salt: string }>(
      env,
      'SELECT id, pass_hash, pass_salt FROM users WHERE email = ?',
      email,
    );
    const check = await hashPassword(password, u?.pass_salt ?? 'AAAAAAAAAAAAAAAAAAAAAA');
    if (!u || !timingSafeEqual(check.hash, u.pass_hash)) throw new HttpError(401, 'Wrong email or password');
    if (isValidTimeZone(body.timezone)) await run(env, 'UPDATE users SET timezone = ? WHERE id = ?', body.timezone, u.id);
    return json({ ok: true }, 200, { 'set-cookie': await createSession(env, u.id) });
  },
  { public: true },
);

route('POST', '/api/auth/logout', async ({ req, env }) => json({ ok: true }, 200, { 'set-cookie': await destroySession(req, env) }));

route('GET', '/api/me', ({ user }) => json(user));

route('PATCH', '/api/me', async ({ env, user, body }) => {
  const name = 'name' in body ? requiredStr(body.name, 'Name', 80) : user.name;
  const c = 'color' in body ? color(body.color) : user.color;
  const tz = 'timezone' in body && isValidTimeZone(body.timezone) ? body.timezone : user.timezone;
  await run(env, 'UPDATE users SET name = ?, color = ?, timezone = ? WHERE id = ?', name, c, tz, user.id);
  return json({ ...user, name, color: c, timezone: tz });
});

route('POST', '/api/me/password', async ({ env, user, body }) => {
  const u = (await first<{ pass_hash: string; pass_salt: string }>(env, 'SELECT pass_hash, pass_salt FROM users WHERE id = ?', user.id))!;
  const check = await hashPassword(str(body.current, 'Current password', 200), u.pass_salt);
  if (!timingSafeEqual(check.hash, u.pass_hash)) throw new HttpError(400, 'Current password is wrong');
  const pw = str(body.password, 'Password', 200);
  if (pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const { hash, salt } = await hashPassword(pw);
  await run(env, 'UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?', hash, salt, user.id);
  return json({ ok: true });
});

route('GET', '/api/users', async ({ env }) =>
  json(await all<User>(env, 'SELECT id, name, email, color, timezone FROM users ORDER BY name')),
);

// ---------- Boards & groups ----------

async function createStarterBoard(env: Env, userId: string, tz: string) {
  const boardId = newId();
  const ts = now();
  const g1 = newId();
  const g2 = newId();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO boards (id, name, description, statuses, position, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)').bind(
      boardId,
      'My tasks',
      '',
      JSON.stringify(DEFAULT_STATUSES),
      userId,
      ts,
    ),
    env.DB.prepare('INSERT INTO task_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, 1)').bind(g1, boardId, 'This week', '#579bfc'),
    env.DB.prepare('INSERT INTO task_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, 2)').bind(g2, boardId, 'Later', '#a25ddc'),
  ]);
  const samples = [
    { title: 'Tap a task to open it — add notes, subtasks and a checklist', status: 'working', priority: 'medium' },
    {
      title: 'Weekly review (repeats every Friday)',
      status: 'todo',
      priority: 'high',
      recurrence: { freq: 'weekly', interval: 1, weekdays: [5] },
      due_date: nextOccurrence({ freq: 'weekly', interval: 1, weekdays: [5] }, addDays(todayIn(tz), -1)),
    },
    { title: 'Turn on notifications in Settings to get reminders', status: 'todo', priority: '' },
  ];
  for (const s of samples) {
    await createTask(env, { ...s, board_id: boardId, group_id: g1, owner_id: userId, tz }, userId, tz);
  }
}

route('GET', '/api/boards', async ({ env }) => {
  const rows = await all<Row>(
    env,
    `SELECT b.*, (SELECT COUNT(*) FROM tasks t WHERE t.board_id = b.id AND t.parent_id IS NULL AND t.completed_at IS NULL) AS open_count
     FROM boards b ORDER BY b.position`,
  );
  return json(rows.map(toBoard));
});

route('POST', '/api/boards', async ({ env, user, body }) => {
  const name = requiredStr(body.name, 'Board name', 120);
  const id = newId();
  const max = await first<{ p: number }>(env, 'SELECT MAX(position) AS p FROM boards');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO boards (id, name, description, statuses, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      id,
      name,
      '',
      JSON.stringify(DEFAULT_STATUSES),
      (max?.p ?? 0) + 1,
      user.id,
      now(),
    ),
    env.DB.prepare('INSERT INTO task_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, 1)').bind(newId(), id, 'To do', '#579bfc'),
  ]);
  return json(await getBoard(env, id), 201);
});

route('GET', '/api/boards/:id', async ({ env, params }) => {
  const board = await getBoard(env, params.id);
  const groups = await boardGroups(env, board.id);
  const tasks = (await all<Row>(env, `${TASK_SELECT} WHERE t.board_id = ? ORDER BY t.position`, board.id)).map(toTask);
  return json({ board, groups, tasks });
});

function parseStatuses(v: unknown): StatusLabel[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 30) throw new HttpError(400, 'A board needs at least one status');
  const seen = new Set<string>();
  const out = v.map((s: Record<string, unknown>) => {
    const key = typeof s.key === 'string' && s.key ? s.key.slice(0, 50) : newId().slice(0, 8);
    if (seen.has(key)) throw new HttpError(400, 'Duplicate status');
    seen.add(key);
    return { key, label: requiredStr(s.label, 'Status name', 40), color: color(s.color), ...(s.done ? { done: true } : {}) };
  });
  return out;
}

route('PATCH', '/api/boards/:id', async ({ env, params, body }) => {
  const board = await getBoard(env, params.id);
  const name = 'name' in body ? requiredStr(body.name, 'Board name', 120) : board.name;
  const description = 'description' in body ? str(body.description, 'Description', 2000) : board.description;
  const position = 'position' in body ? num(body.position, 'Position') : board.position;
  const stmts: D1PreparedStatement[] = [];
  let statuses = board.statuses;
  if ('statuses' in body) {
    statuses = parseStatuses(body.statuses);
    const keys = statuses.map((s) => s.key);
    const fallback = firstOpenStatus(statuses);
    stmts.push(
      env.DB.prepare(`UPDATE tasks SET status = ? WHERE board_id = ? AND status NOT IN (${keys.map(() => '?').join(',')})`).bind(
        fallback,
        board.id,
        ...keys,
      ),
    );
    const doneKeys = statuses.filter((s) => s.done).map((s) => s.key);
    const list = doneKeys.length ? doneKeys.map(() => '?').join(',') : "''";
    stmts.push(
      env.DB.prepare(`UPDATE tasks SET completed_at = NULL WHERE board_id = ? AND status NOT IN (${list})`).bind(board.id, ...doneKeys),
      env.DB.prepare(`UPDATE tasks SET completed_at = ? WHERE board_id = ? AND completed_at IS NULL AND status IN (${list})`).bind(
        now(),
        board.id,
        ...doneKeys,
      ),
    );
  }
  stmts.unshift(
    env.DB.prepare('UPDATE boards SET name = ?, description = ?, position = ?, statuses = ? WHERE id = ?').bind(
      name,
      description,
      position,
      JSON.stringify(statuses),
      board.id,
    ),
  );
  await env.DB.batch(stmts);
  return json(await getBoard(env, board.id));
});

route('DELETE', '/api/boards/:id', async ({ env, params }) => {
  await run(env, 'DELETE FROM boards WHERE id = ?', params.id);
  return json({ ok: true });
});

route('POST', '/api/groups', async ({ env, body }) => {
  const board = await getBoard(env, str(body.board_id, 'Board', 64));
  const name = requiredStr(body.name, 'Group name', 120);
  const c = body.color ? color(body.color) : PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const max = await first<{ p: number; mn: number }>(env, 'SELECT MAX(position) AS p, MIN(position) AS mn FROM task_groups WHERE board_id = ?', board.id);
  const position = body.top ? (max?.mn ?? 1) - 1 : (max?.p ?? 0) + 1;
  const id = newId();
  await run(env, 'INSERT INTO task_groups (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)', id, board.id, name, c, position);
  return json({ id, board_id: board.id, name, color: c, position, collapsed: false }, 201);
});

route('PATCH', '/api/groups/:id', async ({ env, params, body }) => {
  const g = await first<Row>(env, 'SELECT * FROM task_groups WHERE id = ?', params.id);
  if (!g) throw new HttpError(404, 'Group not found');
  const name = 'name' in body ? requiredStr(body.name, 'Group name', 120) : g.name;
  const c = 'color' in body ? color(body.color) : g.color;
  const collapsed = 'collapsed' in body ? (body.collapsed ? 1 : 0) : g.collapsed;
  const position = 'position' in body ? num(body.position, 'Position') : g.position;
  await run(env, 'UPDATE task_groups SET name = ?, color = ?, collapsed = ?, position = ? WHERE id = ?', name, c, collapsed, position, params.id);
  return json({ id: g.id, board_id: g.board_id, name, color: c, position, collapsed: !!collapsed });
});

route('DELETE', '/api/groups/:id', async ({ env, params }) => {
  await run(env, 'DELETE FROM task_groups WHERE id = ?', params.id);
  return json({ ok: true });
});

// ---------- Tasks ----------

route('GET', '/api/my-work', async ({ env, user }) => {
  const tasks = (
    await all<Row>(env, `${TASK_SELECT} WHERE t.owner_id = ? AND t.completed_at IS NULL ORDER BY t.due_date IS NULL, t.due_date, t.due_time`, user.id)
  ).map(toTask);
  const boards = (await all<Row>(env, 'SELECT * FROM boards ORDER BY position')).map(toBoard);
  return json({ tasks, boards });
});

route('POST', '/api/tasks', async ({ env, user, body }) => json(await createTask(env, body, user.id, user.timezone), 201));

route('GET', '/api/tasks/:id', async ({ env, params }) => {
  const task = await getTask(env, params.id);
  const subtasks = (await all<Row>(env, `${TASK_SELECT} WHERE t.parent_id = ? ORDER BY t.position`, task.id)).map(toTask);
  const checklist = (await all<Row>(env, 'SELECT * FROM checklist_items WHERE task_id = ? ORDER BY position', task.id)).map(
    (r): ChecklistItem => ({ id: r.id as string, task_id: r.task_id as string, text: r.text as string, done: !!r.done, position: r.position as number }),
  );
  const board = await getBoard(env, task.board_id);
  return json({ task, subtasks, checklist, board, groups: await boardGroups(env, board.id) });
});

route('PATCH', '/api/tasks/:id', async ({ env, user, params, body }) => json(await updateTask(env, params.id, body, user.id)));

route('DELETE', '/api/tasks/:id', async ({ env, params }) => {
  await run(env, 'DELETE FROM tasks WHERE id = ?', params.id);
  return json({ ok: true });
});

route('POST', '/api/tasks/:id/checklist', async ({ env, params, body }) => {
  const task = await getTask(env, params.id);
  const text = requiredStr(body.text, 'Item', 500);
  const max = await first<{ p: number }>(env, 'SELECT MAX(position) AS p FROM checklist_items WHERE task_id = ?', task.id);
  const item: ChecklistItem = { id: newId(), task_id: task.id, text, done: false, position: (max?.p ?? 0) + 1 };
  await run(env, 'INSERT INTO checklist_items (id, task_id, text, done, position) VALUES (?, ?, ?, 0, ?)', item.id, item.task_id, text, item.position);
  return json(item, 201);
});

route('PATCH', '/api/checklist/:id', async ({ env, params, body }) => {
  const r = await first<Row>(env, 'SELECT * FROM checklist_items WHERE id = ?', params.id);
  if (!r) throw new HttpError(404, 'Item not found');
  const text = 'text' in body ? requiredStr(body.text, 'Item', 500) : (r.text as string);
  const done = 'done' in body ? !!body.done : !!r.done;
  await run(env, 'UPDATE checklist_items SET text = ?, done = ? WHERE id = ?', text, done ? 1 : 0, params.id);
  return json({ id: r.id, task_id: r.task_id, text, done, position: r.position });
});

route('DELETE', '/api/checklist/:id', async ({ env, params }) => {
  await run(env, 'DELETE FROM checklist_items WHERE id = ?', params.id);
  return json({ ok: true });
});

// ---------- Notifications ----------

route('GET', '/api/push/key', async ({ env, user }) => {
  const keys = await getVapidKeys(env);
  const n = await first<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', user.id);
  return json({ key: keys.publicKey, devices: n!.n });
});

route('POST', '/api/push/subscribe', async ({ env, user, body }) => {
  const endpoint = requiredStr(body.endpoint, 'Endpoint', 2000);
  if (!endpoint.startsWith('https://')) throw new HttpError(400, 'Invalid endpoint');
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const p256dh = requiredStr(keys.p256dh, 'Key', 200);
  const auth = requiredStr(keys.auth, 'Key', 200);
  await run(
    env,
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    endpoint,
    user.id,
    p256dh,
    auth,
    now(),
  );
  return json({ ok: true });
});

route('POST', '/api/push/unsubscribe', async ({ env, user, body }) => {
  await run(env, 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', str(body.endpoint, 'Endpoint', 2000), user.id);
  return json({ ok: true });
});

route('POST', '/api/push/test', async ({ env, user }) => {
  const sent = await pushToUser(env, user.id, { title: 'Notifications are on', body: 'You’ll get task reminders here.', url: '/#/' });
  return json({ sent });
});

// ---------- Entry ----------

async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
  if (!match) return json({ error: 'Not found' }, 404);
  const values = url.pathname.match(match.pattern)!.slice(1);
  const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(values[i])]));

  // Cookie-authenticated JSON API: reject cross-site writes.
  if (req.method !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Cross-site request blocked' }, 403);
  }

  const user = await currentUser(req, env);
  if (!user && !match.public) return json({ error: 'Please sign in' }, 401);

  let body: Record<string, unknown> = {};
  if (req.method !== 'GET' && req.headers.get('content-type')?.includes('application/json')) {
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
  }
  try {
    return await match.handler({ req, env, url, params, user: user!, body });
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      Promise.all([
        sendDueReminders(env),
        run(env, 'DELETE FROM sessions WHERE expires_at < ?', Date.now()),
      ]),
    );
  },
} satisfies ExportedHandler<Env>;

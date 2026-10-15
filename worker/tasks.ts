import type { Board, Group, Priority, Recurrence, StatusLabel, Task } from '../shared/types';
import { PRIORITIES } from '../shared/types';
import {
  addDays,
  daysBetween,
  DEFAULT_REMINDER_TIME,
  isDateString,
  isTimeString,
  isValidTimeZone,
  nextOccurrence,
  todayIn,
  zonedToUtc,
} from '../shared/dates';
import { all, Env, first, HttpError, newId, now, num, requiredStr, run, str } from './http';

export const TASK_SELECT = `SELECT t.*,
  (SELECT COUNT(*) FROM checklist_items c WHERE c.task_id = t.id) AS checklist_total,
  (SELECT COUNT(*) FROM checklist_items c WHERE c.task_id = t.id AND c.done = 1) AS checklist_done
  FROM tasks t`;

type Row = Record<string, unknown>;

export function toTask(r: Row): Task {
  return {
    id: r.id as string,
    board_id: r.board_id as string,
    group_id: (r.group_id as string) ?? null,
    parent_id: (r.parent_id as string) ?? null,
    title: r.title as string,
    status: r.status as string,
    priority: (r.priority as Priority) ?? '',
    owner_id: (r.owner_id as string) ?? null,
    due_date: (r.due_date as string) ?? null,
    due_time: (r.due_time as string) ?? null,
    tz: r.tz as string,
    notes: r.notes as string,
    recurrence: r.recurrence ? (JSON.parse(r.recurrence as string) as Recurrence) : null,
    reminder_minutes: (r.reminder_minutes as number) ?? null,
    reminder_at: (r.reminder_at as number) ?? null,
    completed_at: (r.completed_at as number) ?? null,
    position: r.position as number,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    checklist_total: Number(r.checklist_total ?? 0),
    checklist_done: Number(r.checklist_done ?? 0),
  };
}

export function toBoard(r: Row): Board {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    statuses: JSON.parse(r.statuses as string),
    position: r.position as number,
    ...(r.open_count !== undefined ? { open_count: Number(r.open_count) } : {}),
  };
}

export function toGroup(r: Row): Group {
  return {
    id: r.id as string,
    board_id: r.board_id as string,
    name: r.name as string,
    color: r.color as string,
    position: r.position as number,
    collapsed: !!r.collapsed,
  };
}

export async function getBoard(env: Env, id: string): Promise<Board> {
  const row = await first<Row>(env, 'SELECT * FROM boards WHERE id = ?', id);
  if (!row) throw new HttpError(404, 'Board not found');
  return toBoard(row);
}

export async function getTask(env: Env, id: string): Promise<Task> {
  const row = await first<Row>(env, `${TASK_SELECT} WHERE t.id = ?`, id);
  if (!row) throw new HttpError(404, 'Task not found');
  return toTask(row);
}

export function isDoneStatus(statuses: StatusLabel[], key: string): boolean {
  return !!statuses.find((s) => s.key === key)?.done;
}

export function firstOpenStatus(statuses: StatusLabel[]): string {
  return (statuses.find((s) => !s.done) ?? statuses[0]).key;
}

export function computeReminderAt(t: Pick<Task, 'reminder_minutes' | 'due_date' | 'due_time' | 'tz'>): number | null {
  if (t.reminder_minutes == null || !t.due_date) return null;
  return zonedToUtc(t.due_date, t.due_time ?? DEFAULT_REMINDER_TIME, t.tz) - t.reminder_minutes * 60000;
}

export function parseRecurrence(v: unknown): Recurrence | null {
  if (v == null) return null;
  if (typeof v !== 'object') throw new HttpError(400, 'Invalid repeat rule');
  const r = v as Record<string, unknown>;
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq as string)) throw new HttpError(400, 'Invalid repeat rule');
  const interval = Math.min(365, Math.max(1, Math.floor(Number(r.interval) || 1)));
  const rule: Recurrence = { freq: r.freq as Recurrence['freq'], interval };
  if (rule.freq === 'weekly' && Array.isArray(r.weekdays)) {
    const days = [...new Set(r.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
    if (days.length) rule.weekdays = days;
  }
  return rule;
}

/** Validates the editable fields present in `body`. */
export function parseTaskFields(body: Record<string, unknown>, statuses: StatusLabel[]): Partial<Task> {
  const out: Partial<Task> = {};
  if ('title' in body) out.title = requiredStr(body.title, 'Title', 500);
  if ('status' in body) {
    const s = str(body.status, 'Status', 50);
    if (!statuses.some((x) => x.key === s)) throw new HttpError(400, 'Unknown status');
    out.status = s;
  }
  if ('priority' in body) {
    if (!PRIORITIES.some((p) => p.value === body.priority)) throw new HttpError(400, 'Unknown priority');
    out.priority = body.priority as Priority;
  }
  if ('owner_id' in body) out.owner_id = body.owner_id == null ? null : str(body.owner_id, 'Owner', 64);
  if ('due_date' in body) {
    if (body.due_date != null && body.due_date !== '' && !isDateString(body.due_date)) throw new HttpError(400, 'Invalid date');
    out.due_date = (body.due_date as string) || null;
  }
  if ('due_time' in body) {
    if (body.due_time != null && body.due_time !== '' && !isTimeString(body.due_time)) throw new HttpError(400, 'Invalid time');
    out.due_time = (body.due_time as string) || null;
  }
  if ('tz' in body) {
    if (!isValidTimeZone(body.tz)) throw new HttpError(400, 'Invalid time zone');
    out.tz = body.tz;
  }
  if ('notes' in body) out.notes = str(body.notes, 'Notes', 20000);
  if ('recurrence' in body) out.recurrence = parseRecurrence(body.recurrence);
  if ('reminder_minutes' in body) {
    out.reminder_minutes =
      body.reminder_minutes == null ? null : Math.max(0, Math.min(60 * 24 * 60, Math.floor(num(body.reminder_minutes, 'Reminder'))));
  }
  if ('group_id' in body) out.group_id = str(body.group_id, 'Group', 64);
  if ('position' in body) out.position = num(body.position, 'Position');
  return out;
}

async function nextPosition(env: Env, t: { group_id: string | null; parent_id: string | null; board_id: string }) {
  const row = t.parent_id
    ? await first<{ p: number }>(env, 'SELECT MAX(position) AS p FROM tasks WHERE parent_id = ?', t.parent_id)
    : await first<{ p: number }>(env, 'SELECT MAX(position) AS p FROM tasks WHERE group_id = ? AND parent_id IS NULL', t.group_id);
  return (row?.p ?? 0) + 1;
}

export async function insertTask(env: Env, t: Omit<Task, 'checklist_total' | 'checklist_done' | 'position'> & { position?: number }, createdBy: string) {
  const position = t.position ?? (await nextPosition(env, t));
  await run(
    env,
    `INSERT INTO tasks (id, board_id, group_id, parent_id, title, status, priority, owner_id, due_date, due_time, tz, notes,
      recurrence, reminder_minutes, reminder_at, reminded_at, completed_at, position, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    t.id,
    t.board_id,
    t.group_id,
    t.parent_id,
    t.title,
    t.status,
    t.priority,
    t.owner_id,
    t.due_date,
    t.due_time,
    t.tz,
    t.notes,
    t.recurrence ? JSON.stringify(t.recurrence) : null,
    t.reminder_minutes,
    t.reminder_at,
    t.completed_at,
    position,
    createdBy,
    t.created_at,
    t.updated_at,
  );
}

export async function createTask(env: Env, body: Record<string, unknown>, userId: string, userTz: string): Promise<Task> {
  let boardId: string;
  let groupId: string | null = null;
  let parentId: string | null = null;
  if (body.parent_id) {
    const parent = await getTask(env, str(body.parent_id, 'Parent', 64));
    if (parent.parent_id) throw new HttpError(400, 'Subtasks cannot have their own subtasks');
    boardId = parent.board_id;
    parentId = parent.id;
  } else {
    boardId = str(body.board_id, 'Board', 64);
    groupId = str(body.group_id, 'Group', 64);
    const g = await first(env, 'SELECT id FROM task_groups WHERE id = ? AND board_id = ?', groupId, boardId);
    if (!g) throw new HttpError(400, 'Unknown group');
  }
  const board = await getBoard(env, boardId);
  const fields = parseTaskFields(body, board.statuses);
  if (parentId) delete fields.recurrence;
  delete fields.group_id;
  const ts = now();
  const t = {
    id: newId(),
    board_id: boardId,
    group_id: groupId,
    parent_id: parentId,
    title: fields.title ?? requiredStr(body.title, 'Title'),
    status: fields.status ?? firstOpenStatus(board.statuses),
    priority: fields.priority ?? ('' as Priority),
    owner_id: fields.owner_id ?? null,
    due_date: fields.due_date ?? null,
    due_time: fields.due_time ?? null,
    tz: fields.tz ?? userTz,
    notes: fields.notes ?? '',
    recurrence: fields.recurrence ?? null,
    reminder_minutes: fields.reminder_minutes ?? null,
    reminder_at: null as number | null,
    completed_at: isDoneStatus(board.statuses, fields.status ?? '') ? ts : null,
    position: fields.position,
    created_at: ts,
    updated_at: ts,
  };
  t.reminder_at = computeReminderAt(t);
  await insertTask(env, t, userId);
  return getTask(env, t.id);
}

const REMINDER_FIELDS = ['due_date', 'due_time', 'tz', 'reminder_minutes'] as const;

export async function updateTask(
  env: Env,
  id: string,
  body: Record<string, unknown>,
  userId: string,
): Promise<{ task: Task; spawned: Task | null }> {
  const task = await getTask(env, id);
  const board = await getBoard(env, task.board_id);
  const fields = parseTaskFields(body, board.statuses);
  if (task.parent_id) {
    delete fields.recurrence;
    delete fields.group_id;
  }
  if (fields.group_id && fields.group_id !== task.group_id) {
    const g = await first(env, 'SELECT id FROM task_groups WHERE id = ? AND board_id = ?', fields.group_id, task.board_id);
    if (!g) throw new HttpError(400, 'Unknown group');
    if (!('position' in fields)) fields.position = await nextPosition(env, { ...task, group_id: fields.group_id });
  }
  const next: Task = { ...task, ...fields };
  const ts = now();

  const wasDone = isDoneStatus(board.statuses, task.status);
  const nowDone = isDoneStatus(board.statuses, next.status);
  if (!wasDone && nowDone) next.completed_at = ts;
  if (!nowDone) next.completed_at = null;

  let resetReminder = false;
  if (REMINDER_FIELDS.some((f) => f in fields)) {
    next.reminder_at = computeReminderAt(next);
    resetReminder = true;
  }

  let spawned: Task | null = null;
  if (!wasDone && nowDone && next.recurrence && !next.parent_id) {
    spawned = await spawnNextOccurrence(env, next, board, userId);
    // The rule moves to the new occurrence so re-completing this one won't repeat it again.
    next.recurrence = null;
  }

  await run(
    env,
    `UPDATE tasks SET title = ?, status = ?, priority = ?, owner_id = ?, due_date = ?, due_time = ?, tz = ?, notes = ?,
       recurrence = ?, reminder_minutes = ?, reminder_at = ?, completed_at = ?, group_id = ?, position = ?, updated_at = ?
       ${resetReminder ? ', reminded_at = NULL' : ''}
     WHERE id = ?`,
    next.title,
    next.status,
    next.priority,
    next.owner_id,
    next.due_date,
    next.due_time,
    next.tz,
    next.notes,
    next.recurrence ? JSON.stringify(next.recurrence) : null,
    next.reminder_minutes,
    next.reminder_at,
    next.completed_at,
    next.group_id,
    next.position,
    ts,
    id,
  );
  return { task: await getTask(env, id), spawned };
}

/** Creates the next copy of a recurring task, with fresh subtasks and checklist. */
export async function spawnNextOccurrence(env: Env, t: Task, board: Board, userId: string): Promise<Task> {
  const from = t.due_date ?? todayIn(t.tz);
  let due = nextOccurrence(t.recurrence!, from);
  // Completing a long-overdue task shouldn't create another one that's already overdue.
  const today = todayIn(t.tz);
  for (let i = 0; due < today && i < 1000; i++) due = nextOccurrence(t.recurrence!, due);
  const shift = daysBetween(from, due);

  const sibling = await first<{ p: number }>(
    env,
    'SELECT MIN(position) AS p FROM tasks WHERE group_id = ? AND parent_id IS NULL AND position > ?',
    t.group_id,
    t.position,
  );
  const position = sibling?.p != null ? (t.position + sibling.p) / 2 : t.position + 1;
  const ts = now();
  const open = firstOpenStatus(board.statuses);
  const copy = {
    ...t,
    id: newId(),
    status: open,
    due_date: due,
    completed_at: null,
    position,
    created_at: ts,
    updated_at: ts,
  };
  copy.reminder_at = computeReminderAt(copy);

  const stmts: D1PreparedStatement[] = [];
  const subtasks = (await all<Row>(env, `${TASK_SELECT} WHERE t.parent_id = ? ORDER BY t.position`, t.id)).map(toTask);
  const checklistOwners = [t.id, ...subtasks.map((s) => s.id)];
  const idMap = new Map<string, string>([[t.id, copy.id]]);

  await insertTask(env, copy, userId);
  for (const s of subtasks) {
    const sid = newId();
    idMap.set(s.id, sid);
    const sDue = s.due_date && t.due_date ? addDays(s.due_date, shift) : s.due_date;
    const sub = { ...s, id: sid, parent_id: copy.id, status: open, due_date: sDue, completed_at: null, created_at: ts, updated_at: ts };
    sub.reminder_at = computeReminderAt(sub);
    await insertTask(env, sub, userId);
  }
  for (const owner of checklistOwners) {
    const items = await all<Row>(env, 'SELECT * FROM checklist_items WHERE task_id = ? ORDER BY position', owner);
    for (const it of items) {
      stmts.push(
        env.DB.prepare('INSERT INTO checklist_items (id, task_id, text, done, position) VALUES (?, ?, ?, 0, ?)').bind(
          newId(),
          idMap.get(owner),
          it.text,
          it.position,
        ),
      );
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return getTask(env, copy.id);
}

export async function boardGroups(env: Env, boardId: string): Promise<Group[]> {
  return (await all<Row>(env, 'SELECT * FROM task_groups WHERE board_id = ? ORDER BY position', boardId)).map(toGroup);
}

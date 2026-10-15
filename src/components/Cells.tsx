import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import type { StatusLabel, Task, User } from '../../shared/types';
import { PRIORITIES } from '../../shared/types';
import { updateTask } from '../actions';
import { useApp } from '../context';
import { dueTone, formatDate, formatTime, initials, statusOf } from '../util';
import { pick } from './Sheet';

export function Avatar({ user, size = 28 }: { user: User | undefined; size?: number }) {
  if (!user)
    return (
      <span class="avatar empty" style={{ width: size, height: size }} aria-label="Unassigned">
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6}>
          <circle cx="12" cy="8" r="4" fill="currentColor" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" />
        </svg>
      </span>
    );
  return (
    <span class="avatar" title={user.name} style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}>
      {initials(user.name)}
    </span>
  );
}

export async function pickStatus(task: Task, statuses: StatusLabel[]) {
  const r = await pick(
    'Status',
    statuses.map((s) => ({ value: s.key, label: s.label, color: s.color })),
    task.status,
  );
  if (r && r.value !== task.status) await updateTask(task, { status: r.value });
}

export async function pickPriority(task: Task) {
  const r = await pick('Priority', PRIORITIES.map((p) => ({ value: p.value, label: p.label, color: p.color })), task.priority);
  if (r && r.value !== task.priority) await updateTask(task, { priority: r.value });
}

export async function pickOwner(task: Task, users: User[]) {
  const r = await pick<string | null>(
    'Owner',
    [{ value: null, label: 'Unassigned', avatar: <Avatar user={undefined} /> }, ...users.map((u) => ({ value: u.id, label: u.name, avatar: <Avatar user={u} /> }))],
    task.owner_id,
  );
  if (r && r.value !== task.owner_id) await updateTask(task, { owner_id: r.value });
}

export function StatusCell({ task, statuses }: { task: Task; statuses: StatusLabel[] }) {
  const s = statusOf(statuses, task.status);
  return (
    <button class="pill status-pill" style={{ background: s.color }} onClick={() => pickStatus(task, statuses)}>
      {s.label}
    </button>
  );
}

export function PriorityCell({ task }: { task: Task }) {
  const p = PRIORITIES.find((x) => x.value === task.priority) ?? PRIORITIES[0];
  return (
    <button class={`pill priority-pill ${p.value ? '' : 'muted'}`} style={p.value ? { background: p.color } : undefined} onClick={() => pickPriority(task)}>
      {p.value ? p.label : 'Priority'}
    </button>
  );
}

export function OwnerCell({ task }: { task: Task }) {
  const { users } = useApp();
  return (
    <button class="owner-cell" onClick={() => pickOwner(task, users)} aria-label="Owner">
      <Avatar user={users.find((u) => u.id === task.owner_id)} />
    </button>
  );
}

/** Opens the native date picker (the wheel on iPhone). */
export function DateButton({
  value,
  onChange,
  class: cls = '',
  children,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  class?: string;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label
      class={`date-btn ${cls}`}
      onClick={() => {
        try {
          ref.current?.showPicker();
        } catch {
          /* Safari opens it from the tap on the input itself */
        }
      }}
    >
      {children}
      <input ref={ref} type="date" value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value || null)} />
    </label>
  );
}

export function DueCell({ task }: { task: Task }) {
  const tone = dueTone(task);
  return (
    <DateButton value={task.due_date} onChange={(v) => updateTask(task, { due_date: v })} class={`due-cell tone-${tone}`}>
      {task.due_date ? (
        <>
          {formatDate(task.due_date)}
          {task.due_time && <span class="due-time"> {formatTime(task.due_time)}</span>}
        </>
      ) : (
        <span class="muted">Due date</span>
      )}
    </DateButton>
  );
}

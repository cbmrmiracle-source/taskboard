import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ChecklistItem, Recurrence, Task, TaskDetail } from '../../shared/types';
import { PRIORITIES } from '../../shared/types';
import { createTask, deleteTask, updateTask } from '../actions';
import { del, get, patch, post } from '../api';
import { isDone } from '../board-utils';
import { emit, on, toast } from '../bus';
import { useApp } from '../context';
import { describeRecurrence, formatDate, formatTime, REMINDER_OPTIONS, reminderLabel, statusOf, WEEKDAY_LETTERS } from '../util';
import { Avatar, DateButton, pickOwner, pickPriority, pickStatus } from './Cells';
import { Icon } from './Icon';
import { confirmAction, pick, Sheet } from './Sheet';
import { TaskRow } from './TaskRow';

export function TaskSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { users } = useApp();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [newSub, setNewSub] = useState('');
  const [newItem, setNewItem] = useState('');
  const [repeatOpen, setRepeatOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    get<TaskDetail>(`/tasks/${id}`)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setTitle(d.task.title);
        setNotes(d.task.notes);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const offs = [
      on('task:changed', (t) =>
        setDetail((d) => {
          if (!d) return d;
          if (t.id === d.task.id) return { ...d, task: t };
          if (t.parent_id === d.task.id) return { ...d, subtasks: d.subtasks.map((s) => (s.id === t.id ? t : s)) };
          return d;
        }),
      ),
      on('task:created', (t) => setDetail((d) => (d && t.parent_id === d.task.id && !d.subtasks.some((s) => s.id === t.id) ? { ...d, subtasks: [...d.subtasks, t] } : d))),
      on('task:deleted', ({ id: gone }) => {
        if (gone === id) onClose();
        setDetail((d) => d && { ...d, subtasks: d.subtasks.filter((s) => s.id !== gone) });
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [id]);

  if (error)
    return (
      <Sheet title="Task" onClose={onClose} full>
        <div class="empty-state">{error}</div>
      </Sheet>
    );
  if (!detail)
    return (
      <Sheet title="" onClose={onClose} full>
        <div class="loading">Loading…</div>
      </Sheet>
    );

  const { task, subtasks, checklist, board, groups } = detail;
  const status = statusOf(board.statuses, task.status);
  const priority = PRIORITIES.find((p) => p.value === task.priority) ?? PRIORITIES[0];
  const owner = users.find((u) => u.id === task.owner_id);
  const group = groups.find((g) => g.id === task.group_id);
  const color = group?.color ?? '#579bfc';
  const save = (changes: Partial<Task>) => updateTask(task, changes);

  const setChecklist = (fn: (c: ChecklistItem[]) => ChecklistItem[]) => setDetail((d) => d && { ...d, checklist: fn(d.checklist) });

  // Keeps the checklist counters on board rows current.
  const syncCounts = (list: ChecklistItem[]) =>
    emit('task:changed', { ...task, checklist_total: list.length, checklist_done: list.filter((c) => c.done).length });

  const addItem = async () => {
    const text = newItem.trim();
    if (!text) return;
    setNewItem('');
    try {
      const item = await post<ChecklistItem>(`/tasks/${task.id}/checklist`, { text });
      const list = [...checklist, item];
      setChecklist(() => list);
      syncCounts(list);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const toggleItem = async (item: ChecklistItem) => {
    const list = checklist.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c));
    setChecklist(() => list);
    syncCounts(list);
    await patch(`/checklist/${item.id}`, { done: !item.done }).catch((e) => toast(e.message));
  };

  const removeItem = async (item: ChecklistItem) => {
    const list = checklist.filter((c) => c.id !== item.id);
    setChecklist(() => list);
    syncCounts(list);
    await del(`/checklist/${item.id}`).catch((e) => toast(e.message));
  };

  const moveGroup = async () => {
    const r = await pick('Move to group', groups.map((g) => ({ value: g.id, label: g.name, color: g.color })), task.group_id);
    if (r && r.value !== task.group_id) save({ group_id: r.value });
  };

  const remove = async () => {
    if (!(await confirmAction(`Delete “${task.title}”?`, 'Delete task'))) return;
    if (await deleteTask(task)) onClose();
  };

  const subDone = subtasks.filter((s) => isDone(board.statuses, s.status)).length;

  return (
    <Sheet
      full
      onClose={onClose}
      title={
        <span class="crumb">
          {board.name}
          {group && (
            <>
              {' '}
              › <span style={{ color }}>{group.name}</span>
            </>
          )}
          {task.parent_id && ' › Subtask'}
        </span>
      }
    >
      <div class="task-detail">
        <textarea
          class="title-input"
          rows={1}
          value={title}
          onInput={(e) => {
            setTitle(e.currentTarget.value);
            autoGrow(e.currentTarget);
          }}
          ref={(el) => {
            if (el) autoGrow(el);
          }}
          onBlur={() => title.trim() && title.trim() !== task.title && save({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
        />

        <div class="props">
          <Prop label="Status">
            <button class="pill status-pill wide" style={{ background: status.color }} onClick={() => pickStatus(task, board.statuses)}>
              {status.label}
            </button>
          </Prop>
          <Prop label="Owner">
            <button class="prop-btn" onClick={() => pickOwner(task, users)}>
              <Avatar user={owner} size={24} /> {owner?.name ?? 'Unassigned'}
            </button>
          </Prop>
          <Prop label="Priority">
            <button
              class={`pill priority-pill wide ${priority.value ? '' : 'muted'}`}
              style={priority.value ? { background: priority.color } : undefined}
              onClick={() => pickPriority(task)}
            >
              {priority.value ? priority.label : 'None'}
            </button>
          </Prop>
          <Prop label="Due">
            <div class="due-edit">
              <DateButton value={task.due_date} onChange={(v) => save({ due_date: v })} class="prop-btn">
                <Icon name="calendar" size={16} /> {task.due_date ? formatDate(task.due_date, true) : 'Set date'}
              </DateButton>
              {task.due_date && (
                <label class="prop-btn time-btn">
                  {task.due_time ? formatTime(task.due_time) : 'Add time'}
                  <input type="time" value={task.due_time ?? ''} onChange={(e) => save({ due_time: e.currentTarget.value || null })} />
                </label>
              )}
              {task.due_date && (
                <button class="icon-btn small" aria-label="Clear due date" onClick={() => save({ due_date: null, due_time: null })}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </Prop>
          <Prop label="Reminder">
            <button
              class="prop-btn"
              onClick={async () => {
                const r = await pick('Remind me', REMINDER_OPTIONS, task.reminder_minutes);
                if (!r) return;
                if (r.value != null && !task.due_date) {
                  toast('Set a due date first');
                  return;
                }
                save({ reminder_minutes: r.value });
              }}
            >
              <Icon name="bell" size={16} /> {reminderLabel(task.reminder_minutes)}
              {task.reminder_minutes != null && !task.due_time && task.due_date && <span class="muted"> (from 9:00 AM)</span>}
            </button>
          </Prop>
          {!task.parent_id && (
            <Prop label="Repeat">
              <button class="prop-btn" onClick={() => setRepeatOpen(true)}>
                <Icon name="repeat" size={16} /> {describeRecurrence(task.recurrence)}
              </button>
            </Prop>
          )}
          {!task.parent_id && groups.length > 1 && (
            <Prop label="Group">
              <button class="prop-btn" onClick={moveGroup}>
                <span class="dot" style={{ background: color }} /> {group?.name}
              </button>
            </Prop>
          )}
        </div>

        <h3 class="section-title">Notes</h3>
        <textarea
          class="input notes"
          rows={4}
          placeholder="Add details, links, phone numbers…"
          value={notes}
          onInput={(e) => setNotes(e.currentTarget.value)}
          onBlur={() => notes !== task.notes && save({ notes })}
        />

        <h3 class="section-title">
          Checklist{' '}
          {checklist.length > 0 && (
            <span class="muted">
              {checklist.filter((c) => c.done).length}/{checklist.length}
            </span>
          )}
        </h3>
        {checklist.length > 0 && (
          <div class="progress">
            <span style={{ width: `${(checklist.filter((c) => c.done).length / checklist.length) * 100}%` }} />
          </div>
        )}
        <div class="checklist">
          {checklist.map((c) => (
            <div class={`check-item ${c.done ? 'done' : ''}`} key={c.id}>
              <button class={`check-btn ${c.done ? 'on' : ''}`} onClick={() => toggleItem(c)} aria-label="Toggle">
                {c.done && <Icon name="check" size={14} />}
              </button>
              <span class="check-text">{c.text}</span>
              <button class="icon-btn small" onClick={() => removeItem(c)} aria-label="Remove item">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <form
            class="add-row"
            onSubmit={(e) => {
              e.preventDefault();
              addItem();
            }}
          >
            <input class="add-input" placeholder="+ Add checklist item" value={newItem} onInput={(e) => setNewItem(e.currentTarget.value)} />
          </form>
        </div>

        {!task.parent_id && (
          <>
            <h3 class="section-title">
              Subtasks{' '}
              {subtasks.length > 0 && (
                <span class="muted">
                  {subDone}/{subtasks.length}
                </span>
              )}
            </h3>
            <div class="subtasks in-sheet" style={{ '--gc': color }}>
              {subtasks.map((s) => (
                <TaskRow key={s.id} task={s} statuses={board.statuses} color={color} />
              ))}
              <form
                class="add-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const t = newSub.trim();
                  if (!t) return;
                  setNewSub('');
                  await createTask({ title: t, parent_id: task.id });
                }}
              >
                <input class="add-input" placeholder="+ Add subtask" value={newSub} onInput={(e) => setNewSub(e.currentTarget.value)} />
              </form>
            </div>
          </>
        )}

        <button class="btn danger-outline" onClick={remove}>
          <Icon name="trash" size={16} /> Delete task
        </button>
      </div>

      {repeatOpen && (
        <RepeatEditor
          value={task.recurrence}
          onClose={() => setRepeatOpen(false)}
          onSave={(r) => {
            setRepeatOpen(false);
            save({ recurrence: r });
            if (r && !task.due_date) toast('Tip: set a due date so the schedule has a starting point');
          }}
        />
      )}
    </Sheet>
  );
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function Prop({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="prop">
      <span class="prop-label">{label}</span>
      <div class="prop-value">{children}</div>
    </div>
  );
}

function RepeatEditor({ value, onClose, onSave }: { value: Recurrence | null; onClose: () => void; onSave: (r: Recurrence | null) => void }) {
  const [freq, setFreq] = useState<Recurrence['freq'] | 'none'>(value?.freq ?? 'none');
  const [interval, setInterval] = useState(value?.interval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(value?.weekdays ?? []);
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', none: '' }[freq];
  const draft: Recurrence | null =
    freq === 'none' ? null : { freq, interval: Math.max(1, interval || 1), ...(freq === 'weekly' && weekdays.length ? { weekdays } : {}) };

  return (
    <Sheet title="Repeat" onClose={onClose}>
      <div class="stack">
        <div class="segmented">
          {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((f) => (
            <button key={f} class={freq === f ? 'on' : ''} onClick={() => setFreq(f)}>
              {f === 'none' ? 'Never' : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {freq !== 'none' && (
          <label class="interval">
            Every
            <input class="input" type="number" min={1} max={365} inputMode="numeric" value={interval} onInput={(e) => setInterval(Number(e.currentTarget.value))} />
            {unit}
            {interval > 1 ? 's' : ''}
          </label>
        )}
        {freq === 'weekly' && (
          <div class="weekdays">
            {WEEKDAY_LETTERS.map((l, d) => (
              <button
                key={d}
                class={weekdays.includes(d) ? 'on' : ''}
                onClick={() => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort())}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        <p class="hint">
          {draft
            ? `${describeRecurrence(draft)}. When you mark this task done, the next one is created automatically with a fresh checklist and subtasks.`
            : 'This task happens once.'}
        </p>
        <button class="btn primary" onClick={() => onSave(draft)}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

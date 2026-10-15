import { useState } from 'preact/hooks';
import type { StatusLabel, Task } from '../../shared/types';
import { createTask, updateTask } from '../actions';
import { firstOpenKey, isDone } from '../board-utils';
import { DueCell, OwnerCell, PriorityCell, StatusCell } from './Cells';
import { Icon } from './Icon';

export function openTask(id: string) {
  const base = location.hash.slice(1).replace(/\/task\/[^/]+$/, '').replace(/\/$/, '');
  location.hash = `${base}/task/${id}`;
}

export function TaskRow({
  task,
  statuses,
  color,
  subtasks = [],
  label,
  flat,
}: {
  task: Task;
  statuses: StatusLabel[];
  color: string;
  subtasks?: Task[];
  /** Extra context line, e.g. the board name in My Work. */
  label?: string;
  /** Show subtasks like top-level rows (no indent, no subtask toggle). */
  flat?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState('');
  const done = isDone(statuses, task.status);
  const subDone = subtasks.filter((s) => isDone(statuses, s.status)).length;
  const doneKey = statuses.find((s) => s.done)?.key;

  const toggleDone = () => {
    if (done) updateTask(task, { status: firstOpenKey(statuses) });
    else if (doneKey) updateTask(task, { status: doneKey });
  };

  return (
    <>
      <div class={`row ${done ? 'is-done' : ''} ${task.parent_id && !flat ? 'is-sub' : ''}`} style={{ '--gc': color }}>
        <div class="row-main">
          <button class={`check-btn ${done ? 'on' : ''}`} onClick={toggleDone} aria-label={done ? 'Mark not done' : 'Mark done'}>
            {done && <Icon name="check" size={14} />}
          </button>
          <button class="row-title" onClick={() => openTask(task.id)}>
            <span class="title-text">{task.title}</span>
            <span class="row-meta">
              {label && <span class="meta-label">{label}</span>}
              {task.recurrence && <Icon name="repeat" size={13} title="Repeats" />}
              {task.reminder_at && !task.completed_at && <Icon name="bell" size={13} title="Reminder set" />}
              {task.notes && <Icon name="note" size={13} title="Has notes" />}
              {task.checklist_total > 0 && (
                <span class={`meta-chip ${task.checklist_done === task.checklist_total ? 'complete' : ''}`}>
                  <Icon name="list" size={12} /> {task.checklist_done}/{task.checklist_total}
                </span>
              )}
            </span>
          </button>
          {!task.parent_id && !flat && (
            <button
              class={`sub-toggle ${subtasks.length ? 'has' : ''} ${expanded ? 'open' : ''}`}
              onClick={() => setExpanded(!expanded)}
              aria-label="Subtasks"
            >
              {subtasks.length > 0 ? (
                <>
                  <Icon name="sub" size={13} /> {subDone}/{subtasks.length}
                </>
              ) : (
                <Icon name="sub" size={13} />
              )}
            </button>
          )}
        </div>
        <div class="cells">
          <OwnerCell task={task} />
          <StatusCell task={task} statuses={statuses} />
          <PriorityCell task={task} />
          <DueCell task={task} />
        </div>
      </div>
      {expanded && (
        <div class="subtasks" style={{ '--gc': color }}>
          {subtasks.map((s) => (
            <TaskRow key={s.id} task={s} statuses={statuses} color={color} />
          ))}
          <form
            class="add-row sub"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!adding.trim()) return;
              const title = adding.trim();
              setAdding('');
              await createTask({ title, parent_id: task.id });
            }}
          >
            <input class="add-input" placeholder="+ Add subtask" value={adding} onInput={(e) => setAdding(e.currentTarget.value)} />
          </form>
        </div>
      )}
    </>
  );
}

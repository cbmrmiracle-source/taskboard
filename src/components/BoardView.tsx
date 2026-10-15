import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Board, BoardData, Group, Task } from '../../shared/types';
import { PALETTE } from '../../shared/types';
import { createTask } from '../actions';
import { del, get, patch, post } from '../api';
import { isDone } from '../board-utils';
import { on, toast } from '../bus';
import { useApp } from '../context';
import { BoardSettings } from './BoardSettings';
import { Icon } from './Icon';
import { confirmAction, pick, prompt } from './Sheet';
import { TaskRow } from './TaskRow';

/** Keeps a task list in sync with edits made anywhere in the app. */
export function useTaskSync(setTasks: (fn: (t: Task[]) => Task[]) => void, accept: (t: Task) => boolean) {
  useEffect(() => {
    const offs = [
      on('task:changed', (t) => setTasks((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : list))),
      on('task:created', (t) => accept(t) && setTasks((list) => (list.some((x) => x.id === t.id) ? list : [...list, t]))),
      on('task:deleted', ({ id }) => setTasks((list) => list.filter((x) => x.id !== id && x.parent_id !== id))),
    ];
    return () => offs.forEach((f) => f());
  }, [accept]);
}

export function BoardView({ id }: { id: string }) {
  const { me, reloadBoards } = useApp();
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState(false);
  const [hideDone, setHideDone] = useState(() => localStorage.getItem('hideDone') === '1');
  const [settings, setSettings] = useState(false);

  const load = async () => {
    try {
      setData(await get<BoardData>(`/boards/${id}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    setData(null);
    load();
    // Pick up teammates' changes when coming back to the app.
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [id]);

  const setTasks = (fn: (t: Task[]) => Task[]) => setData((d) => (d ? { ...d, tasks: fn(d.tasks) } : d));
  const accept = useMemo(() => (t: Task) => t.board_id === id, [id]);
  useTaskSync(setTasks, accept);

  useEffect(() => {
    try {
      localStorage.setItem('hideDone', hideDone ? '1' : '0');
    } catch {}
  }, [hideDone]);

  if (error) return <div class="empty-state">{error}</div>;
  if (!data) return <div class="loading">Loading…</div>;

  const { board, groups, tasks } = data;
  const q = query.trim().toLowerCase();
  const subsByParent = new Map<string, Task[]>();
  for (const t of tasks) if (t.parent_id) subsByParent.set(t.parent_id, [...(subsByParent.get(t.parent_id) ?? []), t]);
  for (const list of subsByParent.values()) list.sort((a, b) => a.position - b.position);

  const visible = (t: Task) => {
    if (hideDone && isDone(board.statuses, t.status)) return false;
    if (mine && t.owner_id !== me.id && !(subsByParent.get(t.id) ?? []).some((s) => s.owner_id === me.id)) return false;
    if (q && !t.title.toLowerCase().includes(q) && !(subsByParent.get(t.id) ?? []).some((s) => s.title.toLowerCase().includes(q))) return false;
    return true;
  };

  const updateGroup = async (g: Group, changes: Partial<Group>) => {
    setData((d) => d && { ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, ...changes } : x)) });
    try {
      await patch(`/groups/${g.id}`, changes);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const groupMenu = async (g: Group) => {
    const r = await pick('Group', [
      { value: 'rename', label: 'Rename' },
      { value: 'color', label: 'Change color' },
      { value: 'up', label: 'Move up' },
      { value: 'down', label: 'Move down' },
      { value: 'delete', label: 'Delete group and its tasks', danger: true },
    ]);
    if (!r) return;
    if (r.value === 'rename') {
      const name = await prompt('Rename group', g.name);
      if (name) updateGroup(g, { name });
    } else if (r.value === 'color') {
      const c = await pick('Color', PALETTE.map((p) => ({ value: p, label: ' ', color: p })), g.color);
      if (c) updateGroup(g, { color: c.value });
    } else if (r.value === 'up' || r.value === 'down') {
      const i = groups.findIndex((x) => x.id === g.id);
      const j = r.value === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= groups.length) return;
      const other = groups[j];
      setData((d) => d && { ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, position: other.position } : x.id === other.id ? { ...x, position: g.position } : x)).sort((a, b) => a.position - b.position) });
      await Promise.all([patch(`/groups/${g.id}`, { position: other.position }), patch(`/groups/${other.id}`, { position: g.position })]);
    } else if (r.value === 'delete') {
      if (!(await confirmAction(`Delete “${g.name}” and all its tasks?`, 'Delete group'))) return;
      await del(`/groups/${g.id}`);
      setData((d) => d && { ...d, groups: d.groups.filter((x) => x.id !== g.id), tasks: d.tasks.filter((t) => t.group_id !== g.id) });
      reloadBoards();
    }
  };

  const addGroup = async () => {
    const name = await prompt('New group', '', 'e.g. Next week');
    if (!name) return;
    const g = await post<Group>('/groups', { board_id: board.id, name });
    setData((d) => d && { ...d, groups: [...d.groups, g] });
  };

  return (
    <div class="board">
      <div class="board-head">
        <h1 class="board-title">{board.name}</h1>
        <button class="icon-btn" onClick={() => setSettings(true)} aria-label="Board settings">
          <Icon name="more" size={22} />
        </button>
      </div>
      {board.description && <p class="board-desc">{board.description}</p>}
      <div class="toolbar">
        <label class="search">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        </label>
        <button class={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(!mine)}>
          Mine
        </button>
        <button class={`chip ${hideDone ? 'on' : ''}`} onClick={() => setHideDone(!hideDone)}>
          Hide done
        </button>
      </div>

      <div class="col-heads">
        <span>Task</span>
        <span>Owner</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Due</span>
      </div>

      {groups.map((g) => {
        const items = tasks.filter((t) => t.group_id === g.id && !t.parent_id).sort((a, b) => a.position - b.position);
        const shown = items.filter(visible);
        const doneCount = items.filter((t) => isDone(board.statuses, t.status)).length;
        return (
          <section class="group" key={g.id} style={{ '--gc': g.color }}>
            <div class="group-head">
              <button class={`collapse ${g.collapsed ? 'closed' : ''}`} onClick={() => updateGroup(g, { collapsed: !g.collapsed })} aria-label="Collapse">
                <Icon name="chevron" size={18} />
              </button>
              <button class="group-name" onClick={() => updateGroup(g, { collapsed: !g.collapsed })}>
                {g.name}
              </button>
              <span class="group-count">
                {doneCount}/{items.length}
              </span>
              <button class="icon-btn small" onClick={() => groupMenu(g)} aria-label="Group options">
                <Icon name="more" size={18} />
              </button>
            </div>
            {!g.collapsed && (
              <div class="group-body">
                {shown.map((t) => (
                  <TaskRow key={t.id} task={t} statuses={board.statuses} color={g.color} subtasks={subsByParent.get(t.id)} />
                ))}
                <QuickAdd board={board} group={g} />
                {items.length > 0 && <ProgressBar board={board} tasks={items} />}
              </div>
            )}
          </section>
        );
      })}

      <button class="btn ghost add-group" onClick={addGroup}>
        <Icon name="plus" size={16} /> Add group
      </button>

      {settings && (
        <BoardSettings
          board={board}
          onClose={() => setSettings(false)}
          onSaved={(b) => {
            setData((d) => d && { ...d, board: b });
            load();
            reloadBoards();
          }}
        />
      )}
    </div>
  );
}

function QuickAdd({ board, group }: { board: Board; group: Group }) {
  const [title, setTitle] = useState('');
  return (
    <form
      class="add-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        setTitle('');
        await createTask({ title: t, board_id: board.id, group_id: group.id });
      }}
    >
      <input class="add-input" placeholder="+ Add task" value={title} onInput={(e) => setTitle(e.currentTarget.value)} enterKeyHint="done" />
    </form>
  );
}

/** monday-style status battery: share of tasks in each status. */
function ProgressBar({ board, tasks }: { board: Board; tasks: Task[] }) {
  return (
    <div class="battery" aria-label="Status summary">
      {board.statuses.map((s) => {
        const n = tasks.filter((t) => t.status === s.key).length;
        return n ? <span key={s.key} style={{ flex: n, background: s.color }} title={`${s.label}: ${n}`} /> : null;
      })}
    </div>
  );
}

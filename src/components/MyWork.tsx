import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Board, Task } from '../../shared/types';
import { get } from '../api';
import { useApp } from '../context';
import { bucketFor } from '../util';
import { useTaskSync } from './BoardView';
import { TaskRow } from './TaskRow';

const BUCKETS = [
  { name: 'Overdue', color: '#e2445c' },
  { name: 'Today', color: '#00c875' },
  { name: 'Tomorrow', color: '#579bfc' },
  { name: 'This week', color: '#a25ddc' },
  { name: 'Later', color: '#fdab3d' },
  { name: 'No date', color: '#c4c4c4' },
];

export function MyWork() {
  const { me } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);

  const load = () =>
    get<{ tasks: Task[]; boards: Board[] }>('/my-work').then((d) => {
      setTasks(d.tasks);
      setBoards(d.boards);
    });

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const accept = useMemo(() => (t: Task) => t.owner_id === me.id, [me.id]);
  useTaskSync((fn) => setTasks((l) => (l ? fn(l) : l)), accept);

  if (!tasks) return <div class="loading">Loading…</div>;
  const boardById = new Map(boards.map((b) => [b.id, b]));
  // Tasks reassigned away or completed from here stay until the next refresh, struck through.
  const mineNow = tasks.filter((t) => t.owner_id === me.id);

  return (
    <div class="board">
      <div class="board-head">
        <h1 class="board-title">My work</h1>
      </div>
      <p class="board-desc">Everything assigned to you across all boards.</p>
      {mineNow.length === 0 && <div class="empty-state">Nothing assigned to you. Nice.</div>}
      {BUCKETS.map((b) => {
        const items = mineNow.filter((t) => bucketFor(t) === b.name);
        if (!items.length) return null;
        return (
          <section class="group" key={b.name} style={{ '--gc': b.color }}>
            <div class="group-head">
              <span class="group-name static">{b.name}</span>
              <span class="group-count">{items.length}</span>
            </div>
            <div class="group-body">
              {items.map((t) => {
                const board = boardById.get(t.board_id);
                if (!board) return null;
                const parent = t.parent_id ? tasks.find((x) => x.id === t.parent_id) : null;
                return (
                  <TaskRow
                    key={t.id}
                    task={t}
                    flat
                    statuses={board.statuses}
                    color={b.color}
                    label={parent ? `${board.name} › ${parent.title}` : board.name}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

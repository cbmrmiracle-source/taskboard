import type { Board } from '../../shared/types';
import { post } from '../api';
import { toast } from '../bus';
import { useApp } from '../context';
import { Icon } from './Icon';
import { prompt } from './Sheet';

export async function newBoard(reload: () => Promise<void>) {
  const name = await prompt('New board', '', 'e.g. Home, Work, Event planning');
  if (!name) return;
  try {
    const b = await post<Board>('/boards', { name });
    await reload();
    location.hash = `#/board/${b.id}`;
  } catch (e) {
    toast((e as Error).message);
  }
}

export function Home() {
  const { me, boards, reloadBoards } = useApp();
  return (
    <div class="board">
      <div class="board-head">
        <h1 class="board-title">Hi, {me.name.split(' ')[0]}</h1>
      </div>
      <a class="card my-work-card" href="#/my">
        <Icon name="user" size={22} />
        <div>
          <strong>My work</strong>
          <span class="muted">Everything assigned to you, by due date</span>
        </div>
      </a>
      <h2 class="section-title">Boards</h2>
      <div class="board-list">
        {boards.map((b) => (
          <a class="card board-card" key={b.id} href={`#/board/${b.id}`}>
            <Icon name="board" size={20} />
            <span class="board-card-name">{b.name}</span>
            <span class="badge">{b.open_count ?? 0}</span>
          </a>
        ))}
        <button class="card board-card add" onClick={() => newBoard(reloadBoards)}>
          <Icon name="plus" size={20} />
          <span class="board-card-name">New board</span>
        </button>
      </div>
    </div>
  );
}

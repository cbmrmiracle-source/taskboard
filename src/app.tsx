import { useEffect, useState } from 'preact/hooks';
import type { Board, User } from '../shared/types';
import { get, post, setUnauthorizedHandler } from './api';
import { on } from './bus';
import { AppCtx } from './context';
import { BoardView } from './components/BoardView';
import { Home, newBoard } from './components/Home';
import { Icon } from './components/Icon';
import { Login } from './components/Login';
import { MyWork } from './components/MyWork';
import { Settings } from './components/Settings';
import { PickerHost, PromptHost } from './components/Sheet';
import { TaskSheet } from './components/TaskSheet';

function parseRoute(hash: string) {
  const path = hash.replace(/^#/, '') || '/';
  const taskMatch = path.match(/\/task\/([^/]+)$/);
  const base = taskMatch ? path.slice(0, taskMatch.index) || '/' : path;
  const parts = base.split('/').filter(Boolean);
  return { view: parts[0] ?? 'home', id: parts[1], taskId: taskMatch?.[1], base };
}

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const fn = () => setHash(location.hash);
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash;
}

function Toasts() {
  const [msgs, setMsgs] = useState<{ id: number; text: string }[]>([]);
  useEffect(
    () =>
      on('toast', (text) => {
        const id = Math.random();
        setMsgs((m) => [...m, { id, text }]);
        setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 3500);
      }),
    [],
  );
  return (
    <div class="toasts" aria-live="polite">
      {msgs.map((m) => (
        <div class="toast" key={m.id}>
          {m.text}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<User | null | undefined>(undefined);
  const [users, setUsers] = useState<User[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const route = parseRoute(useHash());

  const loadAll = async () => {
    try {
      const [u, us, bs] = await Promise.all([get<User>('/me'), get<User[]>('/users'), get<Board[]>('/boards')]);
      setMe(u);
      setUsers(us);
      setBoards(bs);
    } catch {
      setMe(null);
    }
  };
  const reloadBoards = async () => setBoards(await get<Board[]>('/boards'));

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    loadAll();
  }, []);

  // Keep board task counts fresh after edits.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => me && reloadBoards().catch(() => {}), 800);
    };
    const offs = [on('task:changed', refresh), on('task:created', refresh), on('task:deleted', refresh)];
    return () => offs.forEach((f) => f());
  }, [me]);

  if (me === undefined) return <div class="loading full">Loading…</div>;
  if (me === null)
    return (
      <>
        <Login onDone={loadAll} />
        <Toasts />
      </>
    );

  const closeTask = () => {
    location.hash = route.base === '/' ? '#/' : `#${route.base}`;
  };

  const boardName = route.view === 'board' ? boards.find((b) => b.id === route.id)?.name : undefined;
  const logout = async () => {
    await post('/auth/logout');
    setMe(null);
    location.hash = '#/';
  };

  return (
    <AppCtx.Provider value={{ me, users, boards, reloadBoards, setMe: (u) => { setMe(u); setUsers((l) => l.map((x) => (x.id === u.id ? u : x))); } }}>
      <div class="layout">
        <aside class="sidebar">
          <a class="brand" href="#/">
            <img src="/icon.svg" alt="" width={28} height={28} /> Taskboard
          </a>
          <a class={`side-link ${route.view === 'my' ? 'active' : ''}`} href="#/my">
            <Icon name="user" /> My work
          </a>
          <div class="side-section">Boards</div>
          {boards.map((b) => (
            <a key={b.id} class={`side-link ${route.view === 'board' && route.id === b.id ? 'active' : ''}`} href={`#/board/${b.id}`}>
              <Icon name="board" /> <span class="side-name">{b.name}</span>
              {!!b.open_count && <span class="badge">{b.open_count}</span>}
            </a>
          ))}
          <button class="side-link" onClick={() => newBoard(reloadBoards)}>
            <Icon name="plus" /> New board
          </button>
          <div class="side-spacer" />
          <a class={`side-link ${route.view === 'settings' ? 'active' : ''}`} href="#/settings">
            <Icon name="gear" /> Settings
          </a>
        </aside>

        <header class="topbar">
          {route.view === 'board' ? (
            <a class="back" href="#/">
              <Icon name="back" size={22} /> Boards
            </a>
          ) : (
            <span class="topbar-brand">
              <img src="/icon.svg" alt="" width={24} height={24} /> Taskboard
            </span>
          )}
          {boardName && <span class="topbar-title">{boardName}</span>}
        </header>

        <main class="main">
          {route.view === 'board' && route.id ? (
            <BoardView id={route.id} />
          ) : route.view === 'my' ? (
            <MyWork />
          ) : route.view === 'settings' ? (
            <Settings onLogout={logout} />
          ) : (
            <Home />
          )}
        </main>

        <nav class="tabbar">
          <a class={route.view === 'home' || route.view === 'board' ? 'active' : ''} href="#/">
            <Icon name="board" size={22} />
            Boards
          </a>
          <a class={route.view === 'my' ? 'active' : ''} href="#/my">
            <Icon name="user" size={22} />
            My work
          </a>
          <a class={route.view === 'settings' ? 'active' : ''} href="#/settings">
            <Icon name="gear" size={22} />
            Settings
          </a>
        </nav>
      </div>

      {route.taskId && <TaskSheet id={route.taskId} onClose={closeTask} />}
      <PickerHost />
      <PromptHost />
      <Toasts />
    </AppCtx.Provider>
  );
}

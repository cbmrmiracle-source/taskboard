import type { Task } from '../shared/types';

// App-wide events so every open view stays in sync with edits made elsewhere.
interface Events {
  'task:changed': Task;
  'task:created': Task;
  'task:deleted': { id: string; parent_id: string | null };
  toast: string;
}

type Listener<K extends keyof Events> = (payload: Events[K]) => void;
const listeners = new Map<keyof Events, Set<(payload: never) => void>>();

export function on<K extends keyof Events>(event: K, fn: Listener<K>): () => void {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function emit<K extends keyof Events>(event: K, payload: Events[K]) {
  listeners.get(event)?.forEach((fn) => (fn as Listener<K>)(payload));
}

export const toast = (msg: string) => emit('toast', msg);

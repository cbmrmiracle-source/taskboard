import type { Task, TaskDetail, TaskUpdateResult } from '../shared/types';
import { del, get, patch, post } from './api';
import { emit, toast } from './bus';
import { formatDate, localTz } from './util';

export async function updateTask(task: Task, changes: Partial<Task>): Promise<Task | null> {
  // Optimistic: show the change immediately, then reconcile with the server.
  emit('task:changed', { ...task, ...changes });
  const body: Record<string, unknown> = { ...changes };
  if ('due_date' in changes || 'due_time' in changes) body.tz = localTz();
  try {
    const res = await patch<TaskUpdateResult>(`/tasks/${task.id}`, body);
    emit('task:changed', res.task);
    if (res.spawned) {
      emit('task:created', res.spawned);
      const next = await get<TaskDetail>(`/tasks/${res.spawned.id}`).catch(() => null);
      next?.subtasks.forEach((s) => emit('task:created', s));
      toast(`Repeats — next one is due ${formatDate(res.spawned.due_date!, true)}`);
    }
    return res.task;
  } catch (err) {
    emit('task:changed', task);
    toast((err as Error).message);
    return null;
  }
}

export async function createTask(fields: Partial<Task> & { title: string }): Promise<Task | null> {
  try {
    const t = await post<Task>('/tasks', { tz: localTz(), ...fields });
    emit('task:created', t);
    return t;
  } catch (err) {
    toast((err as Error).message);
    return null;
  }
}

export async function deleteTask(task: Task): Promise<boolean> {
  try {
    await del(`/tasks/${task.id}`);
    emit('task:deleted', { id: task.id, parent_id: task.parent_id });
    return true;
  } catch (err) {
    toast((err as Error).message);
    return false;
  }
}

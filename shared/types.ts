export interface StatusLabel {
  key: string;
  label: string;
  color: string;
  /** Moving a task into this status marks it complete. */
  done?: boolean;
}

export type Priority = '' | 'low' | 'medium' | 'high' | 'critical';

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: Freq;
  /** Every N days / weeks / months / years. */
  interval: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
  timezone: string;
}

export interface Board {
  id: string;
  name: string;
  description: string;
  statuses: StatusLabel[];
  position: number;
  open_count?: number;
}

export interface Group {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  collapsed: boolean;
}

export interface Task {
  id: string;
  board_id: string;
  group_id: string | null;
  parent_id: string | null;
  title: string;
  status: string;
  priority: Priority;
  owner_id: string | null;
  /** YYYY-MM-DD in the task's time zone. */
  due_date: string | null;
  /** HH:MM, 24-hour. */
  due_time: string | null;
  tz: string;
  notes: string;
  recurrence: Recurrence | null;
  /** Minutes before the due time to send a reminder; null = no reminder. */
  reminder_minutes: number | null;
  reminder_at: number | null;
  completed_at: number | null;
  position: number;
  created_at: number;
  updated_at: number;
  checklist_total: number;
  checklist_done: number;
}

export interface ChecklistItem {
  id: string;
  task_id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface BoardData {
  board: Board;
  groups: Group[];
  tasks: Task[];
}

export interface TaskDetail {
  task: Task;
  subtasks: Task[];
  checklist: ChecklistItem[];
  board: Board;
  groups: Group[];
}

export interface TaskUpdateResult {
  task: Task;
  /** The next occurrence created when a recurring task was completed. */
  spawned: Task | null;
}

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: '', label: 'None', color: '#c4c4c4' },
  { value: 'low', label: 'Low', color: '#579bfc' },
  { value: 'medium', label: 'Medium', color: '#5559df' },
  { value: 'high', label: 'High', color: '#fdab3d' },
  { value: 'critical', label: 'Critical', color: '#e2445c' },
];

export const DEFAULT_STATUSES: StatusLabel[] = [
  { key: 'todo', label: 'Not started', color: '#c4c4c4' },
  { key: 'working', label: 'Working on it', color: '#fdab3d' },
  { key: 'stuck', label: 'Stuck', color: '#e2445c' },
  { key: 'done', label: 'Done', color: '#00c875', done: true },
];

export const PALETTE = [
  '#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c',
  '#ff5ac4', '#66ccff', '#9cd326', '#ff642e', '#037f4c',
  '#784bd1', '#bb3354', '#808080', '#225091', '#ffcb00',
];

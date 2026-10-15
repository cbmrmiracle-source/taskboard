import { useState } from 'preact/hooks';
import type { Board, StatusLabel } from '../../shared/types';
import { PALETTE } from '../../shared/types';
import { del, patch } from '../api';
import { toast } from '../bus';
import { useApp } from '../context';
import { Icon } from './Icon';
import { confirmAction, pick, Sheet } from './Sheet';

export function BoardSettings({ board, onClose, onSaved }: { board: Board; onClose: () => void; onSaved: (b: Board) => void }) {
  const { reloadBoards } = useApp();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [statuses, setStatuses] = useState<StatusLabel[]>(board.statuses);
  const [saving, setSaving] = useState(false);

  const setStatus = (i: number, changes: Partial<StatusLabel>) => setStatuses(statuses.map((s, j) => (j === i ? { ...s, ...changes } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= statuses.length) return;
    const next = [...statuses];
    [next[i], next[j]] = [next[j], next[i]];
    setStatuses(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const b = await patch<Board>(`/boards/${board.id}`, {
        name,
        description,
        statuses: statuses.map((s) => ({ ...s, key: s.key || undefined })),
      });
      onSaved(b);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirmAction(`Delete the board “${board.name}” and everything on it?`, 'Delete board'))) return;
    await del(`/boards/${board.id}`);
    await reloadBoards();
    onClose();
    location.hash = '#/';
  };

  return (
    <Sheet title="Board settings" onClose={onClose} full>
      <div class="stack">
        <label class="field">
          <span>Name</span>
          <input class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea class="input" rows={2} value={description} onInput={(e) => setDescription(e.currentTarget.value)} />
        </label>

        <div class="field">
          <span>Status labels</span>
          <p class="hint">Tasks moved into a “counts as done” status are completed — that’s what triggers repeating tasks.</p>
          <div class="status-editor">
            {statuses.map((s, i) => (
              <div class="status-edit-row" key={i}>
                <button
                  class="swatch"
                  style={{ background: s.color }}
                  aria-label="Color"
                  onClick={async () => {
                    const c = await pick('Color', PALETTE.map((p) => ({ value: p, label: ' ', color: p })), s.color);
                    if (c) setStatus(i, { color: c.value });
                  }}
                />
                <input class="input" value={s.label} onInput={(e) => setStatus(i, { label: e.currentTarget.value })} />
                <label class="done-toggle" title="Counts as done">
                  <input type="checkbox" checked={!!s.done} onChange={(e) => setStatus(i, { done: e.currentTarget.checked })} />
                  Done
                </label>
                <button class="icon-btn small" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                  ↑
                </button>
                <button class="icon-btn small" onClick={() => setStatuses(statuses.filter((_, j) => j !== i))} aria-label="Remove" disabled={statuses.length === 1}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            class="btn ghost"
            onClick={() => setStatuses([...statuses, { key: '', label: 'New status', color: PALETTE[statuses.length % PALETTE.length] }])}
          >
            <Icon name="plus" size={16} /> Add status
          </button>
        </div>

        <button class="btn primary" onClick={save} disabled={saving || !name.trim() || statuses.some((s) => !s.label.trim())}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button class="btn danger-outline" onClick={remove}>
          <Icon name="trash" size={16} /> Delete board
        </button>
      </div>
    </Sheet>
  );
}

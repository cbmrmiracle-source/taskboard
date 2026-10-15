import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';

let openSheets = 0;

export function Sheet({
  title,
  onClose,
  children,
  full,
}: {
  title?: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
  full?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    openSheets++;
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      if (--openSheets === 0) document.body.classList.remove('no-scroll');
    };
  }, [onClose]);
  // Portal to <body> so a sheet opened from inside another sheet stacks on top of it.
  return createPortal(
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${full ? 'sheet-full' : ''}`} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div class="sheet-head">
            <div class="sheet-title">{title}</div>
            <button class="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        )}
        <div class="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Imperative pickers: `await pick({...})` from anywhere ----

export interface PickOption<T> {
  value: T;
  label: string;
  color?: string;
  avatar?: ComponentChildren;
  danger?: boolean;
}

interface PickRequest {
  title: string;
  options: PickOption<unknown>[];
  current?: unknown;
  resolve: (v: { value: unknown } | undefined) => void;
}

let showPicker: ((r: PickRequest | null) => void) | null = null;

/** Resolves to `{ value }` for a choice, or undefined if dismissed. */
export function pick<T>(title: string, options: PickOption<T>[], current?: T): Promise<{ value: T } | undefined> {
  return new Promise((resolve) => {
    showPicker?.({ title, options, current, resolve: resolve as PickRequest['resolve'] });
  });
}

export function confirmAction(title: string, label: string): Promise<boolean> {
  return pick(title, [{ value: true, label, danger: true }]).then((r) => !!r);
}

export function PickerHost() {
  const [req, setReq] = useState<PickRequest | null>(null);
  useEffect(() => {
    showPicker = setReq;
    return () => {
      showPicker = null;
    };
  }, []);
  if (!req) return null;
  const done = (v: { value: unknown } | undefined) => {
    setReq(null);
    req.resolve(v);
  };
  return (
    <Sheet title={req.title} onClose={() => done(undefined)}>
      <div class="pick-list">
        {req.options.map((o) => (
          <button
            key={String(o.value)}
            class={`pick-item ${o.color ? 'pick-color' : ''} ${o.danger ? 'danger' : ''} ${o.value === req.current ? 'selected' : ''}`}
            style={o.color ? { background: o.color } : undefined}
            onClick={() => done({ value: o.value })}
          >
            {o.avatar}
            <span>{o.label}</span>
            {o.value === req.current && <span class="check">✓</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function prompt(title: string, initial = '', placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => showPrompt?.({ title, initial, placeholder, resolve }));
}

interface PromptRequest {
  title: string;
  initial: string;
  placeholder: string;
  resolve: (v: string | null) => void;
}
let showPrompt: ((r: PromptRequest | null) => void) | null = null;

export function PromptHost() {
  const [req, setReq] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    showPrompt = (r) => {
      setReq(r);
      setValue(r?.initial ?? '');
    };
    return () => {
      showPrompt = null;
    };
  }, []);
  if (!req) return null;
  const done = (v: string | null) => {
    setReq(null);
    req.resolve(v);
  };
  return (
    <Sheet title={req.title} onClose={() => done(null)}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) done(value.trim());
        }}
      >
        <input class="input" autoFocus value={value} placeholder={req.placeholder} onInput={(e) => setValue(e.currentTarget.value)} />
        <button class="btn primary" disabled={!value.trim()}>
          Save
        </button>
      </form>
    </Sheet>
  );
}

import { useEffect, useState } from 'preact/hooks';
import type { User } from '../../shared/types';
import { PALETTE } from '../../shared/types';
import { patch, post } from '../api';
import { toast } from '../bus';
import { useApp } from '../context';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push';
import { isIos, isStandalone, localTz } from '../util';
import { Avatar } from './Cells';
import { pick, prompt } from './Sheet';

export function Settings({ onLogout }: { onLogout: () => void }) {
  const { me, users, setMe } = useApp();
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentSubscription().then((s) => setPushOn(!!s), () => setPushOn(false));
  }, []);

  const saveMe = async (changes: Partial<User>) => {
    try {
      setMe(await patch<User>('/me', changes));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const togglePush = async () => {
    setBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        await enablePush();
        setPushOn(true);
        toast('Notifications on');
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const needsInstall = isIos() && !isStandalone();

  return (
    <div class="board settings">
      <div class="board-head">
        <h1 class="board-title">Settings</h1>
      </div>

      <section class="card stack">
        <h2 class="section-title">Profile</h2>
        <div class="profile-row">
          <button
            class="avatar-btn"
            aria-label="Change color"
            onClick={async () => {
              const c = await pick('Your color', PALETTE.map((p) => ({ value: p, label: ' ', color: p })), me.color);
              if (c) saveMe({ color: c.value });
            }}
          >
            <Avatar user={me} size={48} />
          </button>
          <div>
            <strong>{me.name}</strong>
            <div class="muted">{me.email}</div>
          </div>
          <button
            class="btn ghost small"
            onClick={async () => {
              const name = await prompt('Your name', me.name);
              if (name) saveMe({ name });
            }}
          >
            Edit
          </button>
        </div>
        <div class="muted">
          Time zone: {me.timezone}
          {me.timezone !== localTz() && (
            <>
              {' '}
              ·{' '}
              <button class="link" onClick={() => saveMe({ timezone: localTz() })}>
                use {localTz()}
              </button>
            </>
          )}
        </div>
      </section>

      <section class="card stack">
        <h2 class="section-title">Reminders on this device</h2>
        {needsInstall ? (
          <div class="install-help">
            <p>
              <strong>Add Taskboard to your Home Screen first.</strong> iPhone only allows notifications from apps on the Home Screen.
            </p>
            <ol>
              <li>
                Tap the <strong>Share</strong> button in Safari (the square with an arrow).
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </li>
              <li>Open Taskboard from your Home Screen and come back here.</li>
            </ol>
          </div>
        ) : !pushSupported() ? (
          <p class="muted">This browser doesn’t support notifications.</p>
        ) : (
          <>
            <div class="toggle-row">
              <span>Push notifications</span>
              <button class={`switch ${pushOn ? 'on' : ''}`} disabled={busy || pushOn === null} onClick={togglePush} aria-pressed={!!pushOn}>
                <span />
              </button>
            </div>
            {pushOn && (
              <button
                class="btn ghost"
                onClick={async () => {
                  const r = await post<{ sent: number }>('/push/test');
                  toast(r.sent ? 'Test sent' : 'No devices are subscribed');
                }}
              >
                Send a test notification
              </button>
            )}
            <p class="hint">You’ll get a notification for tasks assigned to you when their reminder time comes.</p>
          </>
        )}
      </section>

      <section class="card stack">
        <h2 class="section-title">Team</h2>
        {users.map((u) => (
          <div class="profile-row" key={u.id}>
            <Avatar user={u} size={32} />
            <div>
              <strong>{u.name}</strong>
              <div class="muted">{u.email}</div>
            </div>
          </div>
        ))}
        <p class="hint">Teammates can create an account from the sign-in page using the invite code you set in Cloudflare (INVITE_CODE).</p>
      </section>

      <section class="card stack">
        <button
          class="btn ghost"
          onClick={async () => {
            const current = await prompt('Current password');
            if (!current) return;
            const pw = await prompt('New password (8+ characters)');
            if (!pw) return;
            try {
              await post('/me/password', { current, password: pw });
              toast('Password changed');
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          Change password
        </button>
        <button class="btn danger-outline" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </div>
  );
}

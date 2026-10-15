import { useEffect, useState } from 'preact/hooks';
import { get, post } from '../api';
import { localTz } from '../util';

export function Login({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<{ hasUsers: boolean; signupOpen: boolean } | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', invite: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ hasUsers: boolean; signupOpen: boolean }>('/auth/status').then((s) => {
      setStatus(s);
      if (!s.hasUsers) setMode('signup');
    }, (e) => setError(e.message));
  }, []);

  const set = (k: keyof typeof form) => (e: Event) => setForm({ ...form, [k]: (e.currentTarget as HTMLInputElement).value });

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post(`/auth/${mode}`, { ...form, timezone: localTz() });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const first = status && !status.hasUsers;
  return (
    <div class="login">
      <form class="login-card stack" onSubmit={submit}>
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>{first ? 'Set up Taskboard' : mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        {first && <p class="muted">You’re the first person here, so you’ll be the owner.</p>}
        {mode === 'signup' && <input class="input" placeholder="Your name" autoComplete="name" value={form.name} onInput={set('name')} required />}
        <input class="input" type="email" placeholder="Email" autoComplete="email" value={form.email} onInput={set('email')} required />
        <input
          class="input"
          type="password"
          placeholder="Password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={mode === 'signup' ? 8 : undefined}
          value={form.password}
          onInput={set('password')}
          required
        />
        {mode === 'signup' && !first && <input class="input" placeholder="Invite code" value={form.invite} onInput={set('invite')} required />}
        {error && <div class="error">{error}</div>}
        <button class="btn primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        {status?.hasUsers && status.signupOpen && (
          <button type="button" class="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'New here? Create an account with an invite code' : 'Already have an account? Sign in'}
          </button>
        )}
      </form>
    </div>
  );
}

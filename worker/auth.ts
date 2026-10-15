import type { User } from '../shared/types';
import { bytesToB64url, b64urlToBytes } from './push';
import { Env, first, run } from './http';

const COOKIE = 'tb_session';
const SESSION_DAYS = 90;
const enc = new TextEncoder();

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64urlToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { hash: bytesToB64url(bits), salt: bytesToB64url(salt) };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(s: string): Promise<string> {
  return bytesToB64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Creates a session and returns the Set-Cookie header value. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await run(env, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', await sha256(token), userId, expires);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export async function destroySession(req: Request, env: Env): Promise<string> {
  const token = readCookie(req, COOKIE);
  if (token) await run(env, 'DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return first<User>(
    env,
    `SELECT u.id, u.name, u.email, u.color, u.timezone FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    await sha256(token),
    Date.now(),
  );
}

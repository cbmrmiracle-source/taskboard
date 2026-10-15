import type { User } from '../shared/types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  VAPID_SUBJECT?: string;
  /** Required for anyone but the first person to create an account. */
  INVITE_CODE?: string;
}

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  user: User;
  body: Record<string, unknown>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const now = () => Date.now();
export const newId = () => crypto.randomUUID();

export async function all<T>(env: Env, sql: string, ...binds: unknown[]): Promise<T[]> {
  const res = await env.DB.prepare(sql)
    .bind(...binds)
    .all<T>();
  return res.results;
}

export async function first<T>(env: Env, sql: string, ...binds: unknown[]): Promise<T | null> {
  return env.DB.prepare(sql)
    .bind(...binds)
    .first<T>();
}

export async function run(env: Env, sql: string, ...binds: unknown[]): Promise<void> {
  await env.DB.prepare(sql)
    .bind(...binds)
    .run();
}

// Request-body readers: each throws a 400 for a value of the wrong shape.

export function str(v: unknown, field: string, max = 500): string {
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${field} is too long`);
  return s;
}

export function requiredStr(v: unknown, field: string, max = 500): string {
  const s = str(v, field, max);
  if (!s) throw new HttpError(400, `${field} is required`);
  return s;
}

export function color(v: unknown): string {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new HttpError(400, 'Invalid color');
  return v.toLowerCase();
}

export function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `${field} must be a number`);
  return v;
}

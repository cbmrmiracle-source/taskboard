export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

export const get = <T>(p: string) => api<T>('GET', p);
export const post = <T>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const patch = <T>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const del = <T>(p: string) => api<T>('DELETE', p);

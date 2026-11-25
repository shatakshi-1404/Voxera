import { useAuth } from '../stores/auth'

// Dev: leave VITE_API_URL empty (Vite proxies /api to :8000).
// Production: VITE_API_URL=https://your-backend.example.com  (no trailing slash)
export const API_ORIGIN = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')
export const API = `${API_ORIGIN}/api/v1`
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
interface Opts { method?: string; body?: unknown; form?: FormData; token?: string | null }

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const token = opts.token !== undefined ? opts.token : useAuth.getState().token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body) }
  const res = await fetch(API + path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
  if (res.status === 401 && token && opts.token === undefined) useAuth.getState().logout()
  if (!res.ok) {
    let detail: unknown
    try { detail = (await res.json()).detail } catch { /* ignore */ }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : res.statusText)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

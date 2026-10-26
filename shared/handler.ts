import { FEEDS, getFeed, type Env } from './feeds';
import { HISTORY, getHistory, recordSnapshot, memStore, type Store } from './history';
const fallback = memStore();
/** Shared HTTP handler: /api/feeds, /api/feed/:name, /api/history, /api/history/:stream */
export async function handleApi(pathname: string, env: Env, force = false, store: Store = fallback, opts: { nvdSteps?: number } = {}): Promise<{ status: number; body: unknown; ttl: number }> {
  if (pathname === '/api/feeds') {
    return { status: 200, ttl: 3600, body: Object.entries(FEEDS).map(([id, f]) => ({ id, label: f.label, poll: f.poll, ttl: f.ttl })) };
  }
  if (pathname === '/api/history') return { status: 200, ttl: 3600, body: Object.entries(HISTORY).map(([id, h]) => ({ id, label: h.label })) };
  const h = pathname.match(/^\/api\/history\/([a-z0-9-]+)$/);
  if (h) {
    const r = await getHistory(h[1], env, store, opts);
    return { status: 200, ttl: r.ok ? Math.min(HISTORY[h[1]]?.ttl ?? 60, 600) : 30, body: r };
  }
  const m = pathname.match(/^\/api\/feed\/([a-z0-9-]+)$/);
  if (!m) return { status: 404, ttl: 0, body: { error: 'not found' } };
  const r = await getFeed(m[1], env, force);
  await recordSnapshot(store, m[1], r).catch(() => {});
  return { status: 200, ttl: r.ok ? Math.min(r.ttl, 120) : 30, body: r };
}

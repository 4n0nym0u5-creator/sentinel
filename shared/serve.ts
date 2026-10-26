// Pages Functions read side: return the collector's precomputed JSON from D1 (no upstream fetches in requests).
import { d1Store } from './d1Store';
const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
export async function serveBlob(env: any, kind: 'feed' | 'hist', id: string): Promise<Response> {
  if (!/^[a-z0-9-]+$/.test(id)) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: H });
  if (!env.DB) return new Response(JSON.stringify({ feed: id, stream: id, ok: false, error: 'D1 binding DB missing', sources: [] }), { status: 200, headers: H });
  const r = await d1Store(env.DB).getRaw(`${kind}:${id}`);
  if (!r) {
    const base = { ok: false, fetchedAt: new Date().toISOString(), error: 'Not collected yet — the SENTINEL collector (cron, every minute) has not produced this yet. Try again in a few minutes.' };
    const body = kind === 'feed' ? { feed: id, ttl: 60, sources: [], ...base } : { stream: id, source: [], start: '', testFrom: '', end: '', notes: [], ...base };
    return new Response(JSON.stringify(body), { status: 200, headers: H });
  }
  let v = r.v;
  if (kind === 'feed') {
    // flag copies the collector has not refreshed for > 3 collection intervals (the UI shows them STALE)
    const m = v.match(/"fetchedAt":"([^"]+)"[^]*?"collectEvery":(\d+)/);
    if (m && Date.now() - Date.parse(m[1]) > (3 * +m[2] + 300) * 1000) v = v.replace(/^\{/, '{"stale":true,');
  }
  return new Response(v, { status: 200, headers: { ...H, 'x-sentinel-stored-at': new Date(r.at).toISOString() } });
}

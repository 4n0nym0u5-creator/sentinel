// Cloudflare D1-backed store used by the cron collector (writer) and the Pages Functions (reader).
// Values are JSON strings split into parts so large payloads stay under D1's per-row limit.
import type { Store } from './history';
export interface D1Like {
  prepare(q: string): { bind(...a: unknown[]): any; all(): Promise<{ results: any[] }>; first(): Promise<any> };
  batch(s: any[]): Promise<any>;
}
const PART = 400_000; // chars per row (≤ ~1.2 MB UTF-8, well under D1's 2 MB row limit)
export interface RawStore extends Store {
  getRaw(k: string): Promise<{ v: string; at: number } | null>;
  putRaw(k: string, v: string): Promise<void>;
  getPrefix(prefix: string): Promise<Record<string, any>>;
}
export function d1Store(db: D1Like): RawStore {
  const join = (rows: any[]) => rows.map((r) => r.v).join('');
  const s: RawStore = {
    kind: 'Cloudflare D1 (sentinel-store)',
    async getRaw(k) {
      const { results } = await db.prepare('SELECT v, at FROM blobs WHERE k = ?1 ORDER BY part').bind(k).all();
      return results.length ? { v: join(results), at: Math.min(...results.map((r: any) => r.at)) } : null;
    },
    async putRaw(k, v) {
      const at = Date.now(), parts: string[] = [];
      for (let i = 0; i < v.length || i === 0; i += PART) parts.push(v.slice(i, i + PART));
      await db.batch([
        ...parts.map((p, i) => db.prepare('INSERT OR REPLACE INTO blobs (k, part, v, at) VALUES (?1, ?2, ?3, ?4)').bind(k, i, p, at)),
        db.prepare('DELETE FROM blobs WHERE k = ?1 AND part >= ?2').bind(k, parts.length),
      ]);
    },
    async getPrefix(prefix) {
      const { results } = await db.prepare('SELECT k, v FROM blobs WHERE k >= ?1 AND k < ?2 ORDER BY k, part').bind(prefix, prefix + '\uffff').all();
      const by: Record<string, string> = {};
      for (const r of results) by[r.k] = (by[r.k] || '') + r.v;
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(by)) { try { out[k.slice(prefix.length)] = JSON.parse(v); } catch { /* skip torn row */ } }
      return out;
    },
    async get(k) { const r = await s.getRaw(k); if (!r) return null; try { return JSON.parse(r.v); } catch { return null; } },
    async put(k, v) { await s.putRaw(k, JSON.stringify(v)); },
  };
  return s;
}

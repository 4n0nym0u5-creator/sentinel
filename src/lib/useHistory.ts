import { useCallback, useEffect, useRef, useState } from 'react';
import type { Hist } from './trends';
const STREAMS: { id: string; poll: number }[] = [
  { id: 'ransomware', poll: 3600 }, { id: 'kev', poll: 6 * 3600 }, { id: 'nvd', poll: 300 }, { id: 'dshield', poll: 3 * 3600 }, { id: 'snapshots', poll: 900 },
];
/** Loads /api/history/* once and re-polls; keeps the last good payload if a refresh fails. */
export function useHistory() {
  const [H, setH] = useState<Hist>({});
  const [loading, setLoading] = useState<Set<string>>(new Set(STREAMS.map((s) => s.id)));
  const timers = useRef<number[]>([]);
  const load = useCallback(async (id: string) => {
    setLoading((s) => new Set(s).add(id));
    try {
      const r = await fetch(`/api/history/${id}`, { cache: 'no-store' });
      const j = await r.json();
      setH((h) => (j.ok || !h[id]?.ok ? { ...h, [id]: j } : { ...h, [id]: { ...h[id], stale: true, error: j.error } }));
    } catch (e: any) {
      setH((h) => (h[id]?.ok ? { ...h, [id]: { ...h[id], stale: true, error: String(e?.message || e) } } : { ...h, [id]: { ok: false, error: String(e?.message || e) } }));
    } finally { setLoading((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }, []);
  useEffect(() => {
    STREAMS.forEach((s) => { load(s.id); timers.current.push(window.setInterval(() => load(s.id), s.poll * 1000)); });
    return () => timers.current.forEach(clearInterval);
  }, [load]);
  // poll NVD faster while its backfill is still running
  useEffect(() => {
    const p = H.nvd?.progress; if (!p || p.done >= p.total) return;
    const t = window.setTimeout(() => load('nvd'), 60_000); return () => clearTimeout(t);
  }, [H.nvd, load]);
  return { H, loading };
}

import { useCallback, useEffect, useState } from 'react';

export interface CollectorTask { id: string; next: string | null; last: string | null; ok: number | null; err: string | null; ms: number | null; runs: number; fails: number }
export interface CollectorState { available: boolean; lastRun?: number; tasks: CollectorTask[]; failing: number; checkedAt?: number }

/** Deployed (Cloudflare) only: status of the cron collector that fills the server-side store. Locally the API fetches on demand, so this reports available:false. */
export function useCollector(pollSec = 60) {
  const [st, setSt] = useState<CollectorState>({ available: false, tasks: [], failing: 0 });
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/collector', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const tasks: CollectorTask[] = d.tasks || [];
      const last = Math.max(0, ...tasks.map((t) => (t.last ? Date.parse(t.last) : 0)));
      setSt({ available: true, tasks, lastRun: last || undefined, failing: tasks.filter((t) => t.ok === 0).length, checkedAt: Date.now() });
    } catch {
      setSt((p) => ({ ...p, available: false, checkedAt: Date.now() }));
    }
  }, []);
  useEffect(() => { load(); const iv = window.setInterval(load, pollSec * 1000); return () => clearInterval(iv); }, [load, pollSec]);
  return { collector: st, reloadCollector: load };
}

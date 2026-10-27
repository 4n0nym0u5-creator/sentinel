import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedResult, FeedState } from './types';

const DEFS: { id: string; label: string; poll: number }[] = [
  { id: 'ransomware', label: 'ransomware.live victims', poll: 300 },
  { id: 'kev', label: 'CISA KEV catalog', poll: 600 },
  { id: 'nvd', label: 'NIST NVD critical CVEs', poll: 900 },
  { id: 'euvd', label: 'ENISA EUVD', poll: 900 },
  { id: 'c2', label: 'abuse.ch Feodo Tracker C2', poll: 600 },
  { id: 'threatfox', label: 'abuse.ch ThreatFox', poll: 600 },
  { id: 'dshield', label: 'SANS ISC / DShield', poll: 300 },
  { id: 'news', label: 'News & advisories (69 RSS, all regions)', poll: 180 },
  { id: 'crypto', label: 'Crypto hacks + crypto-security RSS', poll: 600 },
  { id: 'cryptovulns', label: 'Crypto vulns (KEV + NVD)', poll: 3600 },
];

/** Polls each feed independently. Keeps last-good data; marks STALE when a poll fails or data ages past 3× poll. */
export function useFeeds() {
  const [feeds, setFeeds] = useState<Record<string, FeedState>>(() =>
    Object.fromEntries(DEFS.map((d) => [d.id, { ...d, status: 'loading', sources: [] } as FeedState])),
  );
  const timers = useRef<Record<string, number>>({});

  const load = useCallback(async (id: string, force = false) => {
    const def = DEFS.find((d) => d.id === id)!;
    const attempt = Date.now();
    let res: FeedResult | null = null;
    let err = '';
    try {
      const r = await fetch(`/api/feed/${id}${force ? '?force=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Proxy HTTP ${r.status}`);
      res = await r.json();
      if (!res!.ok) err = res!.error || 'Feed error';
    } catch (e: any) {
      err = String(e?.message || e);
    }
    setFeeds((prev) => {
      const p = prev[id];
      const ok = !!res?.ok;
      const next: FeedState = {
        ...p,
        lastAttempt: attempt,
        nextAt: Date.now() + def.poll * 1000,
        sources: res?.sources?.length ? res.sources : p.sources,
        error: ok ? undefined : err,
        ...(ok ? { data: res!.data, fetchedAt: res!.fetchedAt, lastSuccess: Date.now() } : {}),
      };
      next.status = ok ? ((res as any).stale ? 'stale' : 'live') : p.data ? 'stale' : 'offline';
      if (ok && (res as any).stale) next.error = 'Collector copy is older than expected (shown as stale)';
      return { ...prev, [id]: next };
    });
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(() => load(id), def.poll * 1000);
  }, []);

  useEffect(() => {
    DEFS.forEach((d, i) => window.setTimeout(() => load(d.id), i * 120));
    const t = timers.current;
    // age check: mark live feeds stale if their last success is older than 3× poll
    const iv = window.setInterval(() => {
      setFeeds((prev) => {
        let changed = false; const out = { ...prev };
        for (const f of Object.values(prev)) {
          if (f.status === 'live' && f.lastSuccess && Date.now() - f.lastSuccess > f.poll * 3000) { out[f.id] = { ...f, status: 'stale' }; changed = true; }
        }
        return changed ? out : prev;
      });
    }, 15000);
    return () => { Object.values(t).forEach(clearTimeout); clearInterval(iv); };
  }, [load]);

  const refreshAll = useCallback(() => DEFS.forEach((d) => load(d.id, true)), [load]);
  return { feeds, refreshAll, reload: load };
}

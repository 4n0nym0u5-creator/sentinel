import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { FeedState, Sev } from '../lib/types';
import { SEV_COLOR, cvssSev } from '../lib/sev';
import { ago } from '../lib/format';

export function Panel({ title, icon, right, children, className, bodyClass, feeds }: { title: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; feeds?: FeedState[] }) {
  return (
    <section className={clsx('panel flex h-full min-h-0 flex-col', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-ink-600/60 px-3 py-2">
        <h2 className="panel-title">{icon}{title}</h2>
        <div className="flex items-center gap-2">{right}{feeds?.map((f) => <FeedDot key={f.id} f={f} />)}</div>
      </header>
      <div className={clsx('min-h-0 flex-1', bodyClass)}>{children}</div>
    </section>
  );
}

export function SevBadge({ sev, className }: { sev: Sev; className?: string }) {
  return (
    <span className={clsx('chip border', sev === 'critical' && 'animate-pulsered', className)} style={{ color: SEV_COLOR[sev], borderColor: SEV_COLOR[sev] + '66', background: SEV_COLOR[sev] + '1a' }}>
      {sev === 'critical' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {sev}
    </span>
  );
}

export function CvssBadge({ score }: { score?: number | null }) {
  const s = cvssSev(score);
  if (!s) return <span className="chip border border-ink-500 text-slate-500">n/a</span>;
  return <span className="mono inline-flex min-w-[38px] justify-center rounded px-1.5 py-0.5 text-[11px] font-bold text-ink-950" style={{ background: SEV_COLOR[s], boxShadow: s === 'critical' ? `0 0 10px ${SEV_COLOR[s]}88` : undefined }}>{score!.toFixed(1)}</span>;
}

export function EpssBar({ v }: { v?: number | null }) {
  if (v == null) return <span className="text-[10px] text-slate-600">EPSS —</span>;
  const pct = v * 100;
  const c = pct >= 10 ? SEV_COLOR.critical : pct >= 1 ? SEV_COLOR.high : pct >= 0.1 ? SEV_COLOR.medium : SEV_COLOR.low;
  return (
    <span className="inline-flex items-center gap-1" title={`FIRST EPSS: ${pct.toFixed(2)}% probability of exploitation in next 30 days`}>
      <span className="h-1.5 w-12 overflow-hidden rounded bg-ink-700"><span className="block h-full" style={{ width: `${Math.max(3, Math.min(100, Math.log10(pct * 10 + 1) * 50))}%`, background: c }} /></span>
      <span className="mono text-[10px]" style={{ color: c }}>{pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}%</span>
    </span>
  );
}

export const STATUS_COLOR = { live: '#22c55e', stale: '#ffc21a', offline: '#ff2d55', loading: '#7d8ca3' } as const;
export function FeedDot({ f }: { f: FeedState }) {
  const c = STATUS_COLOR[f.status];
  return (
    <span className="group relative inline-flex items-center" title={`${f.label}: ${f.status.toUpperCase()}${f.fetchedAt ? ` · updated ${ago(f.fetchedAt)}` : ''}${f.error ? ` · ${f.error}` : ''}`}>
      <span className={clsx('h-2 w-2 rounded-full', f.status === 'live' && 'shadow-[0_0_6px_#22c55e]', f.status === 'loading' && 'blink')} style={{ background: c }} />
    </span>
  );
}

export function Offline({ f, what }: { f?: FeedState; what: string }) {
  if (!f) return null;
  if (f.status === 'loading') return <div className="flex h-full items-center justify-center gap-2 p-6 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-cyan-glow blink" /> Connecting to {what}…</div>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
      <span className="chip border border-sev-critical/50 bg-sev-critical/10 text-sev-critical">● Feed offline</span>
      <p className="text-xs text-slate-400">{what} is unavailable — no data is shown rather than estimated.</p>
      {f.error && <p className="mono max-w-md text-[10px] text-slate-500">{f.error}</p>}
    </div>
  );
}

export function CC({ cc }: { cc?: string | null }) {
  if (!cc) return <span className="mono inline-block w-7 rounded bg-ink-700 px-1 text-center text-[10px] text-slate-500">??</span>;
  return <span className="mono inline-block w-7 rounded border border-ink-500 bg-ink-800 px-1 text-center text-[10px] font-semibold text-slate-300">{cc}</span>;
}

export function Bar({ value, max, color = '#22e3ff' }: { value: number; max: number; color?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700"><div className="h-full rounded" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: `linear-gradient(90deg, ${color}66, ${color})` }} /></div>;
}

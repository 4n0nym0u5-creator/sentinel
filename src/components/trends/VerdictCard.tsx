import clsx from 'clsx';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp, Loader2 } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { fmtPct, type Analysis } from '../../lib/trends';
import { fmtP } from '../../lib/stats';
import { Term, at } from '../explain';

export const VCOLOR = { rising: '#ff2d55', falling: '#22c55e', stable: '#94a3b8', insufficient: '#475569' } as const;
export const VLABEL = { rising: 'Rising', falling: 'Falling', stable: 'Stable', insufficient: 'Insufficient data' } as const;
const ICON = { rising: ArrowUpRight, falling: ArrowDownRight, stable: ArrowRight, insufficient: CircleHelp };

export default function VerdictCard({ a, selected, onClick, filtered }: { a: Analysis; selected: boolean; onClick: () => void; filtered?: boolean }) {
  const loading = !a.daily.ready && a.daily.reason === 'loading';
  const Icon = loading ? Loader2 : ICON[a.verdict];
  const c = VCOLOR[a.verdict];
  const spark = a.buckets.map((b) => ({ v: b.status === 'ok' || b.status === 'seed' ? b.value : null }));
  return (
    <button onClick={onClick} data-stream={a.meta.id}
      className={clsx('panel group flex min-h-[148px] flex-col gap-1 p-2.5 text-left transition hover:border-cyan-glow/40', selected && '!border-cyan-glow/70 shadow-[0_0_0_1px_rgba(34,227,255,.35)]')}
      style={a.verdict === 'rising' ? { boxShadow: selected ? undefined : 'inset 0 0 24px rgba(255,45,85,.10)' } : undefined}>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: a.meta.color }} />
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-300">{at(a.meta.short)}</span>
        {filtered && <span className="chip ml-auto border border-cyan-glow/40 !px-1 text-cyan-glow">filtered</span>}
      </div>
      <div className="flex items-center gap-2">
        <Icon size={38} strokeWidth={2.6} className={clsx(loading && 'animate-spin')} style={{ color: loading ? '#475569' : c, filter: a.verdict === 'rising' ? 'drop-shadow(0 0 8px rgba(255,45,85,.6))' : undefined }} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight" style={{ color: loading ? '#64748b' : c }}>{loading ? 'Loading' : a.daily.reason === 'recording' ? 'Recording' : a.daily.error ? 'Offline' : VLABEL[a.verdict]}</div>
          <div className="mono text-[10px] text-slate-500">{a.mk ? <><Term id="trendtest">MK</Term> <Term id="pvalue">{fmtP(a.mk.p)}</Term> · <Term id="n">n</Term>={a.mk.n}</> : a.daily.ready ? `${a.nTest}/8 periods` : a.daily.reason}</div>
        </div>
      </div>
      <div className="h-[34px] w-full">
        {spark.length > 1 && <ResponsiveContainer><LineChart data={spark} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}><YAxis hide domain={['dataMin', 'dataMax']} /><Line dataKey="v" stroke={a.meta.color} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls={false} /></LineChart></ResponsiveContainer>}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-x-2 text-[10px] leading-snug">
        <span className="text-slate-500"><Term id="prior">vs prior</Term> {a.period}d</span><Delta v={a.vsPrior.available ? a.vsPrior.pct : null} p={a.vsPrior.p} />
        <span className="text-slate-500"><Term id="yoy">vs last year</Term></span><Delta v={a.vsYear.available ? a.vsYear.pct : null} p={a.vsYear.p} />
        {a.daily.sevLevels > 0 && <><span className="text-slate-500"><Term id="sevindex">severity</Term></span><span className="mono text-right" style={{ color: VCOLOR[a.sevVerdict] }}>{a.sevMk ? VLABEL[a.sevVerdict].replace('Insufficient data', '—') : '—'}</span></>}
      </div>
    </button>
  );
}
function Delta({ v, p }: { v: number | null; p: number | null }) {
  if (v == null) return <span className="mono text-right text-slate-600">n/a</span>;
  const sig = p != null && p < 0.05;
  return <span className="mono text-right" title={p != null ? fmtP(p) : ''} style={{ color: !sig ? '#94a3b8' : v > 0 ? '#ff5d7a' : '#4ade80' }}>{fmtPct(v)}{sig ? '*' : ''}</span>;
}

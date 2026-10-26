import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEV_COLOR } from '../../lib/sev';
import type { Analysis } from '../../lib/trends';
import { TT } from './MainChart';
import { VCOLOR, VLABEL } from './VerdictCard';
import { fmtP } from '../../lib/stats';

const KEYS = [['c', 'Critical', SEV_COLOR.critical], ['h', 'High', SEV_COLOR.high], ['m', 'Medium', SEV_COLOR.medium], ['l', 'Low', SEV_COLOR.low], ['u', 'Not yet scored', '#475569']] as const;
const RULES: Record<string, string> = {
  ransomware: 'Critical = victim in a critical-infrastructure sector (health, government, energy, finance, telecom, transport, education…); otherwise High.',
  kev: 'Critical = CISA flags known ransomware-campaign use; otherwise High.',
  nvd: 'CVSS v3 base severity. Medium/Low/unscored shown at monthly granularity only (from NVD count queries; vendor filter off).',
  combined: 'Sum of component severities (ransomware, KEV, NVD).',
  cryptohacks: 'USD-loss tiers at time of hack: Critical ≥ $100M · High ≥ $10M · Medium ≥ $1M · Low < $1M.',
  news: 'Keyword rule: zero-day / actively exploited = Critical; breach / ransomware / malware = High; podcasts & newsletters = Low.',
};
export default function SeverityChart({ a }: { a: Analysis }) {
  if (!a.daily.sevLevels) return <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-500">{a.meta.label} has no per-event severity — it is a volume indicator only.</div>;
  const data = a.buckets.map((b) => {
    const s = b.sev; const t = s ? s.reduce((x, y) => x + y, 0) : 0;
    const pc = (k: number) => (s && t ? (s[k] / t) * 100 : null);
    return { label: b.label, c: pc(0), h: pc(1), m: pc(2), l: pc(3), u: pc(4), idx: b.status === 'ok' ? b.idx ?? null : null, n: t, partial: b.status === 'partial' };
  });
  const used = KEYS.filter(([k]) => data.some((d) => (d as any)[k]));
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-[10.5px] text-slate-400">
        <span>Severity index trend:</span>
        <b style={{ color: VCOLOR[a.sevVerdict] }}>{a.sevMk ? VLABEL[a.sevVerdict] : 'insufficient data'}</b>
        {a.sevMk && <span className="mono text-slate-500">MK {fmtP(a.sevMk.p)}</span>}
        {a.critShare && <span className="mono text-slate-500">· critical share {(a.critShare.prev * 100).toFixed(1)}% → {(a.critShare.cur * 100).toFixed(1)}%{a.critShare.p != null ? ` (${fmtP(a.critShare.p)})` : ''}</span>}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#132033" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1c2d45' }} minTickGap={18} />
            <YAxis yAxisId="p" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => v + '%'} tickLine={false} axisLine={false} />
            <YAxis yAxisId="i" orientation="right" domain={[1, 4]} ticks={[1, 2, 3, 4]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={26} />
            <Tooltip {...TT} formatter={(v: any, n: any) => [typeof v === 'number' ? (n === 'Severity index' ? v.toFixed(2) : v.toFixed(1) + '%') : v, n]} />
            <Legend wrapperStyle={{ fontSize: 10 }} iconSize={9} />
            {used.map(([k, n, c]) => <Bar key={k} yAxisId="p" dataKey={k} name={n} stackId="s" fill={c} fillOpacity={0.8} isAnimationActive={false} maxBarSize={28} />)}
            <Line yAxisId="i" dataKey="idx" name="Severity index" stroke="#fff" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="px-1 pt-1 text-[10px] leading-snug text-slate-500">Index = weighted mean (Critical 4 · High 3 · Medium 2 · Low 1; periods with ≥ 5 events). {RULES[a.meta.id]}</p>
    </div>
  );
}

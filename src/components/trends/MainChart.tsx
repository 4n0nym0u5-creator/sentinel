import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtN, isoDay, type Analysis, type Bucket } from '../../lib/trends';
import { VCOLOR } from './VerdictCard';

export const TT = { contentStyle: { background: '#09101b', border: '1px solid #2a4062', borderRadius: 6, fontSize: 11 }, itemStyle: { color: '#e2e8f0' }, labelStyle: { color: '#94a3b8' } };
export function Hatch({ id, color }: { id: string; color: string }) {
  return <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={color} fillOpacity={0.12} /><line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.5" strokeOpacity={0.7} /></pattern>;
}
/** consecutive runs of buckets matching pred → [firstLabel, lastLabel] */
export function runs(b: Bucket[], pred: (x: Bucket) => boolean) {
  const out: [string, string, number][] = []; let s: Bucket | null = null, p: Bucket | null = null, n = 0;
  for (const x of b) { if (pred(x)) { if (!s) { s = x; n = 0; } p = x; n++; } else if (s) { out.push([s.label, p!.label, n]); s = null; } }
  if (s) out.push([s.label, p!.label, n]);
  return out;
}
const MA = { day: ['7-day avg', '28-day avg'], week: ['4-week avg', '12-week avg'], month: ['3-month avg', '6-month avg'] } as const;

export default function MainChart({ a }: { a: Analysis }) {
  const c = a.meta.color;
  if (!a.daily.ready) return <Empty a={a} />;
  const data = a.buckets.map((b) => ({ ...b, bar: b.value }));
  const [m1, m2] = MA[a.gran];
  const gaps = runs(a.buckets, (b) => b.value == null);
  const seed = runs(a.buckets, (b) => b.status === 'seed');
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: -4 }}>
        <defs><Hatch id="hatch-main" color={c} /><Hatch id="hatch-gap" color="#64748b" /></defs>
        <CartesianGrid stroke="#132033" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1c2d45' }} minTickGap={18} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtN(v)} width={44} />
        {gaps.map(([x1, x2, n], i) => <ReferenceArea key={'g' + i} x1={x1} x2={x2} fill="url(#hatch-gap)" ifOverflow="extendDomain" label={n >= 3 ? { value: 'no data', fill: '#64748b', fontSize: 10, position: 'insideTop' } : undefined} />)}
        {seed.map(([x1, x2], i) => <ReferenceArea key={'s' + i} x1={x1} x2={x2} fill="#ffc21a" fillOpacity={0.06} label={{ value: a.meta.id.startsWith('crypto') ? 'before test start (2021) — excluded' : 'catalogue seeding — excluded', fill: '#a3864a', fontSize: 10, position: 'insideTopLeft' }} />)}
        <Tooltip {...TT} cursor={{ fill: '#13203366' }} content={<Tip a={a} />} />
        <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} iconSize={9} />
        <Bar dataKey="bar" name={a.meta.unit} isAnimationActive={false} maxBarSize={28} radius={[2, 2, 0, 0]}>
          {data.map((b, i) => <Cell key={i} fill={b.status === 'partial' ? 'url(#hatch-main)' : c} fillOpacity={b.status === 'seed' ? 0.35 : b.status === 'partial' ? 1 : 0.75} stroke={b.anomaly ? '#ff2d55' : undefined} />)}
        </Bar>
        <Line dataKey="ma1" name={m1} stroke="#e2e8f0" strokeWidth={1.3} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="ma2" name={m2} stroke="#22e3ff" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />
        <Line dataKey="trend" name={`Sen trend (${a.verdict})`} stroke={VCOLOR[a.verdict]} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        {a.buckets.filter((b) => b.anomaly).map((b) => (
          <ReferenceDot key={b.i} x={b.label} y={b.value!} r={5} fill="#ff2d55" stroke="#fff" strokeWidth={1.2} ifOverflow="extendDomain"
            label={{ value: `+${b.anomaly!.toFixed(1)}σ`, position: 'top', fill: '#ff8fa3', fontSize: 10, fontWeight: 600 }} />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
function Tip({ active, payload, a }: any) {
  if (!active || !payload?.length) return null;
  const b: Bucket = payload[0].payload;
  const range = b.end - b.start > 1 ? `${isoDay(b.start)} → ${isoDay(b.end - 1)}` : isoDay(b.start);
  return (
    <div className="rounded-md border border-ink-500 bg-ink-850/95 px-2.5 py-1.5 text-[11px] shadow-xl">
      <div className="text-slate-400">{range} <span className="text-slate-600">UTC</span></div>
      <div className="mono text-[13px] text-white">{b.value == null ? 'no data' : fmtN(b.value)} <span className="text-[10px] text-slate-400">{a.meta.unit}</span></div>
      {b.sev && a.daily.sevLevels > 0 && <div className="mono text-[10px] text-slate-400">crit {b.sev[0]} · high {b.sev[1]}{a.daily.sevLevels > 2 || b.sev[2] ? ` · med ${b.sev[2]} · low ${b.sev[3]}` : ''}</div>}
      {b.ma2 != null && <div className="text-[10px] text-slate-500">avg {fmtN(b.ma1 ?? NaN)} / {fmtN(b.ma2)}</div>}
      {b.anomaly && <div className="text-[10px] font-semibold text-sev-critical">Anomaly: +{b.anomaly.toFixed(1)}σ above baseline</div>}
      {b.status !== 'ok' && <div className="text-[10px] text-sev-medium">{b.why}</div>}
    </div>
  );
}
export function Empty({ a }: { a: Analysis }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      {a.daily.error ? <span className="chip border border-sev-critical/50 bg-sev-critical/10 text-sev-critical">● Source offline</span> : <span className="chip border border-ink-500 text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-cyan-glow blink" /> {a.daily.reason === 'recording' ? 'Recording' : 'Loading history'}</span>}
      <p className="max-w-md text-xs text-slate-400">{a.sentence[0]}</p>
    </div>
  );
}

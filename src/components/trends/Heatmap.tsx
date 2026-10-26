import { DAY, fmtN, isoDay, today, type Analysis } from '../../lib/trends';

export default function Heatmap({ a }: { a: Analysis }) {
  const D = a.daily;
  if (!D.ready) return <div className="py-10 text-center text-xs text-slate-500">{a.sentence[0]}</div>;
  const t = today(), end = t, startMon = end - 364 - ((new Date((end - 364) * DAY).getUTCDay() + 6) % 7);
  const weeks = Math.ceil((end - startMon + 1) / 7);
  const val = (d: number) => (d < D.d0 || d > t ? undefined : D.n[d - D.d0]);
  const vs: number[] = []; for (let d = startMon; d <= end; d++) { const v = val(d); if (v != null) vs.push(v); }
  const sorted = [...vs].sort((x, y) => x - y); const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const th = [q(0.2), q(0.4), q(0.6), q(0.8), q(0.95)];
  const level = (v: number) => (v <= 0 ? 0 : th.filter((x) => v > x).length + 1);
  const CS = 12, G = 2, L = 26;
  const months: { x: number; l: string }[] = [];
  for (let w = 0; w < weeks; w++) { const d = new Date((startMon + w * 7) * DAY); if (d.getUTCDate() <= 7) months.push({ x: L + w * (CS + G), l: d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' }) }); }
  const c = a.meta.color;
  return (
    <div className="overflow-x-auto thin-scroll">
      <svg width={L + weeks * (CS + G)} height={7 * (CS + G) + 34} className="block">
        <defs><pattern id="hm-gap" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#0c1522" /><line x1="0" y1="0" x2="0" y2="4" stroke="#2a4062" strokeWidth="1.5" /></pattern></defs>
        {months.map((m, i) => <text key={i} x={m.x} y={10} fill="#64748b" fontSize={9}>{m.l}</text>)}
        {['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, i) => <text key={i} x={0} y={16 + i * (CS + G) + 9} fill="#475569" fontSize={9}>{l}</text>)}
        {Array.from({ length: weeks * 7 }, (_, k) => {
          const w = Math.floor(k / 7), r = k % 7, d = startMon + k; if (d > end) return null;
          const v = val(d); const lagged = d > t - D.lag;
          const lv = v == null ? -1 : level(v);
          return (
            <rect key={k} x={L + w * (CS + G)} y={16 + r * (CS + G)} width={CS} height={CS} rx={2}
              fill={v == null ? 'url(#hm-gap)' : lv === 0 ? '#0f1a2a' : c} fillOpacity={v == null || lv === 0 ? 1 : 0.15 + lv * 0.16}
              stroke={lagged ? '#ffc21a' : 'none'} strokeDasharray={lagged ? '2 2' : undefined} strokeWidth={1}>
              <title>{`${isoDay(d)} (UTC): ${v == null ? 'no data (gap)' : `${fmtN(v)} ${a.meta.unit}`}${lagged ? ' — reporting lag, likely incomplete' : ''}`}</title>
            </rect>
          );
        })}
        <g transform={`translate(${L}, ${16 + 7 * (CS + G) + 6})`}>
          <text x={0} y={9} fill="#64748b" fontSize={9}>less</text>
          {[0, 1, 2, 3, 4, 5, 6].map((l) => <rect key={l} x={26 + l * (CS + 2)} y={0} width={CS} height={CS} rx={2} fill={l === 0 ? '#0f1a2a' : c} fillOpacity={l === 0 ? 1 : 0.15 + l * 0.16} />)}
          <text x={26 + 7 * (CS + 2) + 2} y={9} fill="#64748b" fontSize={9}>more</text>
          <rect x={150} y={0} width={CS} height={CS} rx={2} fill="url(#hm-gap)" /><text x={166} y={9} fill="#64748b" fontSize={9}>no data</text>
          <rect x={214} y={0} width={CS} height={CS} rx={2} fill="none" stroke="#ffc21a" strokeDasharray="2 2" /><text x={230} y={9} fill="#64748b" fontSize={9}>reporting lag (excluded)</text>
          <text x={360} y={9} fill="#64748b" fontSize={9}>shading = quintiles of the year's daily values (max {fmtN(sorted[sorted.length - 1] ?? 0)})</text>
        </g>
      </svg>
    </div>
  );
}

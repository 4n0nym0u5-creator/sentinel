// Prints the Trends verdicts computed by the same engine the UI uses (node scripts/verdicts.mjs after bundling).
import { analyse, movers, STREAMS, CRYPTO_STREAMS, NO_FILTERS, RANGES, type RangeId } from '../src/lib/trends';
const base = process.env.BASE || 'http://localhost:4173';
const H: any = {};
for (const s of ['ransomware', 'kev', 'nvd', 'dshield', 'snapshots']) H[s] = await (await fetch(`${base}/api/history/${s}`)).json();
const cf = await (await fetch(`${base}/api/feed/crypto`)).json();
H.crypto = cf.data ? { ok: true, start: '2020-01-01', testFrom: '2021-01-01', data: cf.data.hacks, filter: { chain: '', group: '', cat: '' } } : { ok: false, error: cf.error };
for (const r of (process.argv[2] || '1y,3y').split(',') as RangeId[]) {
  console.log(`\n=== range ${r} (auto gran ${RANGES[r].gran}) ===`);
  for (const s of [...STREAMS, ...CRYPTO_STREAMS]) {
    const a = analyse(s.id, H, NO_FILTERS, r, 'auto');
    const f = (x: number | null) => (x == null ? 'n/a' : (x > 0 ? '+' : '') + x.toFixed(1) + '%');
    console.log(`${s.short.padEnd(16)} ${a.verdict.toUpperCase().padEnd(12)} MK p=${a.mk ? a.mk.p.toExponential(2) : '-'} n=${a.mk?.n ?? a.nTest} tau=${a.mk?.tau.toFixed(2) ?? '-'} sen=${a.mk?.slope.toFixed(2) ?? '-'} fitted=${f(a.changePct)} | prior ${a.period}d: ${a.vsPrior.available ? `${a.vsPrior.cur.toFixed(0)} vs ${a.vsPrior.prev.toFixed(0)} ${f(a.vsPrior.pct)} p=${a.vsPrior.p?.toFixed(3)}` : 'n/a'} | YoY: ${a.vsYear.available ? `${f(a.vsYear.pct)} p=${a.vsYear.p?.toFixed(3)}` : 'n/a'} | sev ${a.sevVerdict}${a.sevMk ? ` p=${a.sevMk.p.toFixed(3)}` : ''}${a.critShare ? ` crit ${(a.critShare.prev * 100).toFixed(1)}→${(a.critShare.cur * 100).toFixed(1)}%` : ''} | anomalies ${a.anomalies} | from ${a.coverage.from} gaps ${a.coverage.gaps}`);
  }
}
const m = movers(H, NO_FILTERS, 90);
for (const [k, v] of Object.entries(m.dims)) console.log(`\n${k}: ` + v.slice(0, 4).map((x) => `${x.label} ${x.prev}→${x.cur} (p=${x.p.toFixed(3)})`).join('; '));
console.log(m.notes.join('\n'));

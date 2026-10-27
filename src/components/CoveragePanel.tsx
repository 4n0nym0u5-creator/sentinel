import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Radar } from 'lucide-react';
import type { Ev, FeedState } from '../lib/types';
import { Panel, Offline } from './ui';
import { cname, COUNTRIES } from '../lib/countries';

const DAY = 86400_000;
const REG_ORDER = ['Global', 'Oceania', 'Asia', 'Europe', 'Americas', 'Middle East', 'Africa'];
const regionOf = (cc: string) => { const c = COUNTRIES[cc]; if (!c) return cc === 'EU' ? 'Europe' : 'Global'; if (c.s === 'Western Asia' || cc === 'EG') return 'Middle East'; return c.r; };

/** Per-country news coverage: which sources are based there (live / total), how many items they produced in the last
 *  7 days, and how many items (from any source) were geotagged to the country. Gaps are shown, not hidden. */
export default function CoveragePanel({ feed, events, now, onCountry, means }: { feed: FeedState; events: Ev[]; now: number; onCountry: (cc: string) => void; means?: ReactNode }) {
  const [reg, setReg] = useState('All');
  const rows = useMemo(() => {
    const items: any[] = feed.data?.items || [];
    const wk = now - 7 * DAY;
    const bySrc = new Map<string, number>();
    for (const it of items) if (Date.parse(it.published) >= wk) bySrc.set(it.source, (bySrc.get(it.source) || 0) + 1);
    const geo = new Map<string, number>();
    for (const e of events) if (e.type === 'news' && e.time >= wk) for (const c of e.raw.countries || []) geo.set(c, (geo.get(c) || 0) + 1);
    const M = new Map<string, { cc: string; region: string; srcs: { name: string; ok: boolean; n: number; kind?: string; lang?: string }[]; dropped: { name: string; why: string }[] }>();
    const row = (cc: string, region?: string) => { if (!M.has(cc)) M.set(cc, { cc, region: region || regionOf(cc), srcs: [], dropped: [] }); return M.get(cc)!; };
    for (const s of feed.sources) row(s.cc || `*${s.region || 'Global'}`, s.cc ? (s.region === 'Global' ? regionOf(s.cc) : s.region) : s.region).srcs.push({ name: s.name, ok: s.ok, n: bySrc.get(s.name) || 0, kind: s.kind, lang: s.lang });
    for (const d of feed.data?.dropped || []) row(d.cc || `*${d.region}`, d.region).dropped.push(d);
    [...geo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([cc]) => row(cc));
    return [...M.values()].map((r) => ({ ...r, live: r.srcs.filter((s) => s.ok).length, own: r.srcs.reduce((a, s) => a + s.n, 0), geo: r.cc.startsWith('*') ? null : geo.get(r.cc) || 0 }))
      .sort((a, b) => REG_ORDER.indexOf(a.region) - REG_ORDER.indexOf(b.region) || (b.geo ?? 0) + b.own - ((a.geo ?? 0) + a.own));
  }, [feed, events, now]);
  const regs = useMemo(() => REG_ORDER.map((r) => { const rs = rows.filter((x) => x.region === r); return { r, live: rs.reduce((a, x) => a + x.live, 0), tot: rs.reduce((a, x) => a + x.srcs.length, 0), geo: rs.reduce((a, x) => a + (x.geo || 0), 0) }; }), [rows]);
  const list = reg === 'All' ? rows : rows.filter((r) => r.region === reg);
  return (
    <Panel info="geoCoverage" means={means} title="News coverage by country" icon={<Radar size={13} className="text-emerald-400" />} feeds={[feed]} bodyClass="flex min-h-0 flex-col">
      {!feed.data ? <Offline f={feed} what="news feeds" /> : (<>
        <div className="flex flex-wrap gap-1 border-b border-ink-700 px-3 py-1.5">
          <button onClick={() => setReg('All')} className={`chip ${reg === 'All' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-ink-800 text-slate-400'}`}>All</button>
          {regs.map((g) => <button key={g.r} onClick={() => setReg(g.r)} title={`${g.live}/${g.tot} sources live · ${g.geo} items geotagged in 7 days`} className={`chip ${reg === g.r ? 'bg-emerald-500/20 text-emerald-300' : 'bg-ink-800 text-slate-400'}`}>{g.r} <span className="mono">{g.live}/{g.tot}</span></button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto thin-scroll">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-ink-900 text-[9.5px] uppercase tracking-wider text-slate-500"><tr>
              <th className="px-3 py-1 text-left">Country</th><th className="px-1 text-right" title="Sources based in this country: live / total">Sources</th>
              <th className="px-1 text-right" title="Items published by those sources in the last 7 days">Their items 7d</th><th className="px-1 text-right" title="Incidents (from any source) geotagged to this country in the last 7 days">Geotagged 7d</th><th className="px-3 text-left">Sources (● live ○ offline ✕ unavailable)</th></tr></thead>
            <tbody className="divide-y divide-ink-800">
              {list.map((r) => {
                const gap = r.live === 0 || r.geo === 0;
                const name = r.cc.startsWith('*') ? `${r.cc.slice(1)} (multi-country)` : r.cc === 'EU' ? 'European Union' : cname(r.cc);
                return (
                  <tr key={r.cc} className={gap ? 'bg-amber-500/5' : ''}>
                    <td className="px-3 py-1">{r.cc.startsWith('*') || r.cc === 'EU' ? <span className="text-slate-300">{name}</span> : <button className="text-slate-200 hover:text-cyan-glow" onClick={() => onCountry(r.cc)}>{COUNTRIES[r.cc]?.f} {name}</button>}</td>
                    <td className={`mono px-1 text-right ${r.live === 0 ? 'text-amber-400' : 'text-slate-300'}`}>{r.live}/{r.srcs.length}</td>
                    <td className="mono px-1 text-right text-slate-300">{r.srcs.length ? r.own : '—'}</td>
                    <td className={`mono px-1 text-right ${r.geo === 0 ? 'text-amber-400' : 'text-slate-300'}`}>{r.geo ?? '—'}</td>
                    <td className="px-3 py-1 text-[10.5px] text-slate-400">
                      {r.srcs.map((s) => <span key={s.name} className="mr-2 whitespace-nowrap" title={`${s.kind === 'cert' ? 'National CERT / agency' : 'News outlet'}${s.lang ? ` · in ${s.lang.toUpperCase()}` : ''} · ${s.n} items in 7 d`}><span className={s.ok ? 'text-emerald-400' : 'text-sev-critical'}>{s.ok ? '●' : '○'}</span> {s.name}</span>)}
                      {r.dropped.map((d) => <span key={d.name} className="mr-2 whitespace-nowrap text-slate-500" title={d.why}>✕ {d.name}</span>)}
                      {!r.srcs.length && !r.dropped.length && <span className="text-slate-500">no local source — seen via other outlets only</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}
    </Panel>
  );
}

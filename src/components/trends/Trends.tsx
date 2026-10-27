import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CalendarDays, Filter, Gauge, Info, LineChart as LineIcon, ListOrdered, Sigma, TrendingUp } from 'lucide-react';
import { Panel } from '../ui';
import { ExecSummary, at } from '../explain';
import { trendsSummary, trendsMeans } from '../../lib/summaries';
import { useHistory } from '../../lib/useHistory';
import { analyse, movers, META, NO_FILTERS, RANGES, STREAMS, prettyVendor, type Filters, type Gran, type RangeId, type StreamId } from '../../lib/trends';
import { REGIONS, cname, type Region } from '../../lib/countries';
import VerdictCard from './VerdictCard';
import MainChart from './MainChart';
import SeverityChart from './SeverityChart';
import Heatmap from './Heatmap';
import Movers from './Movers';
import Coverage from './Coverage';

const sel = 'rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-slate-200 max-w-[170px]';
function topBy(codes: number[] | undefined, list: string[] | undefined, n = 400) {
  if (!codes || !list) return [] as string[];
  const c = new Array(list.length).fill(0); for (const x of codes) c[x]++;
  return list.map((k, i) => [k, c[i]] as const).filter(([k, v]) => k && k !== 'Unknown' && v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export default function Trends() {
  const { H, loading } = useHistory();
  const [stream, setStream] = useState<StreamId>('ransomware');
  const [range, setRange] = useState<RangeId>('1y');
  const [gran, setGran] = useState<Gran | 'auto'>('auto');
  const [F, setF] = useState<Filters>(NO_FILTERS);
  const set = (k: keyof Filters, v: string) => setF((f) => ({ ...f, [k]: v, ...(k === 'vendor' ? { product: '' } : {}), ...(k === 'region' ? { country: '' } : {}) }));

  const rw = H.ransomware?.data, kev = H.kev?.data, nvd = H.nvd?.data;
  const opts = useMemo(() => ({
    countries: topBy(rw?.c, rw?.countries).filter((c) => c.length === 2),
    sectors: topBy(rw?.s, rw?.sectors),
    groups: topBy(rw?.g, rw?.groups, 250),
    vendors: [...new Set([...topBy(kev?.v, kev?.vendors, 200), ...topBy(nvd?.v, nvd?.vendors, 200)])],
  }), [rw, kev, nvd]);
  const products = useMemo(() => {
    if (!F.vendor) return [];
    const s = new Map<string, number>();
    for (const D of [kev, nvd]) if (D) { const vi = D.vendors.indexOf(F.vendor); for (let i = 0; i < D.d.length; i++) if (D.v[i] === vi) s.set(D.products[D.p[i]], (s.get(D.products[D.p[i]]) || 0) + 1); }
    return [...s].filter(([k]) => k).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [F.vendor, kev, nvd]);

  const all = useMemo(() => Object.fromEntries(STREAMS.map((s) => [s.id, analyse(s.id, H, F, range, gran)])) as Record<StreamId, ReturnType<typeof analyse>>, [H, F, range, gran]);
  const A = all[stream];
  const mv = useMemo(() => movers(H, F, RANGES[range].period), [H, F, range]);
  const filtersOn = JSON.stringify(F) !== JSON.stringify(NO_FILTERS);
  const ts = useMemo(() => trendsSummary(all, mv, range, filtersOn), [all, mv, range, filtersOn]);
  const tm = useMemo(() => trendsMeans(A, mv), [A, mv]);
  const applied = (k: keyof Filters) => META[stream].filters.includes(k);
  const ignored = (Object.keys(F) as (keyof Filters)[]).filter((k) => k !== 'region' ? F[k] && !applied(k) : F.region !== 'All' && !applied(k));

  return (
    <div className="flex flex-col gap-2" data-trends-loading={loading.size}>
      {/* controls */}
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-1.5">
        <Filter size={13} className="text-slate-500" />
        <div className="flex overflow-hidden rounded-md border border-ink-600">{(Object.keys(RANGES) as RangeId[]).map((r) => <button key={r} onClick={() => setRange(r)} className={clsx('px-2.5 py-1 text-[11px] font-medium', range === r ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-slate-400 hover:text-white')}>{r}</button>)}</div>
        <div className="flex overflow-hidden rounded-md border border-ink-600">{(['auto', 'day', 'week', 'month'] as const).map((g) => <button key={g} onClick={() => setGran(g)} className={clsx('px-2 py-1 text-[11px] font-medium capitalize', gran === g ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white')}>{g === 'auto' ? `Auto (${RANGES[range].gran})` : g}</button>)}</div>
        <span className="mx-1 h-4 w-px bg-ink-600" />
        <select className={sel} value={F.region} onChange={(e) => set('region', e.target.value as Region)} title="Region (ransomware victims)">{REGIONS.map((r) => <option key={r} value={r}>{r === 'All' ? 'All regions' : r}</option>)}</select>
        <select className={sel} value={F.country} onChange={(e) => set('country', e.target.value)} title="Victim country (ransomware)"><option value="">All countries</option>{opts.countries.map((c) => <option key={c} value={c}>{cname(c)}</option>)}</select>
        <select className={sel} value={F.sector} onChange={(e) => set('sector', e.target.value)} title="Victim sector (ransomware)"><option value="">All sectors</option>{opts.sectors.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={F.group} onChange={(e) => set('group', e.target.value)} title="Ransomware group"><option value="">All groups</option>{opts.groups.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={F.vendor} onChange={(e) => set('vendor', e.target.value)} title="Vendor (KEV & NVD)"><option value="">All vendors</option>{opts.vendors.map((c) => <option key={c} value={c}>{prettyVendor(c)}</option>)}</select>
        {F.vendor && <select className={sel} value={F.product} onChange={(e) => set('product', e.target.value)} title="Product (KEV & NVD)"><option value="">All products</option>{products.map((c) => <option key={c} value={c}>{prettyVendor(c)}</option>)}</select>}
        {filtersOn && <button className="btn !py-1 text-[11px]" onClick={() => setF(NO_FILTERS)}>Reset</button>}
        <span className="ml-auto text-[10px] text-slate-500">Buckets by UTC day · {RANGES[range].label} · compare window {RANGES[range].period}d</span>
      </div>

      <ExecSummary id="trends" title="Trends — executive summary" s={ts} accent="#22e3ff" />

      {/* verdict cards */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {STREAMS.map((s) => <VerdictCard key={s.id} a={all[s.id]} selected={stream === s.id} onClick={() => setStream(s.id)} filtered={filtersOn && s.filters.some((k) => (k === 'region' ? F.region !== 'All' : !!F[k]))} />)}
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <Panel info="trendsMain" means={tm.main} className="xl:col-span-8" title={<>{at(A.meta.label)} <span className="font-normal normal-case tracking-normal text-slate-500">· {A.meta.unit} per {A.gran}</span></>} icon={<LineIcon size={13} style={{ color: A.meta.color }} />}
          right={ignored.length ? <span className="chip border border-sev-medium/40 text-sev-medium" title="These filters do not apply to this stream">filter n/a: {ignored.join(', ')}</span> : null}>
          <div className="h-[380px] p-2"><MainChart a={A} /></div>
        </Panel>
        <Panel info="trendsStats" className="xl:col-span-4" title="Is it getting worse? — the statistics" icon={<Sigma size={13} className="text-cyan-glow" />}>
          <div className="space-y-2 p-3 text-[12px] leading-relaxed text-slate-300">
            {A.sentence.map((s, i) => <p key={i} className={clsx(i === 0 && 'text-[13px] text-white')}>{i === 0 ? <Strong s={s} v={A.verdict} /> : at(s)}</p>)}
            <p className="border-t border-ink-600/60 pt-2 text-[10.5px] text-slate-500">Method: Mann–Kendall trend test on complete {A.gran}ly periods (ties + autocorrelation corrected, α = 0.05) with Sen's slope; a "trend" also needs ≥ 5% fitted change. Period comparisons use Mann–Whitney U on daily values. Hatched bars = incomplete or reporting-lag periods (excluded). Anomalies: &gt; 3σ above trailing baseline.</p>
          </div>
        </Panel>
        <Panel info="sevmix" means={tm.sev} className="xl:col-span-5" title="Severity mix over time" icon={<Gauge size={13} className="text-sev-high" />}>
          <div className="h-[300px] p-2"><SeverityChart a={A} /></div>
        </Panel>
        <Panel info="heatmap" className="xl:col-span-7" title={<>{at('Calendar heatmap')} <span className="font-normal normal-case tracking-normal text-slate-500">· {A.meta.short} · last 12 months (daily)</span></>} icon={<CalendarDays size={13} className="text-cyan-glow" />}>
          <div className="p-3"><Heatmap a={A} /></div>
        </Panel>
        <Panel info="movers" means={tm.movers} className="xl:col-span-7" title={<>{at('Top movers')} <span className="font-normal normal-case tracking-normal text-slate-500">· {mv.window}</span></>} icon={<ListOrdered size={13} className="text-sev-critical" />}>
          <Movers m={mv} onPick={(dim, key) => {
            if (dim.startsWith('Countries')) set('country', key); else if (dim.startsWith('Sectors')) set('sector', key); else if (dim.startsWith('Ransomware')) set('group', key); else set('vendor', key);
          }} />
        </Panel>
        <Panel info="coverage" className="xl:col-span-5" title="History coverage & caveats" icon={<Info size={13} className="text-slate-400" />}>
          <Coverage H={H} all={all} />
        </Panel>
      </div>
      <div className="flex items-start gap-2 rounded-md border border-sev-medium/30 bg-sev-medium/5 px-3 py-2 text-[11px] text-slate-400">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-sev-medium" />
        <span><b className="text-slate-200">Read with care.</b> {at("Ransomware numbers are leak-site claims (unverified, posted days to weeks after intrusion) and tracker coverage has grown over time. The most recent days are always under-reported and are flagged and excluded from tests. NVD CVE counts are shaped by NVD's analysis backlog (recent CVEs are often not yet scored). Nothing here is estimated or interpolated: uncovered periods are shown as gaps.")}</span>
        <TrendingUp size={14} className="ml-auto mt-0.5 shrink-0 text-slate-600" />
      </div>
    </div>
  );
}
function Strong({ s, v }: { s: string; v: string }) {
  const m = s.match(/^(RISING|FALLING|STABLE):(.*)$/s);
  if (!m) return <>{s}</>;
  const c = v === 'rising' ? '#ff2d55' : v === 'falling' ? '#22c55e' : '#94a3b8';
  return <><b style={{ color: c }}>{m[1]}</b>{m[2]}</>;
}

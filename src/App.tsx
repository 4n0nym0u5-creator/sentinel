import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search, Volume2, VolumeX, Maximize, Minimize, RefreshCw, Activity, Globe2, Filter, X, Radio, TrendingUp, Bitcoin, Power } from 'lucide-react';
const Trends = lazy(() => import('./components/trends/Trends'));
const Crypto = lazy(() => import('./components/crypto/Crypto'));
import { useFeeds } from './lib/useFeeds';
import { buildEvents, computeThreat } from './lib/model';
import type { EType, Ev, Sev } from './lib/types';
import { REGIONS, inRegion, cname, type Region } from './lib/countries';
import { SEV_RANK, SEV_COLOR } from './lib/sev';
import { alertTone } from './lib/sound';
import { useCollector } from './lib/useCollector';
import { ago } from './lib/format';
import ThreatGauge from './components/ThreatGauge';
import Kpis from './components/Kpis';
import WorldMap, { aggregate } from './components/WorldMap';
import Ticker from './components/Ticker';
import Marquee from './components/Marquee';
import RansomwarePanel from './components/RansomwarePanel';
import VulnPanel from './components/VulnPanel';
import InfraPanel from './components/InfraPanel';
import NewsPanel from './components/NewsPanel';
import CoveragePanel from './components/CoveragePanel';
import { DetailDrawer, CountryDrawer, FeedHealth } from './components/Drawers';
import { Panel, STATUS_COLOR } from './components/ui';
import { ExplainControls, ExecSummary, at } from './components/explain';
import { liveSummary, liveMeans } from './lib/summaries';
import { TYPE_META } from './components/icons';

const WINDOWS = { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 } as const;
type Win = keyof typeof WINDOWS;
const TYPES: EType[] = ['ransomware', 'vuln', 'c2', 'attack', 'news', 'ioc'];
const FEED_OF = (e: Ev) => (e.type === 'vuln' ? e.raw.kind : e.type === 'attack' ? 'dshield' : e.type === 'ioc' ? 'threatfox' : e.type);

type Tab = 'live' | 'trends' | 'crypto';
function useHashTab() { const get = (): Tab => (location.hash.startsWith('#/trends') ? 'trends' : location.hash.startsWith('#/crypto') ? 'crypto' : 'live'); const [t, setT] = useState(get); useEffect(() => { const f = () => setT(get()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []); return [t, (v: Tab) => { location.hash = v === 'live' ? '#/' : `#/${v}`; }] as const; }
function useNow(ms = 1000) { const [n, setN] = useState(Date.now()); useEffect(() => { const i = setInterval(() => setN(Date.now()), ms); return () => clearInterval(i); }, [ms]); return n; }

export default function App() {
  const { feeds, refreshAll } = useFeeds();
  const now = useNow(1000);
  const { collector, reloadCollector } = useCollector(60);
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = () => { refreshAll(); reloadCollector(); setRefreshing(true); window.setTimeout(() => setRefreshing(false), 1500); };
  const collAge = collector.lastRun ? now - collector.lastRun : Infinity;
  const collColor = collAge < 5 * 60e3 ? '#22c55e' : collAge < 30 * 60e3 ? '#ffb020' : '#ff2d55';
  const [win, setWin] = useState<Win>('7d');
  const [region, setRegion] = useState<Region>('All');
  const [minSev, setMinSev] = useState<Sev>('low');
  const [types, setTypes] = useState<Set<EType>>(new Set(TYPES));
  const [q, setQ] = useState('');
  const [sound, setSound] = useState(false);
  const [fs, setFs] = useState(false);
  const [sel, setSel] = useState<Ev | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [health, setHealth] = useState(false);
  const [flash, setFlash] = useState<Ev | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useHashTab();

  const all = useMemo(() => buildEvents(feeds), [feeds]);

  // ---- new-item detection (only after a feed's first successful load) ----
  const seen = useRef(new Set<string>());
  const primed = useRef(new Set<string>());
  const [fresh, setFresh] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const newly: Ev[] = [];
    for (const e of all) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      if (primed.current.has(FEED_OF(e))) newly.push(e);
    }
    Object.values(feeds).forEach((f) => f.data && primed.current.add(f.id));
    if (newly.length) {
      setFresh((m) => { const n = new Map(m); newly.forEach((e) => n.set(e.id, Date.now())); return n; });
      const crit = newly.filter((e) => e.sev === 'critical');
      if (crit.length) { setFlash(crit[0]); if (sound) alertTone(); setTimeout(() => setFlash(null), 6000); }
    }
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const i = setInterval(() => setFresh((m) => { const n = new Map([...m].filter(([, t]) => Date.now() - t < 10 * 60e3)); return n.size === m.size ? m : n; }), 30e3); return () => clearInterval(i); }, []);
  const freshSet = useMemo(() => new Set(fresh.keys()), [fresh]);

  // ---- filtering ----
  const events = useMemo(() => {
    const t0 = Date.now() - WINDOWS[win];
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (e.time < t0 || !types.has(e.type) || SEV_RANK[e.sev] < SEV_RANK[minSev]) return false;
      if (region !== 'All') {
        if (e.type === 'news') { if (!(e.raw.countries || []).some((c: string) => inRegion(c, region))) return false; }
        else if (e.type !== 'vuln' && e.type !== 'ioc' && !inRegion(e.country, region)) return false;
      }
      if (needle && !`${e.title} ${e.subtitle} ${e.source} ${e.country || ''} ${cname(e.country)} ${(e.tags || []).join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, win, types, minSev, region, q]);
  const agg = useMemo(() => aggregate(events), [events]);
  const threat = useMemo(() => computeThreat(feeds, all), [feeds, all]);
  const nowMin = Math.floor(Date.now() / 60e3);
  const ls = useMemo(() => liveSummary(feeds, threat), [feeds, threat, nowMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const lm = useMemo(() => liveMeans(feeds), [feeds, nowMin]); // eslint-disable-line react-hooks/exhaustive-deps
  const feedList = Object.values(feeds);
  const live = feedList.filter((f) => f.status === 'live').length;

  // ---- keyboard & fullscreen ----
  const toggleFs = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }, []);
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { setSel(null); setCountry(null); setHealth(false); }
      if ((ev.target as HTMLElement).tagName === 'INPUT') return;
      if (ev.key === '/') { ev.preventDefault(); searchRef.current?.focus(); }
      if (ev.key === 'f') toggleFs();
    };
    document.addEventListener('fullscreenchange', onFs); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey); };
  }, [toggleFs]);
  const focusType = (t: string) => { if (t === 'critical') { setMinSev('critical'); return; } setTypes(new Set([t as EType])); };
  const filtersActive = win !== '7d' || region !== 'All' || minSev !== 'low' || types.size !== TYPES.length || q;
  const resetFilters = () => { setWin('7d'); setRegion('All'); setMinSev('low'); setTypes(new Set(TYPES)); setQ(''); };

  const utc = new Date(now).toISOString().slice(11, 19);
  const local = new Date(now).toLocaleTimeString(undefined, { hour12: false });
  const tz = Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date(now)).find((p) => p.type === 'timeZoneName')?.value || 'LOCAL';

  return (
    <div className="scan-bg flex min-h-screen flex-col gap-2 p-2 2xl:p-3">
      {/* flash overlay for new criticals */}
      {flash && <div key={flash.id} className="pointer-events-none fixed inset-0 z-50 animate-flash" style={{ boxShadow: 'inset 0 0 120px 30px rgba(255,45,85,.65)' }} />}
      {flash && (
        <button onClick={() => { setSel(flash); setFlash(null); }} className="fixed left-1/2 top-16 z-50 flex -translate-x-1/2 animate-slidein items-center gap-3 rounded-lg border border-sev-critical bg-ink-900/95 px-4 py-2 shadow-[0_0_30px_rgba(255,45,85,.5)]">
          <span className="chip animate-pulsered bg-sev-critical text-white">New critical</span>
          <span className="max-w-[520px] truncate text-sm text-white">{flash.title}</span><span className="text-xs text-slate-400">{flash.source}</span>
        </button>
      )}

      {/* ---------- header ---------- */}
      <header className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border border-cyan-glow/50" />
            <div className="absolute inset-1.5 rounded-full border border-cyan-glow/25" />
            <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(34,227,255,.55), transparent 25%)', animation: 'sweep 3s linear infinite' }} />
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sev-critical shadow-[0_0_8px_#ff2d55]" />
          </div>
          <div>
            <div className="text-[17px] font-bold tracking-[.22em] text-white glow-text">SENTINEL</div>
            <div className="text-[10px] uppercase tracking-[.2em] text-slate-400">Global cyber situation monitor</div>
          </div>
        </div>
        <nav className="flex overflow-hidden rounded-md border border-ink-600" aria-label="View">
          <button onClick={() => setTab('live')} data-tab="live" className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider', tab === 'live' ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-slate-400 hover:text-white')}><Radio size={13} />Live</button>
          <button onClick={() => setTab('trends')} data-tab="trends" className={clsx('flex items-center gap-1.5 border-l border-ink-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider', tab === 'trends' ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-slate-400 hover:text-white')}><TrendingUp size={13} />Trends</button>
          <button onClick={() => setTab('crypto')} data-tab="crypto" className={clsx('flex items-center gap-1.5 border-l border-ink-600 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider', tab === 'crypto' ? 'bg-[#f7931a]/15 text-[#f7931a]' : 'text-slate-400 hover:text-white')}><Bitcoin size={13} />Crypto</button>
        </nav>
        <ThreatGauge t={threat} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="mono text-right leading-tight"><div className="text-[15px] text-white">{utc}<span className="ml-1 text-[10px] text-slate-500">UTC</span></div><div className="text-[11px] text-slate-400">{local} <span className="text-slate-500">{tz}</span></div></div>
          <button className="btn" onClick={() => setHealth(true)} title="Feed health" data-loading={feedList.filter((f) => f.status === 'loading').length}>
            <Activity size={14} /> <span className="mono">{live}/{feedList.length}</span> feeds live
            <span className="flex gap-0.5">{feedList.map((f) => <span key={f.id} className={clsx('h-2 w-1.5 rounded-sm', f.status === 'loading' && 'blink')} style={{ background: STATUS_COLOR[f.status] }} />)}</span>
          </button>
          {collector.available && <button className="btn" onClick={() => setHealth(true)} title={`Server collector (Cloudflare cron, every minute) last ran ${collector.lastRun ? new Date(collector.lastRun).toLocaleString() : 'never'}${collector.failing ? ` · ${collector.failing} source task(s) failing` : ''}`}><span className="h-2 w-2 rounded-full" style={{ background: collColor, boxShadow: `0 0 6px ${collColor}` }} /><span className="mono text-[10.5px]">collected {collector.lastRun ? ago(collector.lastRun, now) : 'never'}</span></button>}
          <ExplainControls />
          <button className="btn" onClick={doRefresh} title={collector.available ? 'Re-read the latest collected data now. Upstream sources are re-fetched by the server collector on its schedule (15 min – 6 h per source).' : 'Force refresh all feeds'}><RefreshCw size={14} className={clsx(refreshing && 'animate-spin')} /></button>
          <button className={clsx('btn', sound && 'btn-on')} onClick={() => { setSound((s) => !s); if (!sound) alertTone(); }} title="Audible alert for new critical items (off by default)">{sound ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
          {!/^(localhost|127\.|\[::1\])/.test(location.hostname) && <a className="btn" href="/__logout" title="Sign out of SENTINEL (clears the 7-day session cookie)"><Power size={14} /></a>}
          <button className="btn" onClick={toggleFs} title="Fullscreen (f)">{fs ? <Minimize size={14} /> : <Maximize size={14} />}</button>
        </div>
      </header>

      {collector.available && collAge > 10 * 60e3 && (
        <div role="status" className="flex items-center gap-2 rounded border border-sev-high/40 bg-sev-high/10 px-3 py-1.5 text-[11.5px] text-amber-200">
          <span className="h-2 w-2 rounded-full" style={{ background: collColor }} />
          <b>Collector delayed.</b> The server-side collector last ran {collector.lastRun ? <>{ago(collector.lastRun, now)} ({new Date(collector.lastRun).toLocaleString()})</> : 'never'}. Feeds show the last collected copy; refreshing re-reads it but cannot fetch newer upstream data until the collector runs again.
        </div>
      )}
      {tab === 'trends' ? <Suspense fallback={<div className="p-10 text-center text-xs text-slate-500">Loading trends…</div>}><Trends /></Suspense>
      : tab === 'crypto' ? <Suspense fallback={<div className="p-10 text-center text-xs text-slate-500">Loading crypto view…</div>}><Crypto feeds={feeds} now={now} /></Suspense> : <>
      {/* ---------- filters ---------- */}
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-1.5">
        <Filter size={13} className="text-slate-500" />
        <div className="flex overflow-hidden rounded-md border border-ink-600">{(Object.keys(WINDOWS) as Win[]).map((w) => <button key={w} onClick={() => setWin(w)} className={clsx('px-2.5 py-1 text-[11px] font-medium', win === w ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-slate-400 hover:text-white')}>{w}</button>)}</div>
        <div className="flex items-center gap-1"><Globe2 size={13} className="text-slate-500" /><select value={region} onChange={(e) => setRegion(e.target.value as Region)} className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-slate-200">{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="flex overflow-hidden rounded-md border border-ink-600">{(['low', 'medium', 'high', 'critical'] as Sev[]).map((s) => <button key={s} onClick={() => setMinSev(s)} className={clsx('px-2 py-1 text-[11px] font-medium capitalize', minSev === s ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white')} style={minSev === s ? { color: SEV_COLOR[s] } : undefined}>{s}{s !== 'critical' && '+'}</button>)}</div>
        <div className="flex flex-wrap gap-1">{TYPES.map((t) => { const M = TYPE_META[t]; const on = types.has(t); return (
          <button key={t} onClick={() => setTypes((s) => { const n = new Set(s); on ? n.delete(t) : n.add(t); return n.size ? n : new Set(TYPES); })} onDoubleClick={() => setTypes(new Set([t]))} title="Click to toggle · double-click to isolate"
            className={clsx('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]', on ? 'border-ink-500 bg-ink-800 text-slate-200' : 'border-ink-700 text-slate-600 line-through')}><M.Icon size={12} style={{ color: on ? M.color : undefined }} />{M.label}</button>
        ); })}</div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search CVE, group, vendor, country, IP…  ( / )" className="w-72 rounded-md border border-ink-600 bg-ink-850 py-1 pl-7 pr-7 text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-cyan-glow/60 focus:outline-none" />
          {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={12} /></button>}
        </div>
        {filtersActive && <button className="btn !py-1 text-[11px]" onClick={resetFilters}>Reset</button>}
      </div>

      <ExecSummary id="live" title="Live — executive summary" s={ls} accent="#22e3ff" />
      <Kpis feeds={feeds} events={events} windowMs={WINDOWS[win]} onType={focusType} />

      {/* ---------- map + stream ---------- */}
      <div className="grid min-h-0 grid-cols-1 gap-2 xl:grid-cols-12">
        <Panel info="map" means={lm.map} className="xl:col-span-8 2xl:col-span-9" title={<>{at('Global threat map')} {region !== 'All' && <span className="text-cyan-glow">· {region}</span>}</>} icon={<Globe2 size={13} className="text-cyan-glow" />}
          right={<span className="text-[10px] text-slate-500">scroll to zoom · drag to pan · click a country</span>}>
          <WorldMap events={events} agg={agg} fresh={freshSet} selected={country} onSelect={setCountry} height="min(58vh, 640px)" />
        </Panel>
        <div className="relative h-[min(58vh,640px)] min-h-[360px] xl:col-span-4 xl:h-auto 2xl:col-span-3">
          <div className="h-full xl:absolute xl:inset-0"><Ticker events={events} fresh={freshSet} onPick={setSel} feeds={feedList} now={now} /></div>
        </div>
      </div>

      {/* ---------- analysis panels ---------- */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-4">
        <div className="h-[400px]"><RansomwarePanel means={lm.ransomware} feed={feeds.ransomware} events={events} onCountry={setCountry} onPick={setSel} onGroup={(g) => setQ(g)} /></div>
        <div className="h-[400px]"><VulnPanel means={lm.vulns} feeds={feeds} events={events} onPick={setSel} now={now} /></div>
        <div className="h-[400px]"><InfraPanel means={lm.infra} feeds={feeds} events={events} onPick={setSel} onCountry={setCountry} /></div>
        <div className="h-[400px]"><NewsPanel means={lm.news} feed={feeds.news} events={events} onPick={setSel} now={now} /></div>
      </div>

      <div className="h-[420px]"><CoveragePanel means={lm.geoCoverage} feed={feeds.news} events={events} now={now} onCountry={setCountry} /></div>

      <Marquee events={events} onPick={setSel} />
      </>}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-slate-500">
        {feedList.map((f) => <span key={f.id} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[f.status] }} />{f.label} <span className="mono">{f.fetchedAt ? ago(f.fetchedAt, now) : f.status}</span></span>)}
        <span className="ml-auto">Public sources only · no data is synthesised · severities are rule-based (see each item) · times in UTC and {tz}</span>
      </footer>

      {sel && <DetailDrawer e={sel} onClose={() => setSel(null)} onCountry={(cc) => { setSel(null); setCountry(cc); }} />}
      {country && !sel && <CountryDrawer cc={country} events={events} agg={agg[country]} onClose={() => setCountry(null)} onPick={setSel} />}
      {health && <FeedHealth feeds={feedList} onClose={() => setHealth(false)} onRefresh={doRefresh} now={now} collector={collector} />}
    </div>
  );
}

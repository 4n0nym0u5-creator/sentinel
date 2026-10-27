import { Fragment, useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Bitcoin, Bug, ExternalLink, Layers, Link2, ListOrdered, Newspaper, Sigma, Skull, Swords, TrendingUp, X, Zap } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { FeedState, Sev } from '../../lib/types';
import { Bar, CvssBadge, Offline, Panel, SevBadge } from '../ui';
import { SEV_COLOR } from '../../lib/sev';
import { ago } from '../../lib/format';
import { analyse, CRYPTO_STREAMS, RANGES, type Gran, type RangeId, type StreamId, NO_FILTERS, fmtPct } from '../../lib/trends';
import { poissonTest, fmtP } from '../../lib/stats';
import VerdictCard from '../trends/VerdictCard';
import { ExecSummary, at } from '../explain';
import { cryptoSummary, cryptoMeans, type CryptoInputs } from '../../lib/summaries';
import MainChart, { TT } from '../trends/MainChart';
import SeverityChart from '../trends/SeverityChart';

const ORANGE = '#f7931a';
const DAY = 86400_000;
export const usd = (n: number | null | undefined, dp = 1) => (n == null ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(dp)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const sevOfUsd = (n: number | null): Sev => (n == null ? 'low' : n >= 100e6 ? 'critical' : n >= 10e6 ? 'high' : n >= 1e6 ? 'medium' : 'low');
const WINS = { '30d': 30, '90d': 90, ytd: -1, '1y': 365, all: 0 } as const;
type Win = keyof typeof WINS;
const winStart = (w: Win, now: number) => (w === 'all' ? 0 : w === 'ytd' ? Date.UTC(new Date(now).getUTCFullYear(), 0, 1) : now - WINS[w] * DAY);
const WIN_LABEL: Record<Win, string> = { '30d': 'last 30 days', '90d': 'last 90 days', ytd: 'year to date', '1y': 'last 12 months', all: 'all recorded history' };
const CAT_COLOR: Record<string, string> = { DeFi: '#22e3ff', 'CeFi (exchange)': '#ff2d55', Bridge: '#a78bfa', Wallet: '#ffc21a', 'Chain / L1': '#34d399', Token: '#3aa0ff', Other: '#64748b' };
const RW_CRYPTO = /\b(crypto\w*|bitcoin|blockchain|web3|defi|nft|coin(base)?|binance|token|wallet|exchange.*(crypto|bitcoin))\b/i;
const sel = 'rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-slate-200 max-w-[180px]';

interface Hack { id: string; t: number; day: string; name: string; cls: string; tech: string; group: string; cat: string; target: string; bridge: boolean; usd: number | null; returned: number | null; chains: string[]; lang: string | null; link: string; sev: Sev }
type Item = { id: string; kind: 'hack' | 'news' | 'vuln' | 'ransomware'; t: number; sev: Sev; title: string; sub: string; usd?: number | null; link?: string; raw: any; why: string };

export default function Crypto({ feeds, now }: { feeds: Record<string, FeedState>; now: number }) {
  const fc = feeds.crypto, fv = feeds.cryptovulns, fr = feeds.ransomware;
  const hacksAll: Hack[] = fc?.data?.hacks ?? [];
  const news: any[] = fc?.data?.news ?? [];
  const vulns: any[] = fv?.data?.items ?? [];
  const [win, setWin] = useState<Win>('ytd');
  const [chain, setChain] = useState(''); const [group, setGroup] = useState(''); const [cat, setCat] = useState('');
  const [stream, setStream] = useState<StreamId>('cryptousd');
  const [range, setRange] = useState<RangeId>('3y');
  const [gran, setGran] = useState<Gran | 'auto'>('auto');
  const [kinds, setKinds] = useState<Set<Item['kind']>>(new Set(['hack', 'news', 'vuln', 'ransomware']));
  const [open, setOpen] = useState<Item | null>(null);
  const filtered = !!(chain || group || cat);

  const hacks = useMemo(() => hacksAll.filter((h) => (!chain || h.chains.includes(chain)) && (!group || h.group === group) && (!cat || h.cat === cat)), [hacksAll, chain, group, cat]);
  const opts = useMemo(() => {
    const c = new Map<string, number>(), g = new Map<string, number>(), k = new Map<string, number>();
    for (const h of hacksAll) { h.chains.forEach((x) => c.set(x, (c.get(x) || 0) + 1)); g.set(h.group, (g.get(h.group) || 0) + 1); k.set(h.cat, (k.get(h.cat) || 0) + 1); }
    const s = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x);
    return { chains: s(c), groups: s(g), cats: s(k) };
  }, [hacksAll]);

  // ---- KPIs
  const k = useMemo(() => {
    const sum = (from: number, to = Infinity) => { let u = 0, n = 0, r = 0; for (const h of hacks) if (h.t >= from && h.t < to) { u += h.usd || 0; n++; r += h.returned || 0; } return { u, n, r }; };
    const ytd0 = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
    const ly0 = Date.UTC(new Date(now).getUTCFullYear() - 1, 0, 1), lyNow = now - 365 * DAY;
    const big = hacks.filter((h) => h.t >= ytd0).sort((a, b) => (b.usd || 0) - (a.usd || 0))[0];
    const d30 = sum(now - 30 * DAY), p30 = sum(now - 60 * DAY, now - 30 * DAY);
    return { d1: sum(now - DAY), d7: sum(now - 7 * DAY), d30, p30, ytd: sum(ytd0), lytd: sum(ly0, lyNow), big, pt: poissonTest(d30.n, p30.n) };
  }, [hacks, now]);
  const vul30 = vulns.filter((v) => Date.parse(v.date) >= now - 30 * DAY);

  // ---- breakdowns in window
  const w0 = winStart(win, now);
  const inWin = useMemo(() => hacks.filter((h) => h.t >= w0), [hacks, w0]);
  const byTech = useMemo(() => agg(inWin, (h) => [h.group]), [inWin]);
  const byCat = useMemo(() => agg(inWin, (h) => [h.cat]), [inWin]);
  const byChain = useMemo(() => agg(inWin, (h) => h.chains.length ? h.chains : ['Unknown']), [inWin]);
  const top10 = useMemo(() => [...inWin].sort((a, b) => (b.usd || 0) - (a.usd || 0)).slice(0, 10), [inWin]);
  const totWin = inWin.reduce((s, h) => s + (h.usd || 0), 0);

  // ---- merged live stream
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const h of hacks) if (h.t >= now - 120 * DAY) out.push({ id: h.id, kind: 'hack', t: h.t, sev: h.sev, title: `${h.name} — ${usd(h.usd)} lost`, sub: `${h.tech} · ${h.chains.join(', ') || 'chain n/a'} · ${h.cat}`, usd: h.usd, link: h.link, raw: h, why: `USD-loss tier (${usd(h.usd)} at time of hack)` });
    for (const n of news) if (n.published) out.push({ id: n.id, kind: 'news', t: Date.parse(n.published), sev: n.sev, title: n.title, sub: `${n.source}${n.kinds?.length ? ' · ' + n.kinds.join(', ') : ''}`, usd: n.usd, link: n.link, raw: n, why: n.sevReason });
    for (const v of vulns) out.push({ id: v.id, kind: 'vuln', t: Date.parse(v.date), sev: v.sev, title: `${v.id} · ${v.title}`, sub: `${v.src}${v.nvdTerm ? ` · keyword “${v.nvdTerm}”` : ''}${v.kev ? ' · in KEV' : ''}`, link: v.link, raw: v, why: v.sevReason });
    for (const r of fr?.data?.items ?? []) if (RW_CRYPTO.test(`${r.victim} ${r.desc} ${r.sector}`)) out.push({ id: 'rw|' + r.id, kind: 'ransomware', t: Date.parse(r.discovered), sev: 'high', title: `${r.victim} claimed by ${r.group}`, sub: `ransomware.live · ${r.sector} · ${r.country || '??'}`, link: 'https://www.ransomware.live', raw: r, why: 'ransomware leak-site claim against a crypto-related victim (keyword match, unverified)' });
    return out.filter((i) => Number.isFinite(i.t)).sort((a, b) => b.t - a.t);
  }, [hacks, news, vulns, fr?.data, now]);
  const shown = items.filter((i) => kinds.has(i.kind)).slice(0, 250);

  // ---- trends (same engine as the Trends tab)
  const H = useMemo(() => ({ crypto: !fc || fc.status === 'loading' && !fc.data ? undefined : fc.data ? { ok: true, start: '2020-01-01', testFrom: '2021-01-01', data: hacksAll, filter: { chain, group, cat } } : { ok: false, error: fc.error } }), [fc, hacksAll, chain, group, cat]);
  const A = useMemo(() => Object.fromEntries(CRYPTO_STREAMS.map((s) => [s.id, analyse(s.id, H, NO_FILTERS, range, gran)])) as Record<string, ReturnType<typeof analyse>>, [H, range, gran]);
  const a = A[stream];
  const ytdTest = poissonTest(k.ytd.n, k.lytd.n);
  const top10usd = top10.reduce((s, h) => s + (h.usd || 0), 0);
  const ci: CryptoInputs = {
    ok: !!fc?.data, year: new Date(now).getUTCFullYear(), ytd: k.ytd, lytd: k.lytd, d30: k.d30, p30: k.p30, pt: k.pt.p, ytdP: ytdTest.p,
    big: k.big ? { name: k.big.name, usd: k.big.usd, day: k.big.day } : undefined, big2: k.big?.usd && k.ytd.u ? k.big.usd / k.ytd.u : 0,
    byTech, byCat, totWin, top10: top10usd, winLabel: WIN_LABEL[win], trendBig: A.cryptobig, trendUsd: A.cryptousd,
    vul30: vul30.length, vulKev: vul30.filter((v) => v.kev).length,
  };
  const cs = cryptoSummary(ci), cm = cryptoMeans(ci);

  return (
    <div className="flex flex-col gap-2" data-crypto-loading={[fc, fv].filter((f) => f?.status === 'loading').length}>
      {/* controls */}
      <div className="panel flex flex-wrap items-center gap-2 px-3 py-1.5">
        <Bitcoin size={15} style={{ color: ORANGE }} />
        <span className="text-[11px] font-semibold uppercase tracking-[.14em]" style={{ color: ORANGE }}>Crypto security</span>
        <span className="text-[10px] text-slate-500">breakdowns:</span>
        <div className="flex overflow-hidden rounded-md border border-ink-600">{(Object.keys(WINS) as Win[]).map((w) => <button key={w} onClick={() => setWin(w)} className={clsx('px-2.5 py-1 text-[11px] font-medium uppercase', win === w ? 'bg-[#f7931a]/15 text-[#f7931a]' : 'text-slate-400 hover:text-white')}>{w}</button>)}</div>
        <select className={sel} value={chain} onChange={(e) => setChain(e.target.value)} title="Chain"><option value="">All chains</option>{opts.chains.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={group} onChange={(e) => setGroup(e.target.value)} title="Attack technique"><option value="">All techniques</option>{opts.groups.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)} title="Category"><option value="">All categories</option>{opts.cats.map((c) => <option key={c}>{c}</option>)}</select>
        {filtered && <button className="btn !py-1 text-[11px]" onClick={() => { setChain(''); setGroup(''); setCat(''); }}>Reset</button>}
        <span className="ml-auto text-[10px] text-slate-500">Amounts = USD at time of hack (as reported) · incident dates are UTC days · attribution is per source reporting</span>
      </div>

      <ExecSummary id="crypto" title="Crypto — executive summary" s={cs} accent={ORANGE} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
        <Kpi label="Stolen · 24 h" v={usd(k.d1.u)} sub={`${k.d1.n} incident${k.d1.n === 1 ? '' : 's'} (by UTC date)`} sev={sevOfUsd(k.d1.u || null)} f={fc} />
        <Kpi label="Stolen · 7 days" v={usd(k.d7.u)} sub={`${k.d7.n} incidents`} sev={sevOfUsd(k.d7.u || null)} f={fc} />
        <Kpi label="Stolen · 30 days" v={usd(k.d30.u)} sub={`${k.d30.n} incidents · prior 30d ${usd(k.p30.u)}`} sev={sevOfUsd(k.d30.u || null)} f={fc} />
        <Kpi label={`Stolen · YTD ${new Date(now).getUTCFullYear()}`} v={usd(k.ytd.u, 0)} sub={`${k.ytd.n} incidents · same period ${new Date(now).getUTCFullYear() - 1}: ${usd(k.lytd.u, 0)}`} sev={sevOfUsd(k.ytd.u || null)} f={fc} />
        <Kpi label="Incidents · 30 days" v={String(k.d30.n)} sub={<>{k.p30.n} prior 30d · <span style={{ color: k.pt.p < 0.05 ? (k.d30.n > k.p30.n ? '#ff5d7a' : '#4ade80') : '#94a3b8' }}>{fmtPct(k.p30.n ? ((k.d30.n - k.p30.n) / k.p30.n) * 100 : null)} ({fmtP(k.pt.p)})</span></>} sev={k.pt.p < 0.05 && k.d30.n > k.p30.n ? 'high' : 'low'} f={fc} />
        <Kpi label="Largest hack · YTD" v={k.big ? usd(k.big.usd) : '—'} sub={k.big ? `${k.big.name} · ${k.big.day}` : 'none recorded'} sev={sevOfUsd(k.big?.usd ?? null)} f={fc} onClick={k.big ? () => setOpen(hackItem(k.big!)) : undefined} />
        <Kpi label="Recovered · YTD" v={k.ytd.u ? `${((k.ytd.r / k.ytd.u) * 100).toFixed(1)}%` : '—'} sub={`${usd(k.ytd.r)} returned (where reported)`} sev="low" f={fc} color="#22c55e" />
        <Kpi label="Crypto CVEs · 30 days" v={String(vul30.length)} sub={`${vul30.filter((v) => v.sev === 'critical').length} critical · ${vulns.filter((v) => v.kev).length} in KEV`} sev={vul30.some((v) => v.sev === 'critical') ? 'high' : 'low'} f={fv} />
      </div>

      {/* stream + trends + breakdowns */}
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <div className="h-[760px] xl:col-span-4 2xl:col-span-3">
          <Panel info="cryptoStream" title="Live crypto incident stream" icon={<Zap size={13} style={{ color: ORANGE }} />} feeds={[fc, fv, fr].filter(Boolean)} bodyClass="flex flex-col"
            right={<span className="mono text-[10px] text-slate-500">{shown.length}</span>}>
            <div className="flex flex-wrap gap-1 border-b border-ink-700/60 px-2 py-1.5">
              {(['hack', 'news', 'vuln', 'ransomware'] as const).map((x) => { const on = kinds.has(x); const n = items.filter((i) => i.kind === x).length; return (
                <button key={x} onClick={() => setKinds((s) => { const m = new Set(s); on ? m.delete(x) : m.add(x); return m.size ? m : new Set(['hack', 'news', 'vuln', 'ransomware']); })}
                  className={clsx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]', on ? 'border-ink-500 bg-ink-800 text-slate-200' : 'border-ink-700 text-slate-600 line-through')}>{KIND_ICON[x]}{KIND_LABEL[x]} <span className="mono text-slate-500">{n}</span></button>); })}
            </div>
            {!fc?.data && fc?.status !== 'live' ? <Offline f={fc} what="Crypto feeds" /> : (
              <ul className="min-h-0 flex-1 divide-y divide-ink-700/50 overflow-y-auto">
                {shown.map((i) => (
                  <li key={i.id}><button data-cev={i.kind} onClick={() => setOpen(i)} className="flex w-full gap-2 px-2.5 py-1.5 text-left hover:bg-white/[.03]" style={{ borderLeft: `3px solid ${SEV_COLOR[i.sev]}` }}>
                    <span className="mt-0.5" style={{ color: SEV_COLOR[i.sev] }}>{KIND_ICON[i.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[12px] leading-snug text-slate-100">{i.title}</span>
                      <span className="block truncate text-[10.5px] text-slate-500">{i.sub}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5"><SevBadge sev={i.sev} /><span className="mono text-[10px] text-slate-500">{i.kind === 'hack' || i.kind === 'vuln' ? new Date(i.t).toISOString().slice(5, 10) : ago(new Date(i.t).toISOString(), now)}</span></span>
                  </button></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-2 xl:col-span-8 2xl:col-span-6">
          <div className="grid grid-cols-3 gap-2">
            {CRYPTO_STREAMS.map((s) => <VerdictCard key={s.id} a={A[s.id]} selected={stream === s.id} onClick={() => setStream(s.id)} filtered={filtered} />)}
          </div>
          <div className="h-[420px]"><Panel info="trendsMain" title={<>{at(a.meta.label)} <span className="normal-case tracking-normal text-slate-500">· {a.gran}ly{filtered ? ' · filtered' : ''}</span></>} icon={<TrendingUp size={13} style={{ color: ORANGE }} />}
            right={<div className="flex items-center gap-1.5">
              <div className="flex overflow-hidden rounded-md border border-ink-600">{(Object.keys(RANGES) as RangeId[]).map((r) => <button key={r} onClick={() => setRange(r)} className={clsx('px-2 py-0.5 text-[10.5px]', range === r ? 'bg-[#f7931a]/15 text-[#f7931a]' : 'text-slate-400 hover:text-white')}>{r}</button>)}</div>
              <div className="flex overflow-hidden rounded-md border border-ink-600">{(['auto', 'week', 'month'] as const).map((g) => <button key={g} onClick={() => setGran(g)} className={clsx('px-2 py-0.5 text-[10.5px] capitalize', gran === g ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white')}>{g}</button>)}</div>
            </div>} bodyClass="p-2"><MainChart a={a} /></Panel></div>
          <div className="min-h-[188px] flex-1"><Panel info="cryptoStats" means={cm.stats} title="Is crypto crime getting worse? — the statistics" icon={<Sigma size={13} style={{ color: ORANGE }} />} bodyClass="overflow-y-auto px-3 py-2 text-[11.5px] leading-relaxed text-slate-300">
            {a.sentence.map((s, i) => <p key={i} className="mb-1" dangerouslySetInnerHTML={{ __html: s.replace(/^(RISING|FALLING|STABLE)/, (m) => `<b style="color:${m === 'RISING' ? '#ff2d55' : m === 'FALLING' ? '#22c55e' : '#94a3b8'}">${m}</b>`) }} />)}
            {k.ytd.n + k.lytd.n > 0 && <p className="mb-1">Year to date vs the same period last year: <b>{k.ytd.n}</b> vs <b>{k.lytd.n}</b> incidents ({fmtPct(k.lytd.n ? ((k.ytd.n - k.lytd.n) / k.lytd.n) * 100 : null)}; exact Poisson test {fmtP(ytdTest.p)}{ytdTest.p >= 0.05 ? ', not significant' : ''}); {usd(k.ytd.u, 0)} vs {usd(k.lytd.u, 0)} stolen{k.lytd.u ? ` (${fmtPct(((k.ytd.u - k.lytd.u) / k.lytd.u) * 100)})` : ''}. USD totals are dominated by a few very large hacks, so the rank-based tests above are the better guide to direction.</p>}
          </Panel></div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:col-span-12 2xl:col-span-3 2xl:grid-cols-1">
          <div className="h-[300px]"><Panel info="cryptoTech" means={cm.tech} title={<>{at('Losses by technique')} <span className="normal-case tracking-normal text-slate-500">· {WIN_LABEL[win]}</span></>} icon={<Swords size={13} style={{ color: ORANGE }} />} bodyClass="overflow-y-auto px-2.5 py-1.5">
            <BarList rows={byTech} total={totWin} onPick={(x) => setGroup(group === x ? '' : x)} active={group} color="#ff2d55" />
          </Panel></div>
          <div className="h-[200px]"><Panel info="cryptoCat" title={<>{at('By category')} <span className="normal-case tracking-normal text-slate-500">· {WIN_LABEL[win]}</span></>} icon={<Layers size={13} style={{ color: ORANGE }} />} bodyClass="flex items-center gap-2 px-2">
            <div className="h-full w-[130px] shrink-0"><ResponsiveContainer><PieChart><Pie data={byCat} dataKey="usd" nameKey="key" innerRadius={34} outerRadius={58} stroke="#09101b" isAnimationActive={false} onClick={(d: any) => setCat(cat === d.key ? '' : d.key)}>{byCat.map((r) => <Cell key={r.key} fill={CAT_COLOR[r.key] || '#64748b'} />)}</Pie><Tooltip {...TT} formatter={(v: any) => usd(v)} /></PieChart></ResponsiveContainer></div>
            <ul className="min-w-0 flex-1 space-y-0.5 text-[11px]">{byCat.map((r) => <li key={r.key}><button onClick={() => setCat(cat === r.key ? '' : r.key)} className={clsx('flex w-full items-center gap-1.5 rounded px-1 hover:bg-white/5', cat === r.key && 'bg-white/10')}><span className="h-2 w-2 rounded-sm" style={{ background: CAT_COLOR[r.key] || '#64748b' }} /><span className="truncate text-slate-300">{r.key}</span><span className="mono ml-auto text-slate-400">{usd(r.usd)}</span><span className="mono w-8 text-right text-slate-600">{r.n}</span></button></li>)}</ul>
          </Panel></div>
          <div className="h-[244px]"><Panel info="cryptoChain" title={<>{at('By chain')} <span className="normal-case tracking-normal text-slate-500">· {WIN_LABEL[win]}</span></>} icon={<Link2 size={13} style={{ color: ORANGE }} />} bodyClass="overflow-y-auto px-2.5 py-1.5">
            <BarList rows={byChain.slice(0, 14)} total={totWin} onPick={(x) => setChain(chain === x ? '' : x)} active={chain} color={ORANGE} note="Multi-chain incidents count in full toward each chain listed." />
          </Panel></div>
        </div>
      </div>

      {/* top 10 + vulns + severity */}
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
        <div className="h-[420px] xl:col-span-7 2xl:col-span-6">
          <Panel info="cryptoTop" means={cm.top} title={<>{at('Top 10 biggest incidents')} <span className="normal-case tracking-normal text-slate-500">· {WIN_LABEL[win]}{filtered ? ' · filtered' : ''}</span></>} icon={<ListOrdered size={13} style={{ color: ORANGE }} />} feeds={fc ? [fc] : []} bodyClass="overflow-auto">
            {!fc?.data ? <Offline f={fc} what="DeFiLlama hacks dataset" /> : (
              <table className="w-full text-[11.5px]">
                <thead className="sticky top-0 bg-ink-900 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-2 py-1.5 text-left">#</th><th className="text-left">Date (UTC)</th><th className="text-left">Target</th><th className="text-right">Lost</th><th className="text-right">{at('Returned')}</th><th className="pl-3 text-left">Technique</th><th className="text-left">{at('Chain')}</th><th className="pr-2 text-left">Category</th></tr></thead>
                <tbody>{top10.map((h, i) => (
                  <tr key={h.id} data-top={i} onClick={() => setOpen(hackItem(h))} className="cursor-pointer border-t border-ink-700/50 hover:bg-white/[.04]">
                    <td className="mono px-2 py-1.5 text-slate-500">{i + 1}</td><td className="mono text-slate-400">{h.day}</td>
                    <td className="font-semibold text-slate-100">{h.name}</td>
                    <td className="mono text-right font-bold" style={{ color: SEV_COLOR[h.sev] }}>{usd(h.usd)}</td>
                    <td className="mono text-right text-emerald-400">{h.returned ? usd(h.returned) : <span className="text-slate-600">—</span>}</td>
                    <td className="pl-3 text-slate-300">{h.tech}</td><td className="max-w-[150px] truncate text-slate-400">{h.chains.join(', ')}</td><td className="pr-2 text-slate-400">{h.cat}</td>
                  </tr>))}
                  {!top10.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">No incidents recorded in this window/filter.</td></tr>}
                </tbody>
              </table>)}
          </Panel>
        </div>
        <div className="h-[420px] xl:col-span-5 2xl:col-span-3">
          <Panel info="cryptoVulns" means={cm.vulns} title="Crypto-related vulnerabilities" icon={<Bug size={13} style={{ color: ORANGE }} />} feeds={fv ? [fv] : []} bodyClass="overflow-y-auto"
            right={<span className="text-[10px] text-slate-500">KEV + NVD keyword · 120d</span>}>
            {!fv?.data ? <Offline f={fv} what="Crypto vulnerability sources" /> : (
              <ul className="divide-y divide-ink-700/50">{vulns.slice(0, 80).map((v) => (
                <li key={v.id}><button onClick={() => setOpen({ id: v.id, kind: 'vuln', t: Date.parse(v.date), sev: v.sev, title: `${v.id} · ${v.title}`, sub: v.src, link: v.link, raw: v, why: v.sevReason })} className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-white/[.03]">
                  <CvssBadge score={v.score} />
                  <span className="min-w-0 flex-1"><span className="mono text-[11px] text-cyan-glow">{v.id}</span>{v.kev && <span className="chip ml-1 border border-sev-critical/50 text-sev-critical">{at('KEV')}</span>}<span className="line-clamp-2 text-[11px] text-slate-300">{v.title}</span></span>
                  <span className="mono shrink-0 text-[10px] text-slate-500">{v.date}</span>
                </button></li>))}
                {!vulns.length && <li className="p-6 text-center text-xs text-slate-500">No crypto-related CVEs matched in the last 120 days.</li>}
              </ul>)}
          </Panel>
        </div>
        <div className="h-[420px] xl:col-span-12 2xl:col-span-3">
          <Panel info="cryptoSize" title="Incident size mix over time" icon={<Skull size={13} style={{ color: ORANGE }} />} bodyClass="p-2"><SeverityChart a={A.cryptohacks} /></Panel>
        </div>
      </div>

      <div className="panel flex items-start gap-2 border-sev-medium/40 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-sev-medium" />
        <div>
          <b className="text-sev-medium">Read with care.</b> Incident data comes from the <a className="text-cyan-glow hover:underline" href="https://defillama.com/hacks" target="_blank" rel="noreferrer">DeFiLlama hacks dataset</a>. Amounts are <b>USD at the time of the hack</b>, as reported, and are not net of recoveries. "Returned" is only filled in where the dataset records it.
          Technique, category and chain come from the dataset's own classification, grouped by SENTINEL. <b>Attribution</b> (e.g. Lazarus/DPRK) is shown only as the source reports it; nothing is attributed here.
          The dataset records many more small incidents in recent years, so all-size counts partly reflect coverage. Use the <b>“Incidents ≥ $1M”</b> trend for direction.
          The news severity comes from the USD figure in the headline, or from incident keywords. Crypto CVEs are keyword matches against NVD and KEV descriptions. Ransomware entries are keyword-matched leak-site claims. The latest 3 days are treated as a reporting lag and excluded from tests.
        </div>
      </div>

      {open && <Drawer i={open} onClose={() => setOpen(null)} news={news} />}
    </div>
  );
}

const KIND_LABEL = { hack: 'Hacks', news: 'News & intel', vuln: 'CVEs', ransomware: 'Ransomware' } as const;
const KIND_ICON = { hack: <Skull size={12} />, news: <Newspaper size={12} />, vuln: <Bug size={12} />, ransomware: <AlertTriangle size={12} /> } as const;
const hackItem = (h: Hack): Item => ({ id: h.id, kind: 'hack', t: h.t, sev: h.sev, title: `${h.name} — ${usd(h.usd)} lost`, sub: h.tech, usd: h.usd, link: h.link, raw: h, why: `USD-loss tier (${usd(h.usd)} at time of hack)` });

function agg(list: Hack[], keys: (h: Hack) => string[]) {
  const m = new Map<string, { key: string; usd: number; n: number }>();
  for (const h of list) for (const k of keys(h)) { const r = m.get(k) || { key: k, usd: 0, n: 0 }; r.usd += h.usd || 0; r.n++; m.set(k, r); }
  return [...m.values()].sort((a, b) => b.usd - a.usd);
}
function BarList({ rows, total, onPick, active, color, note }: { rows: { key: string; usd: number; n: number }[]; total: number; onPick: (k: string) => void; active: string; color: string; note?: string }) {
  const max = rows[0]?.usd || 0;
  if (!rows.length) return <div className="p-4 text-center text-xs text-slate-500">No incidents in this window.</div>;
  return (
    <div>
      <ul className="space-y-1">{rows.map((r) => (
        <li key={r.key}><button onClick={() => onPick(r.key)} className={clsx('w-full rounded px-1 py-0.5 text-left hover:bg-white/5', active === r.key && 'bg-white/10')}>
          <div className="flex items-baseline gap-2 text-[11px]"><span className="truncate text-slate-200">{r.key}</span><span className="mono ml-auto text-slate-300">{usd(r.usd)}</span><span className="mono w-14 text-right text-slate-500">{total ? ((r.usd / total) * 100).toFixed(1) : 0}% · {r.n}</span></div>
          <Bar value={r.usd} max={max} color={color} />
        </button></li>))}</ul>
      {note && <p className="mt-1.5 text-[10px] text-slate-500">{note}</p>}
    </div>
  );
}

function Drawer({ i, onClose, news }: { i: Item; onClose: () => void; news: any[] }) {
  const r = i.raw;
  const related = i.kind === 'hack' && r.name.length >= 4 ? news.filter((n) => new RegExp(`\\b${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(n.title)).slice(0, 6) : [];
  const rows: [string, React.ReactNode][] = i.kind === 'hack' ? [
    ['Incident date', `${r.day} (UTC)`], ['Amount lost', <b style={{ color: SEV_COLOR[i.sev] }}>{usd(r.usd, 2)} <span className="font-normal text-slate-500">USD at time of hack</span></b>],
    ['Funds returned', r.returned ? `${usd(r.returned, 2)} (${r.usd ? ((r.returned / r.usd) * 100).toFixed(1) : '?'}%)` : 'not recorded'],
    ['Technique', `${r.tech} (${r.cls})`], ['Technique group', r.group], ['Target type', `${r.target}${r.bridge ? ' · bridge' : ''}`], ['Category', r.cat],
    ['Chain(s)', r.chains.join(', ') || '—'], ['Code language', r.lang || '—'],
  ] : i.kind === 'news' ? [
    ['Source', r.source], ['Published', r.published ? new Date(r.published).toUTCString() : '—'], ['Tags', r.kinds?.join(', ') || '—'], ['Headline amount', r.usd != null ? usd(r.usd, 2) : '—'],
  ] : i.kind === 'vuln' ? [
    ['Source', r.src + (r.nvdTerm ? ` (keyword “${r.nvdTerm}”)` : '')], ['Date', r.date], ['CVSS', r.score ?? 'not scored'], ['In CISA KEV', r.kev ? 'yes' : 'no'], ['Vendor / product', [r.vendor, r.product].filter(Boolean).join(' / ') || '—'],
  ] : [['Group', r.group], ['Victim', r.victim], ['Sector', r.sector], ['Country', r.country || '—'], ['Discovered', r.discovered]];
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-[520px] animate-slidein overflow-y-auto border-l border-ink-600 bg-ink-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} data-drawer="crypto">
        <div className="mb-2 flex items-start gap-2">
          <SevBadge sev={i.sev} /><span className="chip border border-ink-500 text-slate-400">{KIND_LABEL[i.kind]}</span>
          <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose}><X size={16} /></button>
        </div>
        <h3 className="mb-1 text-[16px] font-semibold leading-snug text-white">{i.title}</h3>
        <p className="mb-3 text-[11px] text-slate-500">Severity: {i.why}</p>
        <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-[12px]">{rows.map(([kk, v]) => <Fragment key={kk}><dt className="text-slate-500">{kk}</dt><dd className="text-slate-200">{v}</dd></Fragment>)}</dl>
        {(r.summary || r.desc) && <p className="mt-3 rounded border border-ink-700 bg-ink-850 p-2 text-[12px] leading-relaxed text-slate-300">{r.summary || r.desc}</p>}
        {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="btn mt-3"><ExternalLink size={13} /> Open source{i.kind === 'hack' ? ' (DeFiLlama hacks)' : ''}</a>}
        {i.kind === 'hack' && <p className="mt-2 text-[10.5px] text-slate-500">The DeFiLlama record has no per-incident article link, so this opens the dataset page. Any attribution is in the linked reporting, not in this record.</p>}
        {related.length > 0 && <div className="mt-4"><div className="panel-title mb-1">Related reporting</div><ul className="space-y-1">{related.map((n) => <li key={n.id}><a href={n.link} target="_blank" rel="noreferrer" className="text-[12px] text-cyan-glow hover:underline">{n.title}</a> <span className="text-[10px] text-slate-500">· {n.source}</span></li>)}</ul></div>}
      </aside>
    </div>
  );
}

function Kpi({ label, v, sub, sev, f, color, onClick }: { label: string; v: string; sub: React.ReactNode; sev: Sev; f?: FeedState; color?: string; onClick?: () => void }) {
  const off = !f || (!f.data && f.status !== 'live');
  const c = color || (sev === 'low' ? '#e2e8f0' : SEV_COLOR[sev]);
  return (
    <button onClick={onClick} className={clsx('panel flex min-h-[92px] flex-col px-3 py-2 text-left', !onClick && 'cursor-default')} style={sev === 'critical' && !off ? { boxShadow: 'inset 0 0 22px rgba(255,45,85,.18)' } : undefined}>
      <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{at(label)}</span>
      {off ? <span className="mt-1 text-[13px] font-semibold" style={{ color: f?.status === 'loading' ? '#64748b' : '#ff2d55' }}>{f?.status === 'loading' ? 'Loading…' : 'OFFLINE'}</span>
        : <span className="mono mt-0.5 text-[24px] font-bold leading-tight" style={{ color: c, textShadow: sev === 'critical' ? '0 0 12px rgba(255,45,85,.6)' : undefined }}>{v}</span>}
      {!off && <span className="mt-auto truncate text-[10.5px] text-slate-500">{at(sub)}</span>}
    </button>
  );
}

import { Fragment, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Atom, BookOpen, Clock, ExternalLink, Grid3x3, ListOrdered, Radar, ShieldAlert, ShieldCheck, ShieldQuestion, Signal, X } from 'lucide-react';
import type { FeedState } from '../../lib/types';
import { Offline, Panel } from '../ui';
import { ago } from '../../lib/format';
import { ExecSummary, Term, at, type Summary } from '../explain';
import { ALGOS, QDAY_GAP, QDAY_MILESTONES, QDAY_REVIEWED } from '../../lib/qday';

const VIOLET = '#a78bfa';
const DAY = 86400_000;
type Item = { id: string; source: string; group?: string; title: string; link: string; published?: string; firstSeen?: string; summary?: string; impact: number; impactWhy: string; proximity: number; proxWhy: string; notes: string[]; cat: string; targets: string[]; score: number; also?: string[] };
const CATS = ['Quantum attack on public-key crypto', 'Quantum hardware & error correction', 'Classical cryptanalysis', 'Post-quantum standards & migration', 'AI for maths & proofs', 'Mathematics', 'Other'];
const CAT_COLOR: Record<string, string> = { 'Quantum attack on public-key crypto': '#ff2d55', 'Quantum hardware & error correction': VIOLET, 'Classical cryptanalysis': '#ff8a1f', 'Post-quantum standards & migration': '#34d399', 'AI for maths & proofs': '#22e3ff', Mathematics: '#3aa0ff', Other: '#64748b' };
const LVL = ['', '#64748b', '#3aa0ff', '#ffc21a', '#ff8a1f', '#ff2d55'];
const IMPACT_LABEL = ['', 'Minor', 'Niche', 'Sector', 'Major', 'Systemic'];
const PROX_LABEL = ['', 'Commentary / defence', 'Theory', 'Progress', 'Practical (limited)', 'Practical break'];
const WINS = { '30d': 30, '90d': 90, '180d': 180 } as const;
type Win = keyof typeof WINS;
const sel = 'rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] text-slate-200 max-w-[220px]';
const tOf = (x: Item) => { const t = Date.parse(x.published || x.firstSeen || ''); return isNaN(t) ? 0 : t; };
const fmtDate = (t: number) => (t ? new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function Chip({ k, v, title }: { k: 'I' | 'P'; v: number; title: string }) {
  return <span title={title} className="mono inline-flex items-center gap-0.5 rounded border px-1 text-[10.5px] font-semibold" style={{ color: LVL[v], borderColor: LVL[v] + '66', background: LVL[v] + '1a' }}>{k}{v}</span>;
}

export default function Frontier({ feeds, now }: { feeds: Record<string, FeedState>; now: number }) {
  const f = feeds.frontier;
  const all: Item[] = f?.data?.items ?? [];
  const dropped: { name: string; why: string }[] = f?.data?.dropped ?? [];
  const [win, setWin] = useState<Win>('180d');
  const [cat, setCat] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [q, setQ] = useState('');
  const [cell, setCell] = useState<[number, number] | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const [limit, setLimit] = useState(40);

  const inWin = useMemo(() => all.filter((x) => { const t = tOf(x); return !t || t >= now - WINS[win] * DAY; }), [all, win, now]);
  const base = useMemo(() => inWin.filter((x) => (!cat || x.cat === cat) && (!q || (x.title + ' ' + x.source).toLowerCase().includes(q.toLowerCase()))), [inWin, cat, q]);
  const list = useMemo(() => base.filter((x) => x.score >= minScore && (!cell || (x.impact === cell[0] && x.proximity === cell[1]))), [base, minScore, cell]);
  const matrix = useMemo(() => { const m: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0)); for (const x of base) m[x.impact][x.proximity]++; return m; }, [base]);
  const mMax = Math.max(1, ...matrix.flat());
  const srcs = f?.sources ?? [];
  const live = srcs.filter((s) => s.ok).length;
  const hot = inWin.filter((x) => x.impact >= 4 && x.proximity >= 4);
  const d30 = inWin.filter((x) => tOf(x) >= now - 30 * DAY);
  const catCount = useMemo(() => { const c = new Map<string, number>(); for (const x of inWin) c.set(x.cat, (c.get(x.cat) || 0) + 1); return c; }, [inWin]);

  const summary: Summary = useMemo(() => {
    const top = inWin[0];
    const pk = inWin.filter((x) => x.cat === 'Quantum attack on public-key crypto');
    const hw = inWin.filter((x) => x.cat === 'Quantum hardware & error correction' && x.proximity >= 3);
    const pr = inWin.filter((x) => x.cat === 'Classical cryptanalysis' && x.proximity >= 4);
    return {
      now: [
        all.length ? `${inWin.length} items in the ${WINS[win]}-day window from ${live}/${srcs.length} live sources; ${hot.length} rated high-impact AND near-practical (Impact × Proximity ≥ 4×4).` : 'No Frontier data yet — sources are collected every 2 hours.',
        top ? `Top-ranked: “${top.title}” (${top.source}, I${top.impact}×P${top.proximity}). ${top.proxWhy}` : '',
        `${pk.length} item(s) on quantum attacks against RSA / elliptic-curve crypto, ${hw.length} hardware / error-correction progress item(s), ${pr.length} practical classical attack(s) on specific algorithms or products.`,
      ].filter(Boolean),
      think: [
        'No quantum computer can break RSA or elliptic-curve cryptography today. The risk is a moving gap: the qubits NEEDED keep falling (≈20 million in 2019 → under 100,000–500,000 physical qubits in 2026 estimates), while the qubits BUILT keep rising (thousands of raw atoms, ~100 reliable logical qubits).',
        'Watch the top-right of the matrix. One genuinely high-impact AND near-practical item matters more than a hundred commentary pieces. Most classical "attacks" here break one product or a weakened variant — serious, but patchable.',
      ],
      sowhat: [
        'Data that must stay secret 10+ years is already exposed to harvest now, decrypt later — prioritise post-quantum key exchange (ML-KEM hybrids) for it.',
        'Inventory where RSA / ECC are used (certificates, VPNs, signing, wallets); NIST\'s draft timeline retires them by 2030–2035.',
        'Scores are automated estimates from keyword rules — open the source before acting on any single item.',
      ],
      basis: 'Impact and Proximity are SENTINEL rules (no AI model), computed from titles and abstracts. Reference timeline curated and sourced; reviewed ' + QDAY_REVIEWED + '.',
    };
  }, [inWin, all.length, win, live, srcs.length, hot.length]);

  return (
    <div className="flex flex-col gap-2.5" data-view="frontier">
      <ExecSummary id="frontier" title="Frontier — AI & quantum breakthroughs vs cryptography" s={summary} accent={VIOLET} />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Kpi label="Items (window)" v={String(inWin.length)} sub={`${d30.length} in last 30 days`} f={f} />
        <Kpi label="High impact & near-practical" v={String(hot.length)} sub="Impact ≥ 4 and Proximity ≥ 4" f={f} color={hot.length ? '#ff2d55' : '#e2e8f0'} />
        <Kpi label="Quantum vs RSA / ECC" v={String(catCount.get('Quantum attack on public-key crypto') || 0)} sub="algorithms & resource estimates" f={f} color="#ff8a1f" />
        <Kpi label="Q-Day gap (ECC-256)" v="~1,200 vs 70" sub="logical qubits needed vs demonstrated" f={f} color={VIOLET} always />
        <Kpi label="Sources live" v={`${live}/${srcs.length || 32}`} sub={f?.fetchedAt ? `collected ${ago(f.fetchedAt, now)}` : f?.status || ''} f={f} color={live === srcs.length ? '#22c55e' : '#ffc21a'} />
      </div>

      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        <Panel title="Ranked breakthroughs" icon={<ListOrdered size={14} />} feeds={f ? [f] : []} info="frontierRank" className="min-h-[640px]" bodyClass="flex flex-col"
          right={<span className="chip border border-ink-500 text-[10px] text-slate-400">automated estimate</span>}
          means={<>Read each row as “if this line of work succeeds, how much breaks (Impact) and how close is it to breaking something in practice (Proximity)”. Rank = Impact × Proximity. A 5×2 is a big-but-distant threat; a 3×5 is a real attack on something narrower.</>}>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-700/70 px-3 py-2">
            {(Object.keys(WINS) as Win[]).map((w) => <button key={w} onClick={() => setWin(w)} className={clsx('rounded border px-1.5 py-0.5 text-[10.5px]', win === w ? 'border-[#a78bfa]/60 bg-[#a78bfa]/10 text-[#a78bfa]' : 'border-ink-600 text-slate-400 hover:text-white')}>{w}</button>)}
            <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATS.map((c) => <option key={c} value={c}>{c} ({catCount.get(c) || 0})</option>)}</select>
            <select className={sel} value={minScore} onChange={(e) => setMinScore(+e.target.value)} aria-label="Minimum score"><option value={0}>Any score</option><option value={6}>Score ≥ 6</option><option value={9}>Score ≥ 9</option><option value={12}>Score ≥ 12</option><option value={16}>Score ≥ 16</option></select>
            <input className={clsx(sel, 'w-[150px]')} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            {cell && <button onClick={() => setCell(null)} className="chip border border-[#a78bfa]/60 text-[#a78bfa]">I{cell[0]} × P{cell[1]} <X size={11} /></button>}
            <span className="ml-auto text-[10.5px] text-slate-500">{list.length} shown</span>
          </div>
          {!all.length ? <Offline f={f} what="the Frontier feeds" /> : (
            <ol className="min-h-0 flex-1 divide-y divide-ink-700/60 overflow-y-auto" data-list="frontier">
              {list.slice(0, limit).map((x, i) => (
                <li key={x.id}>
                  <button onClick={() => setOpen(x)} className="flex w-full gap-2.5 px-3 py-2 text-left hover:bg-white/[.03]" data-item={i}>
                    <span className="mono w-6 shrink-0 pt-0.5 text-right text-[11px] text-slate-500">{i + 1}</span>
                    <span className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                      <span className="mono flex h-7 w-8 items-center justify-center rounded text-[12px] font-bold" style={{ background: LVL[Math.min(5, Math.ceil(x.score / 5))] + '26', color: LVL[Math.min(5, Math.ceil(x.score / 5))] }}>{x.score}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Chip k="I" v={x.impact} title={`Impact ${x.impact}/5 (${IMPACT_LABEL[x.impact]}): ${x.impactWhy}`} />
                        <Chip k="P" v={x.proximity} title={`Proximity ${x.proximity}/5 (${PROX_LABEL[x.proximity]}): ${x.proxWhy}`} />
                        <span className="chip border text-[10px]" style={{ color: CAT_COLOR[x.cat], borderColor: CAT_COLOR[x.cat] + '55' }}>{x.cat}</span>
                        <span className="text-[10.5px] text-slate-500">{x.source}{x.also?.length ? ` +${x.also.length}` : ''} · {fmtDate(tOf(x))}</span>
                      </span>
                      <span className="mt-0.5 block text-[13px] font-medium leading-snug text-slate-100">{x.title}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-400"><b className="text-slate-300">Why:</b> {x.proxWhy}</span>
                      {x.notes.length > 0 && <span className="mt-0.5 block text-[10.5px] text-amber-300/80">⚑ {x.notes.join(' · ')}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {list.length > limit && <li className="p-2 text-center"><button className="btn" onClick={() => setLimit((l) => l + 60)}>Show more ({list.length - limit})</button></li>}
              {!list.length && <li className="p-6 text-center text-xs text-slate-500">Nothing matches these filters.</li>}
            </ol>
          )}
        </Panel>

        <div className="flex flex-col gap-2.5">
          <Panel title="Impact × Proximity matrix" icon={<Grid3x3 size={14} />} info="frontierMatrix" bodyClass="p-3"
            means={<>Each square counts items with that Impact (rows) and Proximity (columns). The red corner = high impact and close to practical. Click a square to filter the list.</>}>
            <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1" data-matrix>
              {[5, 4, 3, 2, 1].map((imp) => (
                <Fragment key={imp}>
                  <span className="flex items-center justify-end pr-1 text-[10px] text-slate-400" title={IMPACT_LABEL[imp]}>I{imp} <span className="ml-1 hidden text-slate-600 2xl:inline">{IMPACT_LABEL[imp]}</span></span>
                  {[1, 2, 3, 4, 5].map((px) => {
                    const n = matrix[imp][px]; const risk = imp * px; const c = LVL[Math.min(5, Math.ceil(risk / 5))];
                    const on = cell && cell[0] === imp && cell[1] === px;
                    return <button key={px} onClick={() => setCell(on ? null : [imp, px])} title={`Impact ${imp} × Proximity ${px}: ${n} item(s)`} className={clsx('mono flex h-11 items-center justify-center rounded border text-[12px] font-semibold transition', on ? 'ring-2 ring-white' : '')} style={{ borderColor: c + '55', background: n ? c + Math.round(24 + (n / mMax) * 150).toString(16).padStart(2, '0') : '#0b1220', color: n ? '#fff' : '#334155' }}>{n || '·'}</button>;
                  })}
                </Fragment>
              ))}
              <span />
              {[1, 2, 3, 4, 5].map((px) => <span key={px} className="text-center text-[10px] text-slate-400" title={PROX_LABEL[px]}>P{px}</span>)}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>← commentary / theory</span><span>practical break →</span></div>
          </Panel>

          <Panel title="How the ranking works" icon={<BookOpen size={14} />} bodyClass="space-y-2 p-3 text-[12px] leading-relaxed text-slate-300">
            <p><b className="text-white">Impact (1–5)</b> — what breaks if this line of work fully succeeds. <b style={{ color: LVL[5] }}>5</b> = <Term id="shor">Shor-type</Term> attacks on RSA / elliptic curves (HTTPS, VPNs, banking, Bitcoin); <b style={{ color: LVL[4] }}>4</b> = attacks on the new <Term id="pqc">post-quantum</Term> standards or on AES / SHA; <b style={{ color: LVL[3] }}>3</b> = quantum error correction, protocol attacks, AI that proves theorems; <b style={{ color: LVL[2] }}>2</b> = general quantum or maths progress; 1 = other.</p>
            <p><b className="text-white">Proximity (1–5)</b> — how close it is to a real-world break. <b style={{ color: LVL[5] }}>5</b> = practical attack on a deployed algorithm; <b style={{ color: LVL[4] }}>4</b> = practical attack on a product / implementation, or a new resource estimate for real key sizes; 3 = an attack on a reduced version, a hardware demonstration, or an AI maths result; 2 = theory; 1 = commentary, defences, explainers.</p>
            <p><b className="text-white">Rank</b> = Impact × Proximity, then Impact, then newest. Caps: toy-sized demos (“factored 22 bits”) and hype headlines are capped at Proximity 2. Items where researchers withheld attack details are flagged ⚑.</p>
            <p className="text-[11px] text-slate-500">Rules-based <Term id="frscore">automated estimate</Term> from each title and abstract — no AI model, no paid service. It will misjudge some items; the reason is always shown so you can check.</p>
          </Panel>
        </div>
      </div>

      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel title="Q-Day reference: needed vs built" icon={<Clock size={14} />} info="frontierQday" bodyClass="p-3" right={<span className="text-[10px] text-slate-500">curated · reviewed {QDAY_REVIEWED}</span>}
          means={<>The bar to break crypto has fallen about 200× since 2019 (20 million → under 100,000 physical qubits for RSA-2048), mostly from smarter algorithms. Hardware is still far short: the best verified computations use ~70 logical qubits versus ~1,200 needed for elliptic curves.</>}>
          <div className="mb-3 grid gap-1.5 sm:grid-cols-2" data-qday-gap>
            {QDAY_GAP.map((g) => <a key={g.label} href={g.src} target="_blank" rel="noreferrer" className="rounded border border-ink-700 bg-ink-850 px-2 py-1.5 hover:border-[#a78bfa]/50"><div className="text-[10px] uppercase tracking-wider text-slate-500">{at(g.label)}</div><div className="mono text-[14px] font-semibold text-white">{g.value}</div><div className="text-[10.5px] text-slate-400">{g.note}</div></a>)}
          </div>
          <table className="w-full text-[11.5px]" data-qday>
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500"><th className="w-[86px] pb-1">Date</th><th className="pb-1">Milestone</th><th className="w-[120px] pb-1">Source</th></tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {[...QDAY_MILESTONES].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
                <tr key={m.date + m.title} className="align-top">
                  <td className="mono py-1.5 pr-2 text-slate-400">{fmtDate(Date.parse(m.date))}</td>
                  <td className="py-1.5 pr-2"><span className="chip mr-1 border text-[9.5px]" style={{ color: m.kind === 'estimate' ? '#ff8a1f' : m.kind === 'hardware' ? VIOLET : m.kind === 'standard' ? '#34d399' : '#3aa0ff', borderColor: '#334155' }}>{m.kind}</span><b className="text-slate-100">{m.title}</b><div className="text-slate-400">{at(m.detail)}</div><div className="text-[10.5px] text-slate-500">→ {m.why}</div></td>
                  <td className="py-1.5">{m.src.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block text-[10.5px] text-cyan-glow hover:underline">{s.label} <ExternalLink size={9} className="inline" /></a>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="At risk vs quantum-safe" icon={<ShieldAlert size={14} />} info="frontierAlgos" bodyClass="p-3"
          means={<>Public-key algorithms (red) need replacing; symmetric encryption and hashes (green / amber) mainly need longer keys. The replacements already exist and are standardised.</>}>
          <table className="w-full text-[11.5px]" data-algos>
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500"><th className="pb-1">Algorithm</th><th className="pb-1">Quantum status</th></tr></thead>
            <tbody className="divide-y divide-ink-700/60">
              {ALGOS.map((a) => {
                const c = a.status === 'broken-by-quantum' ? '#ff2d55' : a.status === 'weakened' ? '#ffc21a' : '#22c55e';
                const I = a.status === 'broken-by-quantum' ? ShieldAlert : a.status === 'weakened' ? ShieldQuestion : ShieldCheck;
                return (
                  <tr key={a.name} className="align-top">
                    <td className="py-1.5 pr-2"><span className="flex items-start gap-1.5"><I size={13} style={{ color: c }} className="mt-0.5 shrink-0" /><span><b className="text-slate-100">{at(a.name)}</b><div className="text-[10.5px] text-slate-500">{a.use}</div></span></span></td>
                    <td className="py-1.5"><span className="chip border text-[10px]" style={{ color: c, borderColor: c + '55' }}>{a.status === 'broken-by-quantum' ? 'Broken by a CRQC' : a.status === 'weakened' ? 'Weakened' : 'Quantum-safe'}</span><div className="text-slate-400">{at(a.quantum)}</div>{a.replace && <div className="text-[10.5px] text-emerald-300/80">Replace with: {at(a.replace)}</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Frontier sources" icon={<Signal size={14} />} info="frontierSources" bodyClass="p-3" feeds={f ? [f] : []}>
        {!srcs.length ? <Offline f={f} what="the Frontier feeds" /> : (
          <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3" data-sources>
            {srcs.map((s: any) => (
              <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded px-1 py-0.5 text-[11.5px] hover:bg-white/[.03]" title={s.error || `${s.count ?? 0} relevant of ${s.scanned ?? '?'} scanned`}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.ok ? '#22c55e' : '#ff2d55' }} />
                <span className="min-w-0 flex-1 truncate text-slate-200">{s.name}</span>
                <span className="text-[10px] text-slate-500">{s.group}</span>
                <span className="mono w-14 text-right text-[10.5px]" style={{ color: s.ok ? '#94a3b8' : '#ff2d55' }}>{s.ok ? `${s.count ?? 0}${s.scanned != null ? '/' + s.scanned : ''}` : 'OFFLINE'}</span>
              </a>
            ))}
          </div>
        )}
        {dropped.length > 0 && (
          <div className="mt-3 border-t border-ink-700/60 pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Considered but not used</div>
            <ul className="grid gap-x-4 gap-y-0.5 text-[11px] text-slate-400 sm:grid-cols-2">{dropped.map((d) => <li key={d.name}><b className="text-slate-300">{d.name}</b> — {d.why}</li>)}</ul>
          </div>
        )}
      </Panel>

      {open && <Drawer x={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Kpi({ label, v, sub, f, color = '#e2e8f0', always }: { label: string; v: string; sub: string; f?: FeedState; color?: string; always?: boolean }) {
  const off = !always && (!f || (!f.data && f.status !== 'live'));
  return (
    <div className="panel flex min-h-[84px] flex-col px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{at(label)}</span>
      {off ? <span className="mt-1 text-[13px] font-semibold" style={{ color: f?.status === 'loading' ? '#64748b' : '#ff2d55' }}>{f?.status === 'loading' ? 'Loading…' : 'OFFLINE'}</span>
        : <span className="mono mt-0.5 text-[22px] font-bold leading-tight" style={{ color }}>{v}</span>}
      <span className="mt-auto text-[10.5px] text-slate-500">{sub}</span>
    </div>
  );
}

function Drawer({ x, onClose }: { x: Item; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-[560px] animate-slidein overflow-y-auto border-l border-ink-600 bg-ink-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} data-drawer="frontier">
        <div className="mb-2 flex items-start gap-2">
          <span className="chip border text-[10px]" style={{ color: CAT_COLOR[x.cat], borderColor: CAT_COLOR[x.cat] + '55' }}>{x.cat}</span>
          <span className="chip border border-ink-500 text-[10px] text-slate-400">automated estimate</span>
          <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <h3 className="mb-2 text-[16px] font-semibold leading-snug text-white">{x.title}</h3>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded border p-2" style={{ borderColor: LVL[x.impact] + '66', background: LVL[x.impact] + '12' }}><div className="text-[10px] uppercase tracking-wider text-slate-400"><Radar size={10} className="mr-1 inline" />Impact</div><div className="mono text-[20px] font-bold" style={{ color: LVL[x.impact] }}>{x.impact}/5 <span className="text-[11px] font-normal text-slate-400">{IMPACT_LABEL[x.impact]}</span></div><p className="text-[11.5px] text-slate-300">{at(x.impactWhy)}</p></div>
          <div className="rounded border p-2" style={{ borderColor: LVL[x.proximity] + '66', background: LVL[x.proximity] + '12' }}><div className="text-[10px] uppercase tracking-wider text-slate-400"><Atom size={10} className="mr-1 inline" />Proximity</div><div className="mono text-[20px] font-bold" style={{ color: LVL[x.proximity] }}>{x.proximity}/5 <span className="text-[11px] font-normal text-slate-400">{PROX_LABEL[x.proximity]}</span></div><p className="text-[11.5px] text-slate-300">{at(x.proxWhy)}</p></div>
        </div>
        {x.notes.length > 0 && <p className="mb-2 text-[11.5px] text-amber-300/90">⚑ {x.notes.join(' · ')}</p>}
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-slate-500">Rank score</dt><dd className="text-slate-200">{x.score} (Impact × Proximity)</dd>
          <dt className="text-slate-500">Targets</dt><dd className="text-slate-200">{x.targets.join(', ') || '—'}</dd>
          <dt className="text-slate-500">Source</dt><dd className="text-slate-200">{x.source}{x.also?.length ? ` (also: ${x.also.join(', ')})` : ''}</dd>
          <dt className="text-slate-500">Published</dt><dd className="text-slate-200">{x.published ? new Date(x.published).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</dd>
        </dl>
        {x.summary && <p className="mt-3 rounded border border-ink-700 bg-ink-850 p-2 text-[12px] leading-relaxed text-slate-300">{x.summary}</p>}
        <a href={x.link} target="_blank" rel="noreferrer" className="btn mt-3"><ExternalLink size={13} /> Open source</a>
        <p className="mt-2 text-[10.5px] text-slate-500">Scores come from SENTINEL keyword rules applied to the title and abstract — not peer review. Check the source before relying on them.</p>
      </aside>
    </div>
  );
}

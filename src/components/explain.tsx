/* Explainers: glossary tooltips (<Term>, <AutoTerms>), panel ⓘ popovers, Explain mode, Glossary drawer and executive summaries. */
import { createContext, Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { BookOpen, ChevronDown, ExternalLink, Info, Lightbulb, Search, X } from 'lucide-react';
import { GLOSS, GLOSSARY, PANELS, type Gloss, type GlossCat } from '../lib/glossary';

// ---------------------------------------------------------------- persisted toggles
function useStored(key: string, initial: boolean): [boolean, (v: boolean | ((b: boolean) => boolean)) => void] {
  const [v, setV] = useState<boolean>(() => { try { const s = localStorage.getItem(key); return s == null ? initial : s === '1'; } catch { return initial; } });
  const set = useCallback((x: boolean | ((b: boolean) => boolean)) => setV((old) => { const n = typeof x === 'function' ? x(old) : x; try { localStorage.setItem(key, n ? '1' : '0'); } catch { /* private mode */ } return n; }), [key]);
  return [v, set];
}

// ---------------------------------------------------------------- context
interface Tip { key: string; rect: DOMRect; body: ReactNode; pinned: boolean }
interface Ctx { explain: boolean; setExplain: (v: boolean | ((b: boolean) => boolean)) => void; openGlossary: (id?: string) => void; show: (t: Tip) => void; hide: (key: string, delay?: number) => void; tipKey: string | null; tipId: string }
const C = createContext<Ctx | null>(null);
export const useExplain = () => {
  const c = useContext(C);
  return c ?? { explain: false, setExplain: () => {}, openGlossary: () => {}, show: () => {}, hide: () => {}, tipKey: null, tipId: '' };
};

export function ExplainProvider({ children }: { children: ReactNode }) {
  const [explain, setExplain] = useStored('sentinel.explain', false);
  const [gl, setGl] = useState<{ open: boolean; focus?: string }>({ open: false });
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number>();
  const tipId = 'sentinel-tip';
  const show = useCallback((t: Tip) => { window.clearTimeout(timer.current); setTip(t); }, []);
  const hide = useCallback((key: string, delay = 0) => {
    window.clearTimeout(timer.current);
    const go = () => setTip((t) => (t && t.key === key && !t.pinned ? null : t));
    if (delay) timer.current = window.setTimeout(go, delay); else go();
  }, []);
  const openGlossary = useCallback((focus?: string) => { setTip(null); setGl({ open: true, focus }); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'Escape') { setTip(null); setGl((g) => (g.open ? { open: false } : g)); }
      if (typing) return;
      if (e.key === '?') { e.preventDefault(); setGl((g) => ({ open: !g.open })); }
    };
    const onDown = (e: PointerEvent) => { const el = e.target as HTMLElement; if (!el.closest?.('[data-tip],[data-term]')) setTip(null); };
    const onScroll = () => setTip((t) => (t && !t.pinned ? null : t));
    window.addEventListener('keydown', onKey); document.addEventListener('pointerdown', onDown); window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); window.removeEventListener('scroll', onScroll, true); };
  }, []);

  const ctx = useMemo<Ctx>(() => ({ explain, setExplain, openGlossary, show, hide, tipKey: tip?.key ?? null, tipId }), [explain, setExplain, openGlossary, show, hide, tip?.key]);
  return (
    <C.Provider value={ctx}>
      {children}
      {tip && createPortal(<TipBox tip={tip} id={tipId} onEnter={() => window.clearTimeout(timer.current)} onLeave={() => hide(tip.key, 150)} />, document.body)}
      {gl.open && createPortal(<GlossaryDrawer focus={gl.focus} onClose={() => setGl({ open: false })} />, document.body)}
    </C.Provider>
  );
}

function TipBox({ tip, id, onEnter, onLeave }: { tip: Tip; id: string; onEnter: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const W = el.offsetWidth, H = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, r = tip.rect;
    const left = Math.max(8, Math.min(vw - W - 8, r.left + r.width / 2 - W / 2));
    const below = r.bottom + 8, above = r.top - H - 8;
    const top = below + H <= vh - 8 || above < 8 ? Math.min(below, vh - H - 8) : above;
    setPos({ left, top: Math.max(8, top) });
  }, [tip]);
  return (
    <div ref={ref} id={id} role="tooltip" data-tip onMouseEnter={onEnter} onMouseLeave={onLeave}
      className="fixed z-[70] w-[min(340px,calc(100vw-16px))] rounded-lg border border-cyan-glow/40 bg-ink-900/[.98] p-3 text-left text-[12px] normal-case leading-relaxed tracking-normal text-slate-300 shadow-[0_10px_40px_rgba(0,0,0,.6),0_0_0_1px_rgba(34,227,255,.08)] backdrop-blur"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
      {tip.body}
    </div>
  );
}

function GlossBody({ g, onGlossary }: { g: Gloss; onGlossary?: () => void }) {
  return (
    <>
      <div className="mb-1 flex items-baseline gap-2"><b className="text-[13px] text-white">{g.term}</b>{g.full && <span className="text-[11px] text-cyan-glow">{g.full}</span>}</div>
      <p className="text-slate-200">{g.meaning}</p>
      <p className="mt-1.5 text-slate-400"><span className="font-semibold text-slate-300">Why it matters here: </span>{g.why}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        {g.link && <a href={g.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-glow hover:underline">Learn more · {new URL(g.link).hostname.replace(/^www\./, '')} <ExternalLink size={11} /></a>}
        {onGlossary && <button onClick={onGlossary} className="inline-flex items-center gap-1 text-slate-400 hover:text-white"><BookOpen size={11} /> Open in glossary</button>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- anchors (term + info icon share one behaviour)
function useAnchor(key: string, body: () => ReactNode) {
  const x = useExplain();
  const ptr = useRef<string>('mouse');
  const open = x.tipKey === key;
  const showAt = (el: HTMLElement, pinned = false) => x.show({ key, rect: el.getBoundingClientRect(), body: body(), pinned });
  return {
    open,
    props: {
      'data-term': true,
      tabIndex: 0,
      role: 'button',
      'aria-expanded': open,
      'aria-describedby': open ? x.tipId : undefined,
      onPointerDown: (e: React.PointerEvent) => { ptr.current = e.pointerType; },
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { if (ptr.current === 'mouse' || ptr.current === '') showAt(e.currentTarget); },
      onMouseLeave: () => x.hide(key, 180),
      onFocus: (e: React.FocusEvent<HTMLElement>) => showAt(e.currentTarget),
      onBlur: (e: React.FocusEvent<HTMLElement>) => { const to = e.relatedTarget as HTMLElement | null; if (!to?.closest?.('[data-tip]')) x.hide(key, 120); },
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        if (ptr.current === 'mouse') { return; } // mouse: hover already shows it; let parent buttons work
        e.preventDefault(); e.stopPropagation();
        if (open) x.hide(key); else showAt(e.currentTarget, true);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (open) x.hide(key); else showAt(e.currentTarget, true); }
        if (e.key === 'Escape') { e.stopPropagation(); x.hide(key); }
      },
    },
  };
}

/** A glossary term with a dotted underline; hover, focus or tap to explain. */
export function Term({ id, children, className }: { id: string; children?: ReactNode; className?: string }) {
  const g = GLOSS[id];
  const uid = useId();
  const x = useExplain();
  const { props } = useAnchor('t' + uid, () => <GlossBody g={g} onGlossary={() => x.openGlossary(id)} />);
  if (!g) return <>{children}</>;
  return <span {...props} data-gloss={id} aria-label={undefined} className={clsx('term', className)}>{children ?? g.term}</span>;
}

/** ⓘ next to a panel title: what the panel shows + how to read it. */
export function InfoTip({ panel, title }: { panel: string; title?: string }) {
  const p = PANELS[panel];
  const uid = useId();
  const { props } = useAnchor('i' + uid, () => (
    <>
      {title && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-glow">{title}</div>}
      <p className="text-slate-200"><span className="font-semibold text-white">What it shows: </span>{p.what}</p>
      <p className="mt-1.5 text-slate-300"><span className="font-semibold text-white">How to read it: </span>{p.read}</p>
      <p className="mt-2 text-[10.5px] text-slate-500">Dotted-underlined words have their own explanations · press ? for the full glossary</p>
    </>
  ));
  if (!p) return null;
  return <span {...props} aria-label="About this panel" data-info={panel} className="inline-flex cursor-help items-center rounded-full text-slate-500 outline-none hover:text-cyan-glow focus-visible:text-cyan-glow focus-visible:ring-1 focus-visible:ring-cyan-glow/60"><Info size={12} /></span>;
}

/** Explain-mode caption under a panel header. */
export function ExplainCaption({ panel }: { panel: string }) {
  const { explain } = useExplain();
  const p = PANELS[panel];
  if (!explain || !p) return null;
  return (
    <div data-explain-caption={panel} className="flex gap-2 border-b border-cyan-glow/20 bg-cyan-glow/[.05] px-3 py-1.5 text-[11px] leading-snug text-slate-300">
      <Lightbulb size={12} className="mt-0.5 shrink-0 text-cyan-glow" />
      <span><b className="text-slate-100">Shows:</b> {p.what} <b className="text-slate-100">Read it:</b> {p.read}</span>
    </div>
  );
}

// ---------------------------------------------------------------- automatic term linking inside strings
const ALIAS: [string, string][] = (() => {
  const out: [string, string][] = [];
  for (const g of GLOSSARY) for (const m of g.match ?? []) {
    out.push([m, g.id]);
    if (/^[a-z]/.test(m)) out.push([m[0].toUpperCase() + m.slice(1), g.id]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
})();
const ALIAS_MAP = new Map(ALIAS);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIAS_RE = new RegExp(`(?<![A-Za-z0-9])(${ALIAS.map(([a]) => esc(a)).join('|')})(?![A-Za-z0-9])`, 'g');

/** Wrap known glossary terms in a plain string (first occurrence of each term only). */
export function AutoTerms({ text, skip }: { text: string; skip?: string[] }) {
  const parts = useMemo(() => {
    const seen = new Set(skip ?? []); const out: ReactNode[] = []; let last = 0;
    for (const m of text.matchAll(ALIAS_RE)) {
      const id = ALIAS_MAP.get(m[1])!; if (seen.has(id)) continue; seen.add(id);
      out.push(text.slice(last, m.index)); out.push(<Term key={m.index} id={id}>{m[1]}</Term>); last = m.index! + m[1].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, skip]);
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
/** Shorthand: string → nodes with terms linked; non-strings pass through. */
export const at = (n: ReactNode) => (typeof n === 'string' ? <AutoTerms text={n} /> : n);

// ---------------------------------------------------------------- header controls
export function ExplainControls() {
  const { explain, setExplain, openGlossary } = useExplain();
  return (
    <>
      <button className={clsx('btn', explain && 'btn-on')} onClick={() => setExplain((v) => !v)} aria-pressed={explain} data-explain-toggle
        title="Explain mode: show plain-English captions and expand every summary">
        <Lightbulb size={14} /> <span className="hidden sm:inline">Explain</span>
      </button>
      <button className="btn" onClick={() => openGlossary()} title="Glossary of every term and abbreviation (?)" aria-label="Open glossary" data-glossary-open>
        <span className="mono text-[13px] font-bold leading-none">?</span>
      </button>
    </>
  );
}

// ---------------------------------------------------------------- glossary drawer
const CATS: GlossCat[] = ['Vulnerabilities', 'Attacks & malware', 'Internet & networks', 'Crypto', 'Statistics', 'Sources', 'This dashboard'];
function GlossaryDrawer({ focus, onClose }: { focus?: string; onClose: () => void }) {
  const [q, setQ] = useState(focus ? GLOSS[focus]?.term ?? '' : '');
  const [cat, setCat] = useState<GlossCat | ''>('');
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GLOSSARY.filter((g) => (!cat || g.cat === cat) && (!s || [g.term, g.full, g.meaning, g.why, ...(g.match ?? [])].some((x) => x?.toLowerCase().includes(s))))
      .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
  }, [q, cat]);
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/50" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Glossary" data-glossary onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[560px] animate-slidein flex-col border-l border-ink-600 bg-ink-900 shadow-2xl">
        <div className="border-b border-ink-700 p-4 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen size={16} className="text-cyan-glow" />
            <h2 className="text-[15px] font-semibold tracking-wide text-white">Glossary</h2>
            <span className="text-[11px] text-slate-500">{GLOSSARY.length} terms · plain English</span>
            <button className="ml-auto text-slate-400 hover:text-white" onClick={onClose} aria-label="Close glossary"><X size={16} /></button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms, e.g. KEV, p-value, bridge…" aria-label="Search glossary"
              className="w-full rounded-md border border-ink-600 bg-ink-850 py-1.5 pl-8 pr-8 text-[12.5px] text-slate-100 placeholder:text-slate-500 focus:border-cyan-glow/60 focus:outline-none" />
            {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" aria-label="Clear search"><X size={12} /></button>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(['', ...CATS] as const).map((c) => <button key={c || 'all'} onClick={() => setCat(c)} className={clsx('rounded border px-1.5 py-0.5 text-[10.5px]', cat === c ? 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow' : 'border-ink-600 text-slate-400 hover:text-white')}>{c || 'All'}</button>)}
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-ink-700/60 overflow-y-auto">
          {list.map((g) => (
            <li key={g.id} id={'gloss-' + g.id} className={clsx('px-4 py-3', g.id === focus && 'bg-cyan-glow/[.06]')}>
              <div className="flex items-baseline gap-2">
                <b className="text-[13.5px] text-white">{g.term}</b>{g.full && <span className="text-[11.5px] text-cyan-glow">{g.full}</span>}
                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-slate-600">{g.cat}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-200">{g.meaning}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-400"><span className="font-semibold text-slate-300">Why it matters here: </span>{g.why}</p>
              {g.link && <a href={g.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-cyan-glow hover:underline">Learn more · {new URL(g.link).hostname.replace(/^www\./, '')} <ExternalLink size={10} /></a>}
            </li>
          ))}
          {!list.length && <li className="p-8 text-center text-[12px] text-slate-500">No matching terms.</li>}
        </ul>
        <div className="border-t border-ink-700 px-4 py-2 text-[10.5px] text-slate-500">Tip: hover, focus or tap any dotted-underlined word for its meaning · press <kbd className="mono rounded border border-ink-600 px-1">?</kbd> to open or close this panel · <kbd className="mono rounded border border-ink-600 px-1">Esc</kbd> closes.</div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- executive summary + panel "what this means"
export interface Summary { now: ReactNode[]; think: ReactNode[]; sowhat: ReactNode[]; basis?: string }

export function ExecSummary({ id, title, s, accent = '#22e3ff' }: { id: string; title: string; s: Summary; accent?: string }) {
  const [open, setOpen] = useStored(`sentinel.summary.${id}`, true);
  const { explain } = useExplain();
  const shown = open || explain;
  return (
    <section data-summary={id} className="panel overflow-hidden" style={{ borderColor: accent + '40' }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={shown} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[.02]">
        <span className="flex h-5 w-5 items-center justify-center rounded" style={{ background: accent + '22', color: accent }}><BookOpen size={12} /></span>
        <span className="text-[11px] font-semibold uppercase tracking-[.16em]" style={{ color: accent }}>Executive summary</span>
        <span className="text-[11px] text-slate-400">· {title}</span>
        {!shown && s.now[0] && <span className="ml-2 hidden min-w-0 flex-1 truncate text-[11.5px] text-slate-300 lg:inline">{s.now[0]}</span>}
        {explain && <span className="chip ml-auto border border-cyan-glow/40 text-cyan-glow">explain mode</span>}
        <ChevronDown size={14} className={clsx('shrink-0 text-slate-500 transition', !explain && 'ml-auto', shown && 'rotate-180')} />
      </button>
      {shown && (
        <div className="grid gap-x-5 gap-y-3 border-t border-ink-700/70 px-3 py-3 text-[12.5px] leading-relaxed text-slate-300 lg:grid-cols-[1.25fr_1fr_.85fr]">
          <div>
            <h3 className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-white"><span className="h-1.5 w-1.5 rounded-full bg-sev-critical shadow-[0_0_6px_#ff2d55]" />Right now</h3>
            {s.now.map((p, i) => <p key={i} className={clsx('mb-1.5', i === 0 && 'text-[13.5px] text-slate-100')}>{at(p)}</p>)}
            {s.basis && <p className="text-[10.5px] text-slate-500">{s.basis}</p>}
          </div>
          <div>
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.14em] text-white">How to think about it</h3>
            {s.think.map((p, i) => <p key={i} className="mb-1.5">{at(p)}</p>)}
          </div>
          <div>
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.14em] text-white">So what</h3>
            <ul className="space-y-1.5">{s.sowhat.slice(0, 3).map((p, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} /><span>{at(p)}</span></li>)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}

/** Collapsible "What this means" strip at the foot of a panel. */
export function Means({ id, children }: { id: string; children: ReactNode }) {
  const [open, setOpen] = useStored(`sentinel.means.${id}`, false);
  const { explain } = useExplain();
  const shown = open || explain;
  return (
    <div data-means={id} className="shrink-0 border-t border-ink-600/60 bg-ink-850/60">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={shown} className="flex w-full items-center gap-1.5 px-3 py-1 text-left text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400 hover:text-white">
        <Lightbulb size={11} className="text-sev-medium" /> What this means
        <ChevronDown size={12} className={clsx('ml-auto transition', shown && 'rotate-180')} />
      </button>
      {shown && <div className="max-h-[132px] overflow-y-auto px-3 pb-2 text-[11.5px] leading-relaxed text-slate-300">{at(children)}</div>}
    </div>
  );
}

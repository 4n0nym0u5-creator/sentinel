import type { Ev } from '../lib/types';
import { SEV_COLOR } from '../lib/sev';
import { ago } from '../lib/format';
export default function Marquee({ events, onPick }: { events: Ev[]; onPick: (e: Ev) => void }) {
  const items = events.filter((e) => e.sev === 'critical' || e.sev === 'high').slice(0, 40);
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div className="relative flex h-8 items-center overflow-hidden border-y border-ink-600 bg-ink-900/90">
      <div className="z-10 flex h-full shrink-0 items-center gap-2 bg-sev-critical px-3 text-[11px] font-bold uppercase tracking-widest text-white shadow-[8px_0_16px_#03060b]"><span className="h-2 w-2 rounded-full bg-white blink" />Live</div>
      <div className="flex animate-marquee whitespace-nowrap hover:[animation-play-state:paused]" style={{ ['--marquee-dur' as any]: `${items.length * 7}s` }}>
        {row.map((e, i) => (
          <button key={i} onClick={() => onPick(e)} className="mx-4 inline-flex items-center gap-2 text-[12px] text-slate-300 hover:text-white">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR[e.sev] }} />
            <span className="font-semibold uppercase tracking-wider" style={{ color: SEV_COLOR[e.sev] }}>{e.source}</span>
            <span>{e.title}{e.type === 'ransomware' ? ` — claimed by ${e.raw.group}` : ''}</span>
            <span className="mono text-slate-500">{ago(e.time)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

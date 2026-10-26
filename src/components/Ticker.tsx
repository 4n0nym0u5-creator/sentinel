import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Zap } from 'lucide-react';
import type { Ev, FeedState } from '../lib/types';
import { Panel, SevBadge, CC } from './ui';
import { SEV_COLOR } from '../lib/sev';
import { ago } from '../lib/format';
import { TYPE_META } from './icons';

export default function Ticker({ events, fresh, onPick, feeds, now }: { events: Ev[]; fresh: Set<string>; onPick: (e: Ev) => void; feeds: FeedState[]; now: number }) {
  const [onlyHot, setOnlyHot] = useState(false);
  const list = useMemo(() => (onlyHot ? events.filter((e) => e.sev === 'critical' || e.sev === 'high') : events).slice(0, 250), [events, onlyHot]);
  return (
    <Panel title={<>Live incident stream <span className="mono text-cyan-glow">{events.length}</span></>} icon={<Zap size={13} className="text-cyan-glow" />} feeds={feeds}
      right={<button className={clsx('btn !px-2 !py-0.5 text-[10px]', onlyHot && 'btn-on')} onClick={() => setOnlyHot((v) => !v)}>High+ only</button>}
      bodyClass="overflow-y-auto thin-scroll">
      {!list.length && <div className="p-6 text-center text-xs text-slate-500">No events match the current filters.</div>}
      <ul className="divide-y divide-ink-700/70">
        {list.map((e) => {
          const M = TYPE_META[e.type];
          const isNew = fresh.has(e.id);
          return (
            <li key={e.id}>
              <button data-ev={e.id} onClick={() => onPick(e)} className={clsx('group flex w-full gap-2.5 px-3 py-2 text-left transition hover:bg-ink-800', isNew && 'animate-slidein bg-sev-critical/5')}>
                <span className="mt-0.5 w-1 shrink-0 self-stretch rounded" style={{ background: SEV_COLOR[e.sev], boxShadow: e.sev === 'critical' ? `0 0 8px ${SEV_COLOR.critical}` : undefined }} />
                <M.Icon size={14} className="mt-0.5 shrink-0" style={{ color: M.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-slate-100 group-hover:text-white">{e.title}</span>
                    {isNew && <span className="chip bg-cyan-glow/15 text-cyan-glow">new</span>}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">{e.subtitle}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <SevBadge sev={e.sev} /> {e.country && <CC cc={e.country} />} <span>{e.source}</span> <span className="ml-auto mono">{ago(e.time, now)}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

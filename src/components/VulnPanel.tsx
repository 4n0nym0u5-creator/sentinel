import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ShieldAlert } from 'lucide-react';
import type { Ev, FeedState } from '../lib/types';
import { Panel, Offline, CvssBadge, EpssBar, SevBadge } from './ui';
import { ago } from '../lib/format';

export default function VulnPanel({ feeds, events, onPick, now }: { feeds: Record<string, FeedState>; events: Ev[]; onPick: (e: Ev) => void; now: number }) {
  const [tab, setTab] = useState<'kev' | 'nvd' | 'euvd'>('kev');
  const list = useMemo(() => events.filter((e) => e.type === 'vuln' && e.raw.kind === tab), [events, tab]);
  const f = feeds[tab];
  const cnt = (k: string) => events.filter((e) => e.type === 'vuln' && e.raw.kind === k).length;
  return (
    <Panel title="Exploited & critical vulnerabilities" icon={<ShieldAlert size={13} className="text-sev-critical" />} feeds={[feeds.kev, feeds.nvd, feeds.euvd]} bodyClass="flex flex-col">
      <div className="flex gap-1 border-b border-ink-700 px-2 py-1">
        {([['kev', 'CISA KEV'], ['nvd', 'NVD critical'], ['euvd', 'ENISA EUVD']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('btn !px-2 !py-0.5 text-[10px]', tab === k && 'btn-on')}>{l} <span className="mono opacity-70">{cnt(k)}</span></button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scroll">
        {!f.data ? <Offline f={f} what={f.label} /> : !list.length ? <div className="p-6 text-center text-xs text-slate-500">Nothing in this time window. Try widening the filter.</div> : (
          <ul className="divide-y divide-ink-700/70">
            {list.slice(0, 120).map((e) => {
              const v = e.raw;
              return (
                <li key={e.id}>
                  <button onClick={() => onPick(e)} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-ink-800">
                    <div className="pt-0.5">{tab === 'kev' ? <SevBadge sev={e.sev} /> : <CvssBadge score={v.score} />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="mono text-[11.5px] font-semibold text-white">{tab === 'euvd' ? v.cve || v.id : v.id}</span>
                        {v.ransomware && <span className="chip bg-sev-critical/15 text-sev-critical">ransomware</span>}
                        {v.kev && <span className="chip bg-sev-critical/15 text-sev-critical">KEV</span>}
                        {tab === 'euvd' && <span className="chip bg-ink-700 text-slate-300">{v.kindTag}</span>}
                        <span className="ml-auto mono text-[10px] text-slate-500">{ago(e.time, now)}</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-300">{tab === 'kev' ? `${v.vendor} ${v.product} — ${v.name}` : e.subtitle}</div>
                      <div className="mt-0.5 flex items-center gap-3"><EpssBar v={v.epss} />{tab === 'kev' && <span className="text-[10px] text-slate-500">due {v.dueDate}</span>}{tab === 'nvd' && v.cwe && <span className="mono text-[10px] text-slate-500">{v.cwe}</span>}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

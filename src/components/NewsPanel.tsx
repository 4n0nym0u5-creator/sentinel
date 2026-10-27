import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Newspaper } from 'lucide-react';
import type { Ev, FeedState } from '../lib/types';
import { Panel, Offline, SevBadge, CC } from './ui';
import { ago } from '../lib/format';

export default function NewsPanel({ feed, events, onPick, now, means }: { feed: FeedState; events: Ev[]; onPick: (e: Ev) => void; now: number; means?: ReactNode }) {
  const [src, setSrc] = useState('All');
  const news = useMemo(() => events.filter((e) => e.type === 'news'), [events]);
  const sources = useMemo(() => ['All', ...feed.sources.map((s) => s.name)], [feed.sources]);
  const list = src === 'All' ? news : news.filter((e) => e.source === src || e.raw.sources?.includes(src));
  return (
    <Panel info="news" means={means} title={<>Intel, news & advisories <span className="mono text-violet-400">{news.length}</span></>} icon={<Newspaper size={13} className="text-violet-400" />} feeds={[feed]}
      right={<select value={src} onChange={(e) => setSrc(e.target.value)} className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[10px] text-slate-300">{sources.map((s) => {
        const st = feed.sources.find((x) => x.name === s);
        return <option key={s} value={s}>{s}{st && !st.ok ? ' (offline)' : ''}</option>;
      })}</select>}
      bodyClass="overflow-y-auto thin-scroll">
      {!feed.data ? <Offline f={feed} what="news feeds" /> : (
        <ul className="divide-y divide-ink-700/70">
          {list.slice(0, 120).map((e) => (
            <li key={e.id}>
              <button onClick={() => onPick(e)} className="block w-full px-3 py-2 text-left hover:bg-ink-800">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500"><SevBadge sev={e.sev} /><span className="font-semibold text-violet-300">{e.source}</span>{(e.raw.countries || []).slice(0, 3).map((c: string) => <CC key={c} cc={c} />)}{e.raw.related && <span className="chip bg-violet-500/15 text-violet-300" title="Reports of the same incident from several sources, grouped — open for the timeline">{e.raw.sources.length} sources · {e.raw.related.length} reports</span>}{e.raw.lang && <span className="chip bg-ink-700 text-slate-400 uppercase">{e.raw.lang}</span>}<span className="ml-auto mono">{ago(e.time, now)}</span></div>
                <div className="mt-0.5 line-clamp-2 text-[12.5px] font-medium leading-snug text-slate-100">{e.title}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

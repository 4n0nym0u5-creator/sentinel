import { at } from './explain';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Area, AreaChart, Bar as RBar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skull } from 'lucide-react';
import type { Ev, FeedState } from '../lib/types';
import { Panel, Offline, CC, Bar } from './ui';
import { cname } from '../lib/countries';
import { CI_SECTORS } from '../lib/model';

const PAL = ['#ff2d55', '#ff7a1a', '#ffc21a', '#22e3ff', '#3aa0ff', '#a78bfa', '#f472b6', '#34d399', '#94a3b8', '#64748b'];
const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const TT = { contentStyle: { background: '#09101b', border: '1px solid #2a4062', borderRadius: 6, fontSize: 11 }, itemStyle: { color: '#e2e8f0' }, labelStyle: { color: '#94a3b8' } };

export default function RansomwarePanel({ feed, events, onCountry, onPick, onGroup, means }: { feed: FeedState; events: Ev[]; onCountry: (cc: string) => void; onPick: (e: Ev) => void; onGroup: (g: string) => void; means?: ReactNode }) {
  const [tab, setTab] = useState<'groups' | 'sectors' | 'countries' | 'latest'>('groups');
  const rw = useMemo(() => events.filter((e) => e.type === 'ransomware'), [events]);
  const all = (feed.data?.items || []) as any[];
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of all) { const d = v.discovered.slice(0, 10); m.set(d, (m.get(d) || 0) + 1); }
    return [...m.entries()].sort().slice(-30).map(([d, n]) => ({ d: d.slice(5), n }));
  }, [all]);
  const agg = useMemo(() => {
    const g = new Map<string, number>(), s = new Map<string, number>(), c = new Map<string, number>();
    for (const e of rw) { const v = e.raw; g.set(v.group, (g.get(v.group) || 0) + 1); s.set(v.sector, (s.get(v.sector) || 0) + 1); if (v.country) c.set(v.country, (c.get(v.country) || 0) + 1); }
    return { groups: top(g, 12), sectors: top(s, 10), countries: top(c, 14) };
  }, [rw]);
  if (!feed.data) return <Panel info="ransomware" title="Ransomware leak-site activity" icon={<Skull size={13} className="text-sev-high" />} feeds={[feed]}><Offline f={feed} what="ransomware.live" /></Panel>;
  return (
    <Panel info="ransomware" means={means} title={<>{at('Ransomware leak-site activity')} <span className="mono text-sev-high">{rw.length}</span></>} icon={<Skull size={13} className="text-sev-high" />} feeds={[feed]} bodyClass="flex flex-col">
      <div className="h-[84px] px-1 pt-1">
        <ResponsiveContainer>
          <AreaChart data={daily} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
            <defs><linearGradient id="rwg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7a1a" stopOpacity={0.55} /><stop offset="1" stopColor="#ff7a1a" stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="d" tick={{ fontSize: 9, fill: '#64748b' }} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip {...TT} formatter={(v: any) => [v, 'victims claimed']} />
            <Area type="monotone" dataKey="n" stroke="#ff7a1a" strokeWidth={2} fill="url(#rwg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-1 border-y border-ink-700 px-2 py-1">
        {(['groups', 'sectors', 'countries', 'latest'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={clsx('btn !px-2 !py-0.5 text-[10px] capitalize', tab === t && 'btn-on')}>{t}</button>)}
        <span className="ml-auto self-center text-[10px] text-slate-500">in current filter</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scroll px-3 py-2">
        {tab === 'groups' && (
          <div className="h-full min-h-[200px]">
            <ResponsiveContainer>
              <BarChart data={agg.groups.map(([k, v]) => ({ k, v }))} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="k" interval={0} width={110} tick={{ fontSize: 10, fill: '#cbd5e1' }} axisLine={false} tickLine={false} />
                <Tooltip {...TT} cursor={{ fill: '#13203388' }} formatter={(v: any) => [v, 'victims']} />
                <RBar dataKey="v" radius={[0, 3, 3, 0]} onClick={(d: any) => onGroup(d.k)} className="cursor-pointer" label={{ position: 'right', fill: '#94a3b8', fontSize: 10 }}>
                  {agg.groups.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {tab === 'sectors' && (
          <div className="flex h-full min-h-[200px] items-center gap-2">
            <div className="h-full min-h-[180px] w-1/2">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={agg.sectors.map(([k, v]) => ({ k, v }))} dataKey="v" nameKey="k" innerRadius="52%" outerRadius="88%" paddingAngle={2} stroke="#060b13">
                    {agg.sectors.map(([k], i) => <Cell key={k} fill={CI_SECTORS.test(k) ? '#ff2d55' : PAL[(i + 1) % PAL.length]} />)}
                  </Pie>
                  <Tooltip {...TT} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-1/2 space-y-1 text-[11px]">
              {agg.sectors.map(([k, v], i) => (
                <li key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: CI_SECTORS.test(k) ? '#ff2d55' : PAL[(i + 1) % PAL.length] }} /><span className="truncate text-slate-300">{k}</span><span className="mono ml-auto text-slate-400">{v}</span></li>
              ))}
              <li className="pt-1 text-[9.5px] text-slate-500">Red = critical-infrastructure-type sector</li>
            </ul>
          </div>
        )}
        {tab === 'countries' && (
          <ul className="space-y-1.5">
            {agg.countries.map(([cc, v]) => (
              <li key={cc}><button className="flex w-full items-center gap-2 text-left text-[11.5px] hover:text-white" onClick={() => onCountry(cc)}>
                <CC cc={cc} /><span className="w-28 truncate text-slate-300">{cname(cc)}</span><span className="flex-1"><Bar value={v} max={agg.countries[0]?.[1] || 1} color="#ff7a1a" /></span><span className="mono w-8 text-right text-slate-400">{v}</span>
              </button></li>
            ))}
          </ul>
        )}
        {tab === 'latest' && (
          <ul className="divide-y divide-ink-700">
            {rw.slice(0, 60).map((e) => (
              <li key={e.id}><button className="flex w-full items-center gap-2 py-1 text-left text-[11.5px] hover:text-white" onClick={() => onPick(e)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.sev === 'critical' ? '#ff2d55' : '#ff7a1a' }} /><CC cc={e.country} /><span className="flex-1 truncate text-slate-200">{e.title}</span><span className="truncate text-[10px] text-slate-500">{e.raw.group}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

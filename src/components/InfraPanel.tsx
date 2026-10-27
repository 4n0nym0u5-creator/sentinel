import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bar as RBar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart, Area } from 'recharts';
import { Crosshair } from 'lucide-react';
import type { Ev, FeedState } from '../lib/types';
import { Panel, Offline, CC, Bar } from './ui';
import { PORTS, fmt } from '../lib/format';

const TT = { contentStyle: { background: '#09101b', border: '1px solid #2a4062', borderRadius: 6, fontSize: 11 }, itemStyle: { color: '#e2e8f0' }, labelStyle: { color: '#94a3b8' } };
const ICS = new Set([502, 102, 47808, 20000, 44818, 1911]);

export default function InfraPanel({ feeds, events, onPick, onCountry, means }: { feeds: Record<string, FeedState>; events: Ev[]; onPick: (e: Ev) => void; onCountry: (cc: string) => void; means?: ReactNode }) {
  const [tab, setTab] = useState<'ports' | 'sources' | 'c2' | 'trend'>('ports');
  const ds = feeds.dshield.data;
  const att = useMemo(() => events.filter((e) => e.type === 'attack'), [events]);
  const c2 = useMemo(() => events.filter((e) => e.type === 'c2'), [events]);
  const ioc = useMemo(() => events.filter((e) => e.type === 'ioc'), [events]);
  const fams = useMemo(() => {
    const m = new Map<string, { n: number; src: Set<string> }>();
    for (const e of [...c2, ...ioc]) { const k = e.raw.malware || 'unknown'; const r = m.get(k) || { n: 0, src: new Set() }; r.n++; r.src.add(e.source); m.set(k, r); }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  }, [c2, ioc]);
  const byCountry = useMemo(() => { const m = new Map<string, number>(); att.forEach((e) => e.country && m.set(e.country, (m.get(e.country) || 0) + e.raw.attacks)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); }, [att]);
  return (
    <Panel info="infra" means={means} title="Attack infrastructure & malware" icon={<Crosshair size={13} className="text-sev-low" />} feeds={[feeds.dshield, feeds.c2, feeds.threatfox]} bodyClass="flex flex-col">
      <div className="flex gap-1 border-b border-ink-700 px-2 py-1">
        {([['ports', 'Targeted ports'], ['sources', 'Attack sources'], ['c2', 'C2 & malware'], ['trend', 'Sensor trend']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('btn !px-2 !py-0.5 text-[10px]', tab === k && 'btn-on')}>{l}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scroll px-3 py-2">
        {tab === 'ports' && (!ds ? <Offline f={feeds.dshield} what="DShield" /> : (
          <div className="h-full min-h-[220px]">
            <ResponsiveContainer>
              <BarChart data={ds.ports.map((p: any) => ({ k: `${p.port} ${PORTS[p.port] || ''}`.trim(), v: p.records, s: p.sources, port: p.port }))} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="k" interval={0} width={116} tick={{ fontSize: 10, fill: '#cbd5e1' }} axisLine={false} tickLine={false} />
                <Tooltip {...TT} cursor={{ fill: '#13203388' }} formatter={(v: any, _n: any, p: any) => [`${fmt(v)} reports · ${fmt(p.payload.s)} sources`, 'today']} />
                <RBar dataKey="v" radius={[0, 3, 3, 0]} label={{ position: 'right', fill: '#94a3b8', fontSize: 9.5, formatter: (v: any) => fmt(v) }}>
                  {ds.ports.map((p: any, i: number) => <Cell key={i} fill={ICS.has(p.port) ? '#ff2d55' : i < 3 ? '#3aa0ff' : '#2a6fb3'} />)}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
        {tab === 'sources' && (!ds ? <Offline f={feeds.dshield} what="DShield" /> : (
          <>
            <div className="mb-2 flex flex-wrap gap-1">{byCountry.map(([cc, n]) => <button key={cc} onClick={() => onCountry(cc)} className="chip border border-ink-500 bg-ink-800 text-slate-300 hover:border-cyan-glow/50">{cc} <span className="mono text-slate-500">{fmt(n)}</span></button>)}</div>
            <table className="w-full text-[11px]">
              <thead className="text-[9.5px] uppercase tracking-wider text-slate-500"><tr><th className="text-left">#</th><th className="text-left">IP</th><th>AS cc</th><th className="text-left">Network</th><th className="text-right">Targets</th></tr></thead>
              <tbody>
                {att.map((e) => (
                  <tr key={e.id} className="cursor-pointer border-t border-ink-700/70 hover:bg-ink-800" onClick={() => onPick(e)}>
                    <td className="mono py-1 text-slate-500">{e.raw.rank}</td><td className="mono text-slate-200">{e.raw.ip}</td><td className="text-center"><CC cc={e.country} /></td>
                    <td className="max-w-[120px] truncate text-slate-400">{e.raw.asname}</td><td className="mono text-right text-sev-low">{fmt(e.raw.attacks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[9.5px] text-slate-500">Country = registration country of the source IP's autonomous system (SANS ISC IP API), not attribution.</p>
          </>
        ))}
        {tab === 'c2' && (
          <>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Malware families (C2 + IOCs)</div>
            {fams.length ? <ul className="mb-3 space-y-1">{fams.map(([k, r]) => (
              <li key={k} className="flex items-center gap-2 text-[11.5px]"><span className="w-28 truncate text-slate-200">{k}</span><span className="flex-1"><Bar value={r.n} max={fams[0][1].n} color="#ff2d55" /></span><span className="mono w-8 text-right text-slate-400">{r.n}</span><span className="w-20 truncate text-[9.5px] text-slate-500">{[...r.src].join(', ')}</span></li>
            ))}</ul> : <p className="mb-3 text-[11px] text-slate-500">No families in filter.</p>}
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Feodo Tracker botnet C2 servers</div>
            {!feeds.c2.data ? <Offline f={feeds.c2} what="Feodo Tracker" /> : (
              <ul className="space-y-1">{c2.map((e) => (
                <li key={e.id}><button onClick={() => onPick(e)} className="flex w-full items-center gap-2 text-left text-[11px] hover:text-white">
                  <span className={clsx('h-2 w-2 rounded-full', e.raw.status === 'online' ? 'bg-sev-critical animate-pulsered' : 'bg-slate-600')} />
                  <span className="mono text-slate-200">{e.raw.ip}:{e.raw.port}</span><CC cc={e.country} /><span className="text-slate-300">{e.raw.malware}</span><span className="ml-auto text-[10px] text-slate-500">{e.raw.status} · last {e.raw.lastOnline}</span>
                </button></li>
              ))}</ul>
            )}
            {!feeds.threatfox.data && (
              <div className="mt-3 rounded border border-dashed border-ink-500 p-2 text-[10.5px] text-slate-400">
                <span className="chip mr-1 bg-sev-medium/15 text-sev-medium">ThreatFox offline</span>{feeds.threatfox.error || 'Not connected'}
              </div>
            )}
          </>
        )}
        {tab === 'trend' && (!ds?.daily?.length ? <Offline f={feeds.dshield} what="DShield daily summary" /> : (
          <div className="h-full min-h-[220px]">
            <div className="text-[10px] text-slate-500">DShield sensor reports per day (last 14 days; today is partial)</div>
            <ResponsiveContainer height="88%">
              <AreaChart data={ds.daily.map((d: any) => ({ ...d, d: d.date.slice(5) }))} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <defs><linearGradient id="dsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3aa0ff" stopOpacity={0.55} /><stop offset="1" stopColor="#3aa0ff" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="d" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip {...TT} formatter={(v: any, n: any) => [fmt(v), n]} />
                <Area type="monotone" dataKey="records" stroke="#3aa0ff" strokeWidth={2} fill="url(#dsg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </Panel>
  );
}

import { at } from './explain';
import type { ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Skull, Bug, ShieldAlert, Radio, Crosshair, Siren, Activity } from 'lucide-react';
import clsx from 'clsx';
import type { Ev, FeedState } from '../lib/types';
import { fmt } from '../lib/format';
import { PORTS } from '../lib/format';

function Tile({ icon, label, value, sub, color, spark, alert, offline, onClick }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; color: string; spark?: number[]; alert?: boolean; offline?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={clsx('panel group flex min-w-0 flex-col overflow-hidden px-3 py-2 text-left transition hover:border-cyan-glow/40', alert && 'animate-pulsered border-sev-critical/60')}>
      <div className="flex items-center justify-between"><span className="panel-title !text-[10px]" style={{ color }}>{icon}{at(label)}</span>{offline && <span className="chip bg-sev-critical/15 text-sev-critical">offline</span>}</div>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <div className="mono text-[26px] font-semibold leading-none text-white" style={{ textShadow: `0 0 18px ${color}55` }}>{offline ? '—' : value}</div>
        {spark && spark.length > 1 && !offline && (
          <div className="h-8 w-24 opacity-90">
            <ResponsiveContainer><AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <defs><linearGradient id={`sp${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.6} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sp${label.replace(/\W/g, '')})`} isAnimationActive={false} />
            </AreaChart></ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-1 truncate text-[10.5px] text-slate-400">{at(sub)}</div>
    </button>
  );
}

const DAY = 86400_000;
export default function Kpis({ feeds, events, windowMs, onType }: { feeds: Record<string, FeedState>; events: Ev[]; windowMs: number; onType: (t: string) => void }) {
  const now = Date.now();
  const rw = (feeds.ransomware.data?.items || []) as any[];
  const rwIn = rw.filter((v) => now - Date.parse(v.discovered) < windowMs).length;
  const rwPrev = rw.filter((v) => { const d = now - Date.parse(v.discovered); return d >= windowMs && d < 2 * windowMs; }).length;
  const daily = Array.from({ length: 30 }, (_, i) => rw.filter((v) => { const d = now - Date.parse(v.discovered); return d >= (29 - i) * DAY && d < (30 - i) * DAY; }).length);
  const delta = windowMs <= 15 * DAY && rwPrev ? Math.round(((rwIn - rwPrev) / rwPrev) * 100) : null;
  const kev = (feeds.kev.data?.items || []) as any[];
  const kevIn = kev.filter((v) => now - Date.parse(v.dateAdded) < Math.max(windowMs, DAY)).length;
  const kevWeekly = Array.from({ length: 12 }, (_, i) => kev.filter((v) => { const d = now - Date.parse(v.dateAdded); return d >= (11 - i) * 7 * DAY && d < (12 - i) * 7 * DAY; }).length);
  const nvd = (feeds.nvd.data?.items || []) as any[];
  const nvdIn = nvd.filter((v) => now - Date.parse(v.published) < windowMs);
  const hot = nvdIn.filter((v) => (v.epss ?? 0) >= 0.1).length;
  const c2 = (feeds.c2.data?.items || []) as any[];
  const c2on = c2.filter((v) => v.status === 'online').length;
  const ds = feeds.dshield.data;
  const top = ds?.ports?.[0];
  const crit = events.filter((e) => e.sev === 'critical').length;
  const icon = ds?.infocon as string | undefined;
  const icColor: Record<string, string> = { green: '#22c55e', yellow: '#ffc21a', orange: '#ff7a1a', red: '#ff2d55' };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
      <Tile icon={<Siren size={12} />} label="Critical events" value={fmt(crit)} color="#ff2d55" alert={crit > 0} sub={`${fmt(events.length)} events in filter`} onClick={() => onType('critical')} />
      <Tile icon={<Skull size={12} />} label="Ransomware victims" value={fmt(rwIn)} color="#ff7a1a" spark={daily} offline={!feeds.ransomware.data}
        sub={delta == null ? `30-day: ${fmt(rw.length)} claims` : <span>{delta >= 0 ? '▲' : '▼'} <span className={delta > 0 ? 'text-sev-critical' : 'text-emerald-400'}>{Math.abs(delta)}%</span> vs prior window</span>} onClick={() => onType('ransomware')} />
      <Tile icon={<ShieldAlert size={12} />} label="KEV added" value={fmt(kevIn)} color="#ff2d55" spark={kevWeekly} offline={!feeds.kev.data} sub={`Catalogue: ${fmt(feeds.kev.data?.total)} · v${feeds.kev.data?.catalogVersion ?? '—'}`} onClick={() => onType('vuln')} />
      <Tile icon={<Bug size={12} />} label="Critical CVEs" value={fmt(nvdIn.length)} color="#ffc21a" offline={!feeds.nvd.data} sub={`${hot} with EPSS ≥ 10% · NVD 30d: ${fmt(feeds.nvd.data?.total)}`} onClick={() => onType('vuln')} />
      <Tile icon={<Radio size={12} />} label="Botnet C2 online" value={`${c2on}/${c2.length}`} color="#ff7a1a" offline={!feeds.c2.data} sub={`Feodo Tracker · ${[...new Set(c2.map((c) => c.malware))].join(', ') || '—'}`} onClick={() => onType('c2')} />
      <Tile icon={<Crosshair size={12} />} label="Top attacked port" value={top ? `${top.port}` : '—'} color="#3aa0ff" offline={!ds}
        spark={(ds?.daily || []).slice(0, -1).map((d: any) => d.records)} sub={top ? `${PORTS[top.port] || 'tcp'} · ${fmt(top.records)} reports · ${fmt(top.sources)} sources` : ''} onClick={() => onType('attack')} />
      <Tile icon={<Activity size={12} />} label="ISC Infocon" value={<span style={{ color: icon ? icColor[icon] : undefined }}>{icon?.toUpperCase() ?? '—'}</span>} color={icon ? icColor[icon] : '#7d8ca3'} offline={!ds}
        sub={ds?.daily?.length ? `${fmt(ds.daily[ds.daily.length - 2]?.records)} sensor reports yesterday` : 'SANS Internet Storm Center'} />
    </div>
  );
}

import { useMemo } from 'react';
import { X, ExternalLink, MapPin } from 'lucide-react';
import type { Ev, FeedState, Sev } from '../lib/types';
import { SevBadge, CvssBadge, EpssBar, CC, Bar, STATUS_COLOR } from './ui';
import { TYPE_META } from './icons';
import { COUNTRIES, cname } from '../lib/countries';
import { ago, dt, dUTC, fmt } from '../lib/format';
import type { CollectorState } from '../lib/useCollector';
import { SEV_COLOR } from '../lib/sev';
import type { CountryAgg } from './WorldMap';

function Shell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
      <aside className={`panel h-full ${wide ? 'w-[620px]' : 'w-[480px]'} max-w-full animate-slidein overflow-y-auto thin-scroll rounded-none border-y-0 border-r-0 !bg-ink-900/97`} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="btn absolute right-3 top-3 z-10 !p-1.5"><X size={14} /></button>
        {children}
      </aside>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => v == null || v === '' ? null : <div className="grid grid-cols-[120px_1fr] gap-2 border-t border-ink-700/70 py-1.5 text-[12px]"><span className="text-slate-500">{k}</span><span className="break-words text-slate-200">{v}</span></div>;

export function DetailDrawer({ e, onClose, onCountry }: { e: Ev; onClose: () => void; onCountry: (cc: string) => void }) {
  const M = TYPE_META[e.type];
  const v = e.raw;
  return (
    <Shell onClose={onClose}>
      <div className="border-b border-ink-600 p-4 pr-12" style={{ background: `linear-gradient(135deg, ${SEV_COLOR[e.sev]}22, transparent 60%)` }}>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: M.color }}><M.Icon size={14} /> {M.label} <SevBadge sev={e.sev} /></div>
        <h3 className="text-lg font-semibold leading-snug text-white">{e.title}</h3>
        <p className="mt-1 text-xs text-slate-400">{e.source} · {ago(e.time)} · {dUTC(e.time)}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="rounded border border-ink-600 bg-ink-850 p-2 text-[11px] text-slate-300"><span className="font-semibold text-slate-400">Why this severity: </span>{e.sevReason}</div>
        {e.subtitle && e.type !== 'vuln' && <p className="text-[13px] leading-relaxed text-slate-300">{e.subtitle}</p>}
        <div>
          {e.type === 'ransomware' && (<>
            <Row k="Victim" v={v.victim} /><Row k="Group" v={v.group} /><Row k="Sector" v={v.sector} /><Row k="Website" v={v.website} />
            <Row k="Discovered" v={`${dt(v.discovered)} (${ago(v.discovered)})`} /><Row k="Leak-site date" v={v.published ? dt(v.published) : null} />
            <Row k="Description" v={v.desc} />
            <p className="mt-2 text-[10.5px] text-slate-500">This is a claim posted on a ransomware leak site, as tracked by ransomware.live. Claims are not independently verified.</p>
          </>)}
          {e.type === 'vuln' && (<>
            <Row k="ID" v={<span className="mono">{v.id}{v.cve && v.cve !== v.id ? ` / ${v.cve}` : ''}</span>} />
            {v.kind === 'kev' && (<><Row k="Vendor / product" v={`${v.vendor} ${v.product}`} /><Row k="Name" v={v.name} /><Row k="Added to KEV" v={v.dateAdded} /><Row k="Federal due date" v={v.dueDate} />
              <Row k="Ransomware use" v={v.ransomware ? <span className="text-sev-critical">Known</span> : 'Unknown'} /><Row k="CWE" v={v.cwes?.join(', ')} /><Row k="Required action" v={v.action} /></>)}
            {v.score != null && <Row k="CVSS" v={<span className="flex items-center gap-2"><CvssBadge score={v.score} /><span className="mono text-[10.5px] text-slate-400">{v.vector || v.scoreVersion}</span></span>} />}
            <Row k="EPSS" v={<EpssBar v={v.epss} />} />
            {v.cwe && <Row k="Weakness" v={v.cwe} />}{v.vendor && v.kind === 'euvd' && <Row k="Vendor" v={v.vendor} />}{v.status && <Row k="NVD status" v={v.status} />}
            <Row k="Description" v={v.desc} />{v.ref && <Row k="Reference" v={<a className="text-cyan-glow hover:underline" href={v.ref} target="_blank" rel="noreferrer">{v.ref}</a>} />}
          </>)}
          {e.type === 'c2' && (<><Row k="IP:port" v={<span className="mono">{v.ip}:{v.port}</span>} /><Row k="Malware" v={v.malware} /><Row k="Status" v={v.status} /><Row k="ASN" v={`AS${v.asn} ${v.asName || ''}`} /><Row k="First seen" v={dt(v.firstSeen)} /><Row k="Last online" v={v.lastOnline} /></>)}
          {e.type === 'attack' && (<><Row k="IP" v={<span className="mono">{v.ip}</span>} /><Row k="Rank" v={`#${v.rank} in DShield top sources`} /><Row k="Targets hit" v={fmt(v.attacks)} /><Row k="Reports" v={fmt(v.reports)} /><Row k="Network" v={`AS${v.asn ?? '?'} ${v.asname || ''}`} /><Row k="First / last seen" v={`${v.firstSeen} → ${v.lastSeen}`} />
            <p className="mt-2 text-[10.5px] text-slate-500">Location is the AS registration country from SANS ISC — not attribution of the actor.</p></>)}
          {e.type === 'ioc' && (<><Row k="IOC" v={<span className="mono break-all">{v.ioc}</span>} /><Row k="Type" v={v.type} /><Row k="Threat" v={v.threat} /><Row k="Malware" v={v.malware} /><Row k="Confidence" v={`${v.confidence}%`} /><Row k="Tags" v={v.tags?.join(', ')} /></>)}
          {e.type === 'news' && (<><Row k="Published" v={dt(v.published)} /><Row k="Tags" v={v.tags?.join(', ')} /><Row k="Countries mentioned" v={v.countries?.length ? v.countries.map(cname).join(', ') : null} /></>)}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {e.link && <a className="btn btn-on" href={e.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open source</a>}
          {e.country && <button className="btn" onClick={() => onCountry(e.country!)}><MapPin size={13} /> {cname(e.country)} drill-down</button>}
        </div>
      </div>
    </Shell>
  );
}

export function CountryDrawer({ cc, events, agg, onClose, onPick }: { cc: string; events: Ev[]; agg?: CountryAgg; onClose: () => void; onPick: (e: Ev) => void }) {
  const c = COUNTRIES[cc];
  const list = useMemo(() => events.filter((e) => e.country === cc || (e.type === 'news' && e.raw.countries?.includes(cc))), [events, cc]);
  const rw = list.filter((e) => e.type === 'ransomware');
  const groups = useMemo(() => { const m = new Map<string, number>(); rw.forEach((e) => m.set(e.raw.group, (m.get(e.raw.group) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); }, [rw]);
  const sectors = useMemo(() => { const m = new Map<string, number>(); rw.forEach((e) => m.set(e.raw.sector, (m.get(e.raw.sector) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); }, [rw]);
  const by = (t: string) => list.filter((e) => e.type === t).length;
  return (
    <Shell onClose={onClose} wide>
      <div className="border-b border-ink-600 p-4 pr-12" style={{ background: `linear-gradient(135deg, ${agg ? SEV_COLOR[agg.maxSev] : '#22e3ff'}26, transparent 60%)` }}>
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-slate-400"><MapPin size={13} /> Country drill-down · {c?.s || c?.r}</div>
        <h3 className="flex items-center gap-2 text-2xl font-semibold text-white">{cname(cc)} <CC cc={cc} /></h3>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {([['ransomware', 'Ransomware'], ['attack', 'Attack srcs'], ['c2', 'C2 servers'], ['news', 'News']] as const).map(([t, l]) => (
            <div key={t} className="rounded border border-ink-600 bg-ink-850 px-2 py-1.5"><div className="text-[9.5px] uppercase tracking-wider text-slate-500">{l}</div><div className="mono text-xl font-semibold" style={{ color: TYPE_META[t].color }}>{by(t)}</div></div>
          ))}
        </div>
        {agg && <div className="mt-2 flex gap-1">{(['critical', 'high', 'medium', 'low'] as Sev[]).map((s) => <span key={s} className="chip" style={{ background: SEV_COLOR[s] + '22', color: SEV_COLOR[s] }}>{s} {agg.bySev[s]}</span>)}</div>}
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ransomware groups</div>
          {groups.length ? groups.map(([g, n]) => <div key={g} className="mb-1 flex items-center gap-2 text-[11.5px]"><span className="w-24 truncate text-slate-300">{g}</span><span className="flex-1"><Bar value={n} max={groups[0][1]} color="#ff7a1a" /></span><span className="mono text-slate-400">{n}</span></div>) : <p className="text-[11px] text-slate-500">None in filter</p>}
        </div>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sectors hit</div>
          {sectors.length ? sectors.map(([g, n]) => <div key={g} className="mb-1 flex items-center gap-2 text-[11.5px]"><span className="w-24 truncate text-slate-300">{g}</span><span className="flex-1"><Bar value={n} max={sectors[0][1]} color="#ff2d55" /></span><span className="mono text-slate-400">{n}</span></div>) : <p className="text-[11px] text-slate-500">None in filter</p>}
        </div>
      </div>
      <div className="px-4 pb-6">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">All events ({list.length})</div>
        <ul className="divide-y divide-ink-700/70 rounded border border-ink-700">
          {list.slice(0, 200).map((e) => { const M = TYPE_META[e.type]; return (
            <li key={e.id}><button onClick={() => onPick(e)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-ink-800">
              <span className="h-6 w-1 rounded" style={{ background: SEV_COLOR[e.sev] }} /><M.Icon size={13} style={{ color: M.color }} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[12px] text-slate-100">{e.title}</span><span className="block truncate text-[10.5px] text-slate-500">{e.subtitle}</span></span>
              <span className="mono shrink-0 text-[10px] text-slate-500">{ago(e.time)}</span>
            </button></li>
          ); })}
          {!list.length && <li className="p-4 text-center text-xs text-slate-500">No events for this country in the current filter.</li>}
        </ul>
      </div>
    </Shell>
  );
}

export function FeedHealth({ feeds, onClose, onRefresh, now, collector }: { feeds: FeedState[]; onClose: () => void; onRefresh: () => void; now: number; collector?: CollectorState }) {
  return (
    <Shell onClose={onClose} wide>
      <div className="border-b border-ink-600 p-4 pr-12">
        <h3 className="text-lg font-semibold text-white">Feed health</h3>
        <p className="text-xs text-slate-400">Every panel is driven by these public sources. If a source fails it shows OFFLINE — the dashboard never fills gaps with invented data. Stale = last good data kept after a failed refresh.</p>
        {collector?.available && (
          <p className="mt-2 text-xs text-slate-300">
            <b className="text-white">Server collector:</b> last ran <span className="mono">{collector.lastRun ? `${ago(collector.lastRun, now)} · ${new Date(collector.lastRun).toLocaleString()}` : 'never'}</span>
            {' '}· {collector.tasks.length - collector.failing}/{collector.tasks.length} source tasks OK. It runs every minute on Cloudflare and re-fetches each source on its own schedule (15 min – 6 h), so “Refresh” re-reads the latest collected copy rather than calling upstream directly.
            {collector.failing > 0 && <span className="mono block text-sev-critical">Failing: {collector.tasks.filter((t) => t.ok === 0).map((t) => `${t.id}${t.err ? ` (${t.err.slice(0, 80)})` : ''}`).join(' · ')}</span>}
          </p>
        )}
        <button className="btn btn-on mt-2" onClick={onRefresh}>{collector?.available ? 'Re-read latest collected data' : 'Force refresh all'}</button>
      </div>
      <div className="space-y-3 p-4">
        {feeds.map((f) => (
          <div key={f.id} className="rounded border border-ink-600 bg-ink-850 p-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[f.status], boxShadow: `0 0 8px ${STATUS_COLOR[f.status]}` }} />
              <span className="font-semibold text-white">{f.label}</span>
              <span className="chip ml-auto" style={{ color: STATUS_COLOR[f.status], background: STATUS_COLOR[f.status] + '1f' }}>{f.status}</span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[10.5px] text-slate-400">
              <span>{collector?.available ? 'Collected from source' : 'Upstream fetched'}: <span className="text-slate-200">{f.fetchedAt ? ago(f.fetchedAt, now) : '—'}</span></span>
              <span>Poll every: <span className="text-slate-200">{f.poll >= 60 ? f.poll / 60 + ' min' : f.poll + 's'}</span></span>
              <span>Next poll: <span className="mono text-slate-200">{f.nextAt ? Math.max(0, Math.round((f.nextAt - now) / 1000)) + 's' : '—'}</span></span>
            </div>
            {f.error && <div className="mono mt-1 text-[10.5px] text-sev-critical">{f.error}</div>}
            {!!f.sources.length && (
              <ul className="mt-2 space-y-0.5">
                {f.sources.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 text-[10.5px]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.ok ? '#22c55e' : '#ff2d55' }} />
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-300 hover:text-cyan-glow">{s.name}</a>
                    {s.count != null && <span className="mono text-slate-500">{fmt(s.count)}</span>}
                    {s.error && <span className="mono truncate text-sev-critical">{s.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Shell>
  );
}

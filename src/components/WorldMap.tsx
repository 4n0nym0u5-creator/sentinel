import 'd3-transition';
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, geoGraticule10, type GeoProjection } from 'd3-geo';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { select } from 'd3-selection';
import { feature } from 'topojson-client';
import { Minus, Plus, RotateCcw, Layers } from 'lucide-react';
import clsx from 'clsx';
import type { Ev, Sev } from '../lib/types';
import { COUNTRIES, byNum, cname } from '../lib/countries';
import { SEV_COLOR, SEV_RANK } from '../lib/sev';
import { fmt, ago } from '../lib/format';

export interface CountryAgg { cc: string; total: number; heat: number; maxSev: Sev; bySev: Record<Sev, number>; byType: Record<string, number>; latest: number }

export function aggregate(events: Ev[]): Record<string, CountryAgg> {
  const W: Record<string, number> = { ransomware: 3, c2: 2, attack: 1, news: 1, ioc: 1, vuln: 0 };
  const out: Record<string, CountryAgg> = {};
  for (const e of events) {
    const ccs: string[] = e.type === 'news' ? e.raw.countries || [] : e.country ? [e.country] : [];
    for (const cc of ccs) {
      const a = (out[cc] ||= { cc, total: 0, heat: 0, maxSev: 'low', bySev: { critical: 0, high: 0, medium: 0, low: 0 }, byType: {}, latest: 0 });
      a.total++; a.heat += e.type === 'c2' && e.sev === 'low' ? 0.5 : W[e.type] ?? 1; a.bySev[e.sev]++; a.byType[e.type] = (a.byType[e.type] || 0) + 1; a.latest = Math.max(a.latest, e.time);
      if (SEV_RANK[e.sev] > SEV_RANK[a.maxSev]) a.maxSev = e.sev;
    }
  }
  return out;
}

const heatColor = (t: number) => {
  // ink → deep teal → amber → red
  const stops = [[19, 32, 51], [21, 78, 99], [140, 90, 30], [210, 60, 30], [255, 45, 85]];
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(x), f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c.join(',')})`;
};

export default function WorldMap({ events, agg, fresh, selected, onSelect, height }: { events: Ev[]; agg: Record<string, CountryAgg>; fresh: Set<string>; selected: string | null; onSelect: (cc: string) => void; height: number | string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zb = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [size, setSize] = useState({ w: 900, h: 480 });
  const [world, setWorld] = useState<any[] | null>(null);
  const [hover, setHover] = useState<{ cc: string; x: number; y: number } | null>(null);
  const [k, setK] = useState(1);
  const [layers, setLayers] = useState({ heat: true, markers: true, ripples: true, labels: true });

  useEffect(() => {
    fetch('/countries-50m.json').then((r) => r.json()).then((topo) => setWorld((feature(topo, topo.objects.countries) as any).features.filter((f: any) => f.id !== '010')));
  }, []);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const projection: GeoProjection = useMemo(() => geoNaturalEarth1().fitExtent([[8, 8], [size.w - 8, size.h - 8]], { type: 'Sphere' } as any), [size]);
  const path = useMemo(() => geoPath(projection), [projection]);
  useEffect(() => {
    if (!svgRef.current) return;
    const z = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 12]).translateExtent([[0, 0], [size.w, size.h]]).on('zoom', (ev) => {
      gRef.current?.setAttribute('transform', ev.transform.toString()); setK(ev.transform.k);
    });
    zb.current = z;
    select(svgRef.current).call(z).on('dblclick.zoom', null);
  }, [size]);
  const zoomBy = (f: number) => svgRef.current && zb.current && select(svgRef.current).transition().duration(350).call(zb.current.scaleBy as any, f);
  const reset = () => svgRef.current && zb.current && select(svgRef.current).transition().duration(450).call(zb.current.transform as any, zoomIdentity);

  const maxHeat = useMemo(() => Math.max(1, ...Object.values(agg).map((a) => a.heat)), [agg]);
  const markers = useMemo(() => Object.values(agg).filter((a) => COUNTRIES[a.cc]).map((a) => {
    const c = COUNTRIES[a.cc]; const p = projection([c.lon, c.lat]); return p ? { ...a, x: p[0], y: p[1] } : null;
  }).filter(Boolean).sort((a, b) => a!.heat - b!.heat) as (CountryAgg & { x: number; y: number })[], [agg, projection]);
  const ripples = useMemo(() => {
    const out: { id: string; x: number; y: number; sev: Sev; delay: number; fresh: boolean }[] = [];
    for (const e of events) {
      if (out.length >= 36) break;
      if (!e.country || !COUNTRIES[e.country] || e.type === 'vuln') continue;
      const c = COUNTRIES[e.country]; const p = projection([c.lon, c.lat]); if (!p) continue;
      out.push({ id: e.id, x: p[0] + ((out.length * 37) % 9) - 4, y: p[1] + ((out.length * 53) % 9) - 4, sev: e.sev, delay: (out.length * 0.37) % 4, fresh: fresh.has(e.id) });
    }
    return out;
  }, [events, projection, fresh]);
  const grat = useMemo(() => path(geoGraticule10()), [path]);
  const sphere = useMemo(() => path({ type: 'Sphere' } as any), [path]);
  const h = hover ? agg[hover.cc] : undefined;

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden rounded-b-lg" style={{ height }}>
      <svg ref={svgRef} width={size.w} height={size.h} className="block cursor-grab active:cursor-grabbing" onMouseLeave={() => setHover(null)}>
        <defs>
          <radialGradient id="ocean" cx="50%" cy="45%" r="70%"><stop offset="0%" stopColor="#0a1a2c" /><stop offset="100%" stopColor="#04080f" /></radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stopColor="#22e3ff" stopOpacity="0" /><stop offset=".9" stopColor="#22e3ff" stopOpacity=".10" /><stop offset="1" stopColor="#22e3ff" stopOpacity=".35" /></linearGradient>
        </defs>
        <g ref={gRef}>
          <path d={sphere || ''} fill="url(#ocean)" stroke="#1c2d45" strokeWidth={1} />
          <path d={grat || ''} fill="none" stroke="#22e3ff" strokeOpacity={0.06} strokeWidth={0.5 / k} />
          {world?.map((f) => {
            const cc = byNum[String(+f.id)];
            const a = cc ? agg[cc] : undefined;
            const fill = layers.heat && a ? heatColor(Math.sqrt(a.heat / maxHeat)) : '#101b2b';
            const isSel = cc && cc === selected;
            return (
              <path data-cc={cc} key={f.id + (f.properties?.name || '')} d={path(f) || ''} fill={fill} fillOpacity={a ? 0.92 : 1}
                stroke={isSel ? '#22e3ff' : '#2a4062'} strokeOpacity={isSel ? 1 : 0.55} strokeWidth={(isSel ? 1.6 : 0.4) / k}
                className="transition-[fill] duration-700 hover:brightness-150"
                style={isSel ? { filter: 'drop-shadow(0 0 6px #22e3ff)' } : undefined}
                onMouseMove={(ev) => { const r = wrap.current!.getBoundingClientRect(); cc && setHover({ cc, x: ev.clientX - r.left, y: ev.clientY - r.top }); }}
                onClick={() => cc && onSelect(cc)} />
            );
          })}
          {layers.ripples && ripples.map((r) => (
            <g key={r.id} pointerEvents="none">
              <circle cx={r.x} cy={r.y} r={2} fill="none" stroke={SEV_COLOR[r.sev]} strokeWidth={(r.fresh ? 2 : 1.2) / k}
                style={{ animation: `ripple ${r.fresh ? 1.6 : 3.2}s ease-out ${r.delay}s infinite`, transformBox: 'fill-box' }} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {layers.markers && markers.map((m) => {
            const rad = (2.5 + Math.sqrt(m.total) * 1.6) / Math.sqrt(k);
            const col = SEV_COLOR[m.maxSev];
            return (
              <g key={m.cc} transform={`translate(${m.x},${m.y})`} className="cursor-pointer" onClick={() => onSelect(m.cc)}
                onMouseMove={(ev) => { const r = wrap.current!.getBoundingClientRect(); setHover({ cc: m.cc, x: ev.clientX - r.left, y: ev.clientY - r.top }); }}>
                {m.maxSev === 'critical' && (
                  <circle r={rad} fill={col} opacity={0.35}>
                    <animate attributeName="r" values={`${rad};${rad * 2.6};${rad}`} dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values=".45;0;.45" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle r={rad} fill={col} fillOpacity={0.28} stroke={col} strokeWidth={1.2 / k} filter="url(#glow)" />
                <circle r={Math.max(1.2, rad * 0.35)} fill={col} />
                {layers.labels && m.total >= 8 && k * rad > 6 && (
                  <text y={-rad - 3 / k} textAnchor="middle" fontSize={9 / k} fill="#cbd5e1" className="mono" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: '#03060b', strokeWidth: 3 / k }}>{m.cc} {m.total}</text>
                )}
              </g>
            );
          })}
        </g>
        <rect x={0} y={0} width={120} height={size.h} fill="url(#scan)" pointerEvents="none">
          <animate attributeName="x" from={-120} to={size.w} dur="9s" repeatCount="indefinite" />
        </rect>
      </svg>

      {hover && (
        <div className="pointer-events-none absolute z-20 w-60 rounded-md border border-ink-500 bg-ink-900/95 p-2.5 text-xs shadow-xl backdrop-blur" style={{ left: Math.min(hover.x + 14, size.w - 250), top: Math.min(hover.y + 14, size.h - 150) }}>
          <div className="mb-1 flex items-center justify-between"><span className="font-semibold text-white">{cname(hover.cc)}</span><span className="mono text-slate-500">{hover.cc}</span></div>
          {h ? (
            <>
              <div className="mb-1.5 flex gap-1">{(['critical', 'high', 'medium', 'low'] as Sev[]).map((s) => h.bySev[s] ? <span key={s} className="mono rounded px-1 text-[10px] font-bold text-ink-950" style={{ background: SEV_COLOR[s] }}>{h.bySev[s]}</span> : null)}</div>
              <div className="grid grid-cols-2 gap-x-2 text-[11px] text-slate-400">
                {Object.entries(h.byType).map(([t, n]) => <div key={t} className="flex justify-between"><span className="capitalize">{t === 'attack' ? 'attackers' : t}</span><span className="mono text-slate-200">{n}</span></div>)}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">latest {ago(h.latest)} · click to drill down</div>
            </>
          ) : <div className="text-slate-500">No events in current filter</div>}
        </div>
      )}

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button className="btn !p-1.5" onClick={() => zoomBy(1.6)} title="Zoom in"><Plus size={14} /></button>
        <button className="btn !p-1.5" onClick={() => zoomBy(1 / 1.6)} title="Zoom out"><Minus size={14} /></button>
        <button className="btn !p-1.5" onClick={reset} title="Reset view"><RotateCcw size={14} /></button>
      </div>
      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
        <span className="btn pointer-events-none !px-2 !py-1 text-[10px]"><Layers size={12} /> Layers</span>
        {(Object.keys(layers) as (keyof typeof layers)[]).map((l) => (
          <button key={l} className={clsx('btn !px-2 !py-1 text-[10px] capitalize', layers[l] && 'btn-on')} onClick={() => setLayers((s) => ({ ...s, [l]: !s[l] }))}>{l}</button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-ink-600 bg-ink-900/85 p-2 text-[10px] text-slate-400 backdrop-blur">
        <div className="mb-1 font-semibold uppercase tracking-wider text-slate-300">Activity heat</div>
        <div className="h-1.5 w-40 rounded" style={{ background: `linear-gradient(90deg, ${[0, .25, .5, .75, 1].map(heatColor).join(',')})` }} />
        <div className="mt-0.5 flex w-40 justify-between"><span>low</span><span>high</span></div>
        <div className="mt-1.5 flex gap-2">{(['critical', 'high', 'medium', 'low'] as Sev[]).map((s) => <span key={s} className="flex items-center gap-1 capitalize"><span className="h-2 w-2 rounded-full" style={{ background: SEV_COLOR[s] }} />{s}</span>)}</div>
        <div className="mt-1 max-w-[260px] leading-snug text-slate-500">Heat = ransomware victims×3 + online C2×2 + attack sources + news mentions, by country (attacker location = AS registration country).</div>
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 mono text-[10px] text-slate-500">{fmt(Object.keys(agg).length)} countries active · zoom {k.toFixed(1)}×</div>
    </div>
  );
}

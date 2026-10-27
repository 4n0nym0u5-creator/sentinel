import { useState } from 'react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { fmtPct, type Mover } from '../../lib/trends';
import { cname } from '../../lib/countries';
import { fmtP } from '../../lib/stats';

export default function Movers({ m, onPick }: { m: { dims: Record<string, Mover[]>; notes: string[] }; onPick: (dim: string, key: string) => void }) {
  const dims = Object.keys(m.dims);
  const [dim, setDim] = useState(dims[0] || '');
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const cur = m.dims[dim] ? dim : dims[0];
  const list = (m.dims[cur] || []).slice();
  const rows = (dir === 'up' ? list.filter((x) => x.delta > 0) : list.filter((x) => x.delta < 0).reverse()).slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <div className="flex flex-col p-2">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {dims.map((d) => <button key={d} onClick={() => setDim(d)} className={clsx('rounded border px-2 py-0.5 text-[10.5px]', d === cur ? 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow' : 'border-ink-600 text-slate-400 hover:text-white')}>{d}</button>)}
        <div className="ml-auto flex overflow-hidden rounded border border-ink-600">
          <button onClick={() => setDir('up')} className={clsx('flex items-center gap-1 px-2 py-0.5 text-[10.5px]', dir === 'up' ? 'bg-sev-critical/15 text-sev-critical' : 'text-slate-400')}><ArrowUpRight size={11} />Risers</button>
          <button onClick={() => setDir('down')} className={clsx('flex items-center gap-1 px-2 py-0.5 text-[10.5px]', dir === 'down' ? 'bg-green-500/15 text-green-400' : 'text-slate-400')}><ArrowDownRight size={11} />Fallers</button>
        </div>
      </div>
      {!rows.length && <div className="py-6 text-center text-xs text-slate-500">{m.notes.length ? m.notes.join(' · ') : 'No movers in this direction.'}</div>}
      <table className="w-full text-[11.5px]">
        <tbody>
          {rows.map((r) => {
            const sig = r.p < 0.05; const up = r.delta > 0;
            return (
              <tr key={r.key} className="cursor-pointer border-b border-ink-700/60 hover:bg-white/5" onClick={() => onPick(r.dim, r.key)} title="Click to filter by this">
                <td className="max-w-[200px] truncate py-1 pr-2 text-slate-200">{r.dim.startsWith('Countries') ? `${cname(r.key)} (${r.key})` : r.label}</td>
                <td className="mono whitespace-nowrap pr-2 text-right text-slate-500">{r.prev} → <span className="text-slate-200">{r.cur}</span></td>
                <td className="w-[34%] pr-2"><div className="h-1.5 rounded bg-ink-700"><div className="h-full rounded" style={{ width: `${(Math.abs(r.delta) / max) * 100}%`, background: up ? '#ff2d55' : '#22c55e', opacity: sig ? 1 : 0.35 }} /></div></td>
                <td className="mono w-14 text-right" style={{ color: up ? '#ff5d7a' : '#4ade80' }}>{r.delta > 0 ? '+' : ''}{r.delta}</td>
                <td className="mono w-16 text-right text-slate-400">{r.isNew ? <span className="chip border border-amber-400/40 text-amber-300" title={`Newly tracked: first seen ${new Date(r.first * 86400000).toISOString().slice(0, 10)}`}>new</span> : r.returned ? <span title="None in the prior window, but seen earlier">returned</span> : r.pct == null ? '—' : fmtPct(r.pct)}</td>
                <td className="w-24 pl-2 text-right">{sig ? <span className="chip border border-cyan-glow/40 text-cyan-glow" title={fmtP(r.p)}>significant</span> : <span className="text-[10px] text-slate-600" title={fmtP(r.p)}>noise ({r.p < 0.001 ? '<.001' : r.p.toFixed(2)})</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-slate-500">Exact Poisson (conditional binomial) test per row; faint bars are not significant at p &lt; 0.05. Click a row to filter. Ransomware windows end 2 days ago, NVD 14 days ago (reporting lag).</p>
    </div>
  );
}

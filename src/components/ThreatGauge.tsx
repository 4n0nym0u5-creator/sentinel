import { useState } from 'react';
import type { Threat } from '../lib/model';
import { Info } from 'lucide-react';

export default function ThreatGauge({ t, compact }: { t: Threat; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const R = 46, C = Math.PI * R;
  const frac = t.score / 100;
  return (
    <div className="relative flex items-center gap-3" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <svg width={compact ? 92 : 120} height={compact ? 56 : 72} viewBox="0 0 120 72">
        <defs>
          <linearGradient id="gg" x1="0" x2="1"><stop offset="0" stopColor="#22c55e" /><stop offset=".35" stopColor="#3aa0ff" /><stop offset=".55" stopColor="#ffc21a" /><stop offset=".75" stopColor="#ff7a1a" /><stop offset="1" stopColor="#ff2d55" /></linearGradient>
        </defs>
        <path d="M14 64 A46 46 0 0 1 106 64" fill="none" stroke="#132033" strokeWidth={10} strokeLinecap="round" />
        <path d="M14 64 A46 46 0 0 1 106 64" fill="none" stroke="url(#gg)" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 6px ${t.color})` }} />
        {[0, 20, 40, 60, 80, 100].map((v) => { const a = Math.PI * (1 - v / 100); return <line key={v} x1={60 + 34 * Math.cos(a)} y1={64 - 34 * Math.sin(a)} x2={60 + 38 * Math.cos(a)} y2={64 - 38 * Math.sin(a)} stroke="#2a4062" strokeWidth={1.5} />; })}
        <g style={{ transform: `rotate(${-90 + 180 * frac}deg)`, transformOrigin: '60px 64px', transition: 'transform 1s ease' }}>
          <line x1={60} y1={64} x2={60} y2={26} stroke={t.color} strokeWidth={2.5} strokeLinecap="round" />
        </g>
        <circle cx={60} cy={64} r={5} fill={t.color} />
        <text x={60} y={52} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff" className="mono">{t.score}</text>
      </svg>
      <div className="leading-tight">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Global THREATCON <Info size={11} className="text-slate-500" /></div>
        <div className="text-xl font-bold tracking-wide" style={{ color: t.color, textShadow: `0 0 14px ${t.color}99` }}>{t.level} · {t.name}</div>
        <div className="flex gap-0.5 pt-1">{[5, 4, 3, 2, 1].map((l) => <span key={l} className="h-1.5 w-5 rounded-sm" style={{ background: l >= t.level ? ['', '#ff2d55', '#ff7a1a', '#ffc21a', '#3aa0ff', '#22c55e'][l] : '#132033' }} />)}</div>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[440px] rounded-lg border border-ink-500 bg-ink-900/98 p-3 text-xs shadow-2xl backdrop-blur">
          <div className="mb-2 font-semibold text-white">How the threat level is computed</div>
          <p className="mb-2 text-slate-400">Weighted average of live signals (0–1 each) × 100. Offline feeds are excluded and the remaining weights re-normalised. Bands: ≥80 SEVERE · ≥60 HIGH · ≥40 ELEVATED · ≥20 GUARDED · else LOW.</p>
          <table className="w-full">
            <tbody>
              {t.signals.map((s) => (
                <tr key={s.key} className="border-t border-ink-700 align-top">
                  <td className="py-1 pr-2 text-slate-300">{s.label}<div className="text-[10px] text-slate-500">{s.value}</div><div className="mono text-[9px] text-slate-600">{s.detail}</div></td>
                  <td className="mono py-1 pr-2 text-right text-slate-500">w{s.weight}</td>
                  <td className="mono py-1 text-right font-semibold" style={{ color: s.score == null ? '#ff2d55' : '#e2e8f0' }}>{s.score == null ? 'OFF' : s.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-slate-500">This is a heuristic situational indicator built from public feeds, not an official alert level.</p>
        </div>
      )}
    </div>
  );
}

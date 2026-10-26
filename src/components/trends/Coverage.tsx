import { STREAMS, type Analysis, type Hist, type StreamId } from '../../lib/trends';

const SRC: Partial<Record<StreamId, string>> = { combined: '', ransomware: 'ransomware', kev: 'kev', nvd: 'nvd', dshield: 'dshield', news: 'snapshots', c2: 'snapshots' };
export default function Coverage({ H, all }: { H: Hist; all: Record<StreamId, Analysis> }) {
  const nvdP = H.nvd?.progress;
  const store = H.snapshots?.store;
  return (
    <div className="flex flex-col gap-2 p-2 text-[11px]">
      <table className="w-full">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500"><th className="pb-1">Stream</th><th>History from</th><th className="text-right">Days</th><th className="text-right">Gap days</th><th className="pl-2">Source</th></tr></thead>
        <tbody>
          {STREAMS.map((s) => {
            const a = all[s.id]; const h = SRC[s.id] ? H[SRC[s.id]!] : null;
            return (
              <tr key={s.id} className="border-t border-ink-700/60">
                <td className="py-1 text-slate-200"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.short}</td>
                <td className="mono text-slate-300">{a.coverage.from || '—'}</td>
                <td className="mono text-right text-slate-300">{a.daily.ready ? a.coverage.days.toLocaleString('en') : '—'}</td>
                <td className="mono text-right" style={{ color: a.coverage.gaps ? '#ffc21a' : '#64748b' }}>{a.daily.ready ? a.coverage.gaps.toLocaleString('en') : '—'}</td>
                <td className="pl-2 text-[10px] text-slate-500">{s.id === 'combined' ? 'RW + KEV + NVD' : h?.stale ? <span className="text-sev-medium">stale copy</span> : h?.ok ? 'live' : h ? <span className="text-sev-critical">offline</span> : '…'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nvdP && (
        <div className="rounded border border-ink-600 bg-ink-850 p-2">
          <div className="flex justify-between text-[10.5px] text-slate-400"><span>NVD backfill (rate-limited, resumable)</span><span className="mono">{nvdP.done}/{nvdP.total} slices</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink-700"><div className="h-full bg-sev-medium" style={{ width: `${(nvdP.done / nvdP.total) * 100}%` }} /></div>
          {nvdP.lastError && <div className="mono mt-1 text-[10px] text-sev-critical">last error: {nvdP.lastError}</div>}
        </div>
      )}
      <ul className="list-disc space-y-1 pl-4 text-[10.5px] leading-snug text-slate-400">
        <li><b className="text-slate-300">Ransomware</b>: leak-site claims dated when ransomware.live discovered the post — unverified, and posted days–weeks after the intrusion. Tracker coverage has grown since 2021, which inflates long-run growth.</li>
        <li><b className="text-slate-300">KEV</b>: Nov 2021–Mar 2022 was the catalogue's initial bulk seeding; shaded and excluded from tests. Additions reflect CISA's confirmation process, not exploitation dates.</li>
        <li><b className="text-slate-300">NVD</b>: counts by publish date; NVD's analysis backlog means recent CVEs are often unscored, so the last weeks under-count Critical/High and get revised upward (last 14 days excluded). CVEs with only a CVSS v4 score are not counted.</li>
        <li><b className="text-slate-300">DShield</b>: volume depends on how many volunteer sensors report — a scanning-noise gauge, not incidents. Not included in the combined index.</li>
        <li><b className="text-slate-300">News &amp; C2</b>: no public history exists, so this server records a daily snapshot ({store || 'store'}). Trends appear after ≥ 8 recorded periods; days the server was off are gaps.</li>
        <li>The current period and reporting-lag days are hatched and never used in tests. All times bucketed by UTC day.</li>
      </ul>
    </div>
  );
}

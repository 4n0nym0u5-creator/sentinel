import { newsSeverity } from '../../shared/newsSev';
import { clusterNews } from './cluster';
import type { Ev, FeedState, Sev } from './types';
import { detectCountries } from './countries';

const DAY = 86400_000;
export const CI_SECTORS = /health|hospitals?\b|government|public sector|energy|utilit|financ|bank|telecom|transport|defen|water|education/i;

export function buildEvents(feeds: Record<string, FeedState>): Ev[] {
  const ev: Ev[] = [];
  const now = Date.now();
  for (const v of feeds.ransomware?.data?.items || []) {
    const ci = CI_SECTORS.test(v.sector || '');
    ev.push({
      id: 'rw:' + v.id, type: 'ransomware', sev: ci ? 'critical' : 'high', time: Date.parse(v.discovered),
      title: `${v.victim}`, subtitle: `${v.group} · ${v.sector}`, country: v.country, source: 'ransomware.live',
      link: `https://www.ransomware.live/group/${encodeURIComponent(v.group)}`,
      sevReason: ci ? `Ransomware leak-site claim against a critical-infrastructure-type sector (${v.sector}) → Critical` : 'Ransomware leak-site claim → High',
      tags: [v.group, v.sector], raw: v,
    });
  }
  for (const v of feeds.kev?.data?.items || []) {
    const t = Date.parse(v.dateAdded + 'T00:00:00Z');
    const fresh = now - t < 7 * DAY;
    const sev: Sev = v.ransomware || fresh ? 'critical' : 'high';
    ev.push({
      id: 'kev:' + v.id, type: 'vuln', sev, time: t, title: `${v.id} · ${v.vendor} ${v.product}`, subtitle: v.name, country: null, source: 'CISA KEV',
      link: `https://nvd.nist.gov/vuln/detail/${v.id}`,
      sevReason: `Known exploited in the wild (CISA KEV)${v.ransomware ? ' + known ransomware use' : ''}${fresh ? ' + added < 7 days ago' : ''} → ${sev}`,
      tags: ['KEV', ...(v.ransomware ? ['Ransomware'] : [])], raw: { ...v, kind: 'kev' },
    });
  }
  for (const v of feeds.nvd?.data?.items || []) {
    const hot = (v.score ?? 0) >= 9.8 || (v.epss ?? 0) >= 0.1 || v.kev;
    ev.push({
      id: 'nvd:' + v.id, type: 'vuln', sev: hot ? 'critical' : 'high', time: Date.parse(v.published), title: `${v.id} · CVSS ${v.score ?? '?'}`, subtitle: v.desc,
      country: null, source: 'NIST NVD', link: `https://nvd.nist.gov/vuln/detail/${v.id}`,
      sevReason: hot ? `CVSS ${v.score}${(v.epss ?? 0) >= 0.1 ? `, EPSS ${(v.epss * 100).toFixed(1)}%` : ''}${v.kev ? ', in KEV' : ''} (CVSS ≥ 9.8 or EPSS ≥ 10% or KEV) → Critical` : `CVSS ${v.score} critical-rated, low exploit likelihood → High`,
      tags: ['CVE', v.cwe].filter(Boolean), raw: { ...v, kind: 'nvd' },
    });
  }
  for (const v of feeds.euvd?.data?.items || []) {
    const sev: Sev = v.kind === 'exploited' ? 'critical' : v.kind === 'critical' ? 'high' : (v.score ?? 0) >= 7 ? 'medium' : 'low';
    const t = Date.parse(v.exploitedSince || v.published || '') || now;
    if (v.kind === 'exploited' && now - t > 120 * DAY) continue;
    ev.push({
      id: 'euvd:' + v.kind + ':' + v.id, type: 'vuln', sev, time: t, title: `${v.id}${v.cve ? ' / ' + v.cve : ''}`, subtitle: `${v.vendor ? v.vendor + ' — ' : ''}${v.desc}`,
      country: null, source: 'ENISA EUVD', link: `https://euvd.enisa.europa.eu/vulnerability/${v.id}`,
      sevReason: v.kind === 'exploited' ? 'Listed as exploited by ENISA EUVD → Critical' : v.kind === 'critical' ? 'EUVD critical list → High' : `EUVD latest, score ${v.score ?? '?'}`,
      tags: ['EUVD', v.kind], raw: { ...v, kindTag: v.kind, kind: 'euvd' },
    });
  }
  for (const v of feeds.c2?.data?.items || []) {
    const on = v.status === 'online';
    ev.push({
      id: 'c2:' + v.id, type: 'c2', sev: on ? 'high' : 'low', time: Date.parse(v.lastOnline + 'T00:00:00Z') || Date.parse(v.firstSeen) || now,
      title: `${v.malware} C2 ${v.ip}:${v.port}`, subtitle: `${v.asName || 'AS' + v.asn} · ${on ? 'ONLINE' : 'offline'}`, country: v.country, source: 'Feodo Tracker',
      link: `https://feodotracker.abuse.ch/browse/host/${v.ip}/`, sevReason: on ? 'Botnet C2 currently online → High' : 'C2 listed but offline → Low', tags: [v.malware], raw: v,
    });
  }
  for (const v of feeds.threatfox?.data?.items || []) {
    ev.push({
      id: 'tf:' + v.id, type: 'ioc', sev: v.confidence >= 75 ? 'high' : 'medium', time: Date.parse(v.firstSeen) || now, title: `${v.malware} · ${v.type}`, subtitle: v.ioc,
      country: null, source: 'ThreatFox', link: `https://threatfox.abuse.ch/ioc/${v.id}/`, sevReason: `ThreatFox IOC, confidence ${v.confidence}%`, tags: [v.malware, v.threat], raw: v,
    });
  }
  const d = feeds.dshield?.data;
  (d?.attackers || []).forEach((a: any, i: number) => {
    ev.push({
      id: 'att:' + a.ip, type: 'attack', sev: i < 5 ? 'high' : 'medium', time: Date.parse(a.lastSeen + 'T00:00:00Z') || now,
      title: `Attacker ${a.ip}`, subtitle: `${a.asname || 'AS?'} · ${a.attacks.toLocaleString()} targets hit, ${a.reports.toLocaleString()} reports`,
      country: a.country, source: 'DShield', link: `https://isc.sans.edu/ipinfo/${a.ip}`,
      sevReason: i < 5 ? `Top-5 most active source across DShield sensors (rank ${i + 1}) → High` : `Top-40 DShield attacking source (rank ${i + 1}) → Medium`, tags: ['Scanning'], raw: { ...a, rank: i + 1 },
    });
  });
  ev.push(...newsEvents(feeds.news?.data?.items || [], now));
  return ev.filter((e) => !isNaN(e.time)).sort((a, b) => b.time - a.time);
}

export interface Signal { key: string; label: string; value: string; score: number | null; weight: number; detail: string }
/** THREATCON scale shared by the gauge, header, tooltip, glossary and summaries: 1 LOW → 5 SEVERE. */
export const THREAT_NAMES = { 1: 'LOW', 2: 'GUARDED', 3: 'ELEVATED', 4: 'HIGH', 5: 'SEVERE' } as const;
export const THREAT_COLORS = { 1: '#22c55e', 2: '#3aa0ff', 3: '#ffc21a', 4: '#ff7a1a', 5: '#ff2d55' } as const;
export interface Threat { score: number; level: 1 | 2 | 3 | 4 | 5; name: string; color: string; signals: Signal[] }
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Global threat level — a transparent weighted blend of real signals. Offline signals are dropped and weights renormalised. */
export function computeThreat(feeds: Record<string, FeedState>, events: Ev[]): Threat {
  const now = Date.now();
  const s: Signal[] = [];
  const rw = feeds.ransomware?.data?.items as any[] | undefined;
  if (rw?.length) {
    const d1 = rw.filter((v) => now - Date.parse(v.discovered) < DAY).length;
    const avg = rw.length / 30;
    const r = d1 / Math.max(avg, 1);
    s.push({ key: 'rw', label: 'Ransomware tempo', value: `${d1} victims/24h vs ${avg.toFixed(0)}/day 30-day avg (×${r.toFixed(2)})`, score: clamp((r - 0.5) / 1.5), weight: 25, detail: 'score = clamp((ratio − 0.5) / 1.5)' });
  } else s.push({ key: 'rw', label: 'Ransomware tempo', value: 'feed offline', score: null, weight: 25, detail: '' });
  const kev = feeds.kev?.data?.items as any[] | undefined;
  if (kev) {
    const n = kev.filter((v) => now - Date.parse(v.dateAdded) < 7 * DAY).length;
    s.push({ key: 'kev', label: 'New known-exploited vulns', value: `${n} KEV additions in 7 days`, score: clamp(n / 10), weight: 20, detail: 'score = n / 10 (cap 1)' });
  } else s.push({ key: 'kev', label: 'New known-exploited vulns', value: 'feed offline', score: null, weight: 20, detail: '' });
  if (feeds.news?.data) {
    const n = events.filter((e) => e.type === 'news' && e.sev === 'critical' && now - e.time < 2 * DAY).length;
    s.push({ key: 'zd', label: 'Zero-day / active exploitation reporting', value: `${n} critical news items in 48h`, score: clamp(n / 6), weight: 15, detail: 'score = n / 6 (cap 1)' });
  } else s.push({ key: 'zd', label: 'Zero-day / active exploitation reporting', value: 'feed offline', score: null, weight: 15, detail: '' });
  const nvd = feeds.nvd?.data?.items as any[] | undefined;
  const eu = feeds.euvd?.data?.items as any[] | undefined;
  if (nvd || eu) {
    const a = (nvd || []).filter((v) => now - Date.parse(v.published) < 7 * DAY && (v.epss ?? 0) >= 0.1).length;
    const b = (eu || []).filter((v) => v.kind === 'exploited' && v.exploitedSince && now - Date.parse(v.exploitedSince) < 7 * DAY).length;
    s.push({ key: 'cve', label: 'Weaponisable critical CVEs', value: `${a} new CVSS≥9 with EPSS≥10% + ${b} EUVD-exploited (7d)`, score: clamp((a + b) / 5), weight: 15, detail: 'score = n / 5 (cap 1)' });
  } else s.push({ key: 'cve', label: 'Weaponisable critical CVEs', value: 'feeds offline', score: null, weight: 15, detail: '' });
  const ic = feeds.dshield?.data?.infocon as string | undefined;
  if (ic) {
    const m: Record<string, number> = { green: 0, yellow: 0.5, orange: 0.8, red: 1 };
    s.push({ key: 'ic', label: 'SANS ISC Infocon', value: ic.toUpperCase(), score: m[ic] ?? 0, weight: 15, detail: 'green 0 · yellow .5 · orange .8 · red 1' });
  } else s.push({ key: 'ic', label: 'SANS ISC Infocon', value: 'feed offline', score: null, weight: 15, detail: '' });
  const c2 = feeds.c2?.data?.items as any[] | undefined;
  if (c2) {
    const n = c2.filter((v) => v.status === 'online').length;
    s.push({ key: 'c2', label: 'Active botnet C2 (Feodo)', value: `${n} online of ${c2.length} listed`, score: clamp(n / 20), weight: 10, detail: 'score = online / 20 (cap 1)' });
  } else s.push({ key: 'c2', label: 'Active botnet C2 (Feodo)', value: 'feed offline', score: null, weight: 10, detail: '' });
  const live = s.filter((x) => x.score != null);
  const W = live.reduce((a, x) => a + x.weight, 0) || 1;
  const score = Math.round((live.reduce((a, x) => a + x.weight * (x.score as number), 0) / W) * 100);
  // One scale everywhere: 1 = LOW … 5 = SEVERE (a higher number is always worse).
  const level = (score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1) as Threat['level'];
  const names = THREAT_NAMES;
  const colors = THREAT_COLORS;
  return { score, level, name: names[level], color: colors[level], signals: s };
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
/** News items → events. Countries come from the text (names, demonyms, companies); a regional news outlet's home
 *  country is used only for general local-news outlets (cyber-filtered feeds) when the text names none (ccFromSource). Reports of the same incident are clustered
 *  into one event whose raw.related is the timeline of linked sources. */
export function newsEvents(items: any[], now: number): Ev[] {
  const base = items.map((n) => {
    const text = `${n.title} ${n.summary || ''}`;
    const { sev, why } = newsSeverity(text);
    let ccs = detectCountries(text), fromSrc = false;
    if (!ccs.length && n.srcLocal && n.srcCc) { ccs = [n.srcCc]; fromSrc = true; }
    return { n, sev, why, ccs, fromSrc, time: Date.parse(n.published) || now };
  });
  const groups = clusterNews(base.map((b) => ({ key: b.n.id, time: b.time, title: b.n.title || '', text: b.n.summary || '', source: b.n.source })));
  const out: Ev[] = [];
  for (const g of groups) {
    const m = g.idx.map((i) => base[i]).sort((a, b) => a.time - b.time);
    const last = m[m.length - 1];
    const top = m.reduce((a, b) => (SEV_RANK[b.sev] > SEV_RANK[a.sev] ? b : a));
    const freq = new Map<string, number>();
    m.forEach((x) => x.ccs.forEach((c, k) => freq.set(c, (freq.get(c) || 0) + (k === 0 ? 1.5 : 1))));
    const ccs = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const srcs = [...new Set(m.map((x) => x.n.source))];
    const related = m.length > 1 ? m.map((x) => ({ source: x.n.source, time: x.time, title: x.n.title, link: x.n.link, firstSeen: !!x.n.firstSeen, lang: x.n.lang })) : undefined;
    out.push({
      id: 'news:' + last.n.id, type: 'news', sev: top.sev, time: last.time, title: last.n.title, subtitle: last.n.summary,
      country: ccs[0] || null, source: last.n.source, link: last.n.link,
      sevReason: m.length > 1 ? `${top.why} (highest of ${m.length} linked reports)` : top.why,
      tags: [...(m.length > 1 ? [`${srcs.length} sources`] : []), ...(last.n.tags || []).slice(0, 3)],
      raw: { ...last.n, countries: ccs, ccFromSource: ccs.length > 0 && m.every((x) => x.fromSrc || !x.ccs.length), related, incident: g.alias, sources: srcs, firstAt: m[0].time },
    });
  }
  return out;
}

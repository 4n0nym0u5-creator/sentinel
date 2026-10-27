/**
 * Executive summaries — deterministic, templated narratives built ONLY from numbers computed from the live data.
 * No language model. Every claim is hedged where the source is unverified, delayed or partial.
 */
import type { FeedState } from './types';
import type { Threat } from './model';
import { CI_SECTORS } from './model';
import { poissonTest } from './stats';
import { cname } from './countries';
import { PORTS } from './format';
import { RANGES, type Analysis, type Mover, type RangeId } from './trends';

export interface Summary { now: string[]; think: string[]; sowhat: string[]; basis?: string }
const DAY = 86400_000;
const ICS = new Set([502, 102, 47808, 20000, 44818, 1911]);
const n0 = (x: number) => x.toLocaleString('en-US');
const pctS = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
const updown = (p: number) => (p > 0 ? `up ${Math.abs(p)}%` : p < 0 ? `down ${Math.abs(p)}%` : 'unchanged');
const sigS = (p: number | null | undefined) => (p == null ? '' : p < 0.05 ? 'a statistically real change' : 'within normal variation, so likely noise');
export const usdS = (n: number | null | undefined) => (n == null ? '—' : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
function top<T>(xs: T[], key: (x: T) => string | null | undefined) {
  const m = new Map<string, number>(); for (const x of xs) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// =================================================================== LIVE
export interface LiveFacts {
  ok: { rw: boolean; kev: boolean; nvd: boolean; c2: boolean; ds: boolean };
  r7: number; p7: number; rwP: number; r30: number; topGroup?: [string, number]; topSector?: [string, number]; sectors3: string[]; ciShare: number | null; topCountry?: [string, number];
  kev7: number; kev30: number; kevRw30: number; kevVendors: string[];
  crit30: number; hot30: number; c2on: number; c2all: number; families: string[];
  port?: { port: number; name: string; records: number }; icsInTop: number[]; infocon?: string;
}
export function liveFacts(feeds: Record<string, FeedState>, now = Date.now()): LiveFacts {
  const rw = (feeds.ransomware?.data?.items ?? []) as any[];
  const age = (s: string) => now - Date.parse(s);
  const r7 = rw.filter((v) => age(v.discovered) < 7 * DAY).length, p7 = rw.filter((v) => age(v.discovered) >= 7 * DAY && age(v.discovered) < 14 * DAY).length;
  const r30l = rw.filter((v) => age(v.discovered) < 30 * DAY);
  const sec = top(r30l, (v) => (v.sector && !/^(Unknown|Other|Not Found|N\/A)$/i.test(v.sector) ? v.sector : null));
  const known = r30l.filter((v) => v.sector && !/^(Unknown|Other|Not Found|N\/A)$/i.test(v.sector));
  const kev = (feeds.kev?.data?.items ?? []) as any[];
  const k30 = kev.filter((v) => age(v.dateAdded) < 30 * DAY);
  const nvd = (feeds.nvd?.data?.items ?? []) as any[];
  const c2 = (feeds.c2?.data?.items ?? []) as any[];
  const ds = feeds.dshield?.data;
  const p = ds?.ports?.[0];
  return {
    ok: { rw: !!feeds.ransomware?.data, kev: !!feeds.kev?.data?.total, nvd: !!feeds.nvd?.data, c2: !!feeds.c2?.data, ds: !!ds },
    r7, p7, rwP: poissonTest(r7, p7).p, r30: r30l.length,
    topGroup: top(rw.filter((v) => age(v.discovered) < 7 * DAY), (v) => v.group)[0],
    topSector: sec[0], sectors3: sec.slice(0, 3).map(([k]) => k),
    ciShare: known.length >= 20 ? known.filter((v) => CI_SECTORS.test(v.sector)).length / known.length : null,
    topCountry: top(r30l, (v) => v.country)[0],
    kev7: kev.filter((v) => age(v.dateAdded) < 7 * DAY).length, kev30: k30.length, kevRw30: k30.filter((v) => v.ransomware).length,
    kevVendors: top(k30, (v) => v.vendor).slice(0, 3).map(([k]) => k),
    crit30: nvd.filter((v) => age(v.published) < 30 * DAY).length, hot30: nvd.filter((v) => age(v.published) < 30 * DAY && (v.epss ?? 0) >= 0.1).length,
    c2on: c2.filter((v) => v.status === 'online').length, c2all: c2.length, families: top(c2.filter((v) => v.status === 'online'), (v) => v.malware).slice(0, 3).map(([k]) => k),
    port: p ? { port: p.port, name: PORTS[p.port] || 'unnamed service', records: p.records } : undefined,
    icsInTop: (ds?.ports ?? []).slice(0, 10).map((x: any) => x.port).filter((x: number) => ICS.has(x)),
    infocon: ds?.infocon ?? undefined,
  };
}

export function liveSummary(feeds: Record<string, FeedState>, threat: Threat, now = Date.now()): Summary {
  const f = liveFacts(feeds, now);
  const out: string[] = [];
  const drivers = threat.signals.filter((s) => s.score != null && s.score > 0).sort((a, b) => b.weight * (b.score as number) - a.weight * (a.score as number)).slice(0, 2).map((s) => (/^[A-Z][a-z]/.test(s.label) ? s.label[0].toLowerCase() + s.label.slice(1) : s.label));
  out.push(`SENTINEL's overall THREATCON reads ${threat.name} (level ${threat.level} of 5, score ${threat.score}/100)${drivers.length ? `, driven mainly by ${list(drivers)}` : ''}.${threat.level >= 4 ? ' That is a busy picture by this dashboard\'s own scale.' : threat.level <= 2 ? ' That is a normal-to-quiet day by this dashboard\'s own scale.' : ''}`);
  if (f.ok.rw) {
    const d = pctS(f.r7, f.p7);
    out.push(`Ransomware gangs posted ${n0(f.r7)} victim claims on their leak sites in the last 7 days${d == null ? '' : `, ${updown(d)} on the week before — ${sigS(f.rwP)}`}${f.topGroup ? `; ${f.topGroup[0]} is the most active group (${Math.round((f.topGroup[1] / Math.max(f.r7, 1)) * 100)}% of claims)` : ''}.${f.topSector ? ` Over 30 days the most-named sectors are ${list(f.sectors3)}${f.ciShare != null ? `, and ${Math.round(f.ciShare * 100)}% of victims with a known sector are critical-infrastructure-type` : ''}.` : ''} These are unverified claims, posted days to weeks after the break-in.`);
  } else out.push('The ransomware feed is offline, so no ransomware figures are shown.');
  if (f.ok.kev || f.ok.nvd) {
    const a = f.ok.kev ? `CISA added ${n0(f.kev7)} flaws to its KEV exploited list in the past 7 days (${n0(f.kev30)} in 30 days${f.kevRw30 ? `, ${n0(f.kevRw30)} of them known to be used by ransomware` : ''}${f.kevVendors.length ? `; most often affecting ${list(f.kevVendors)}` : ''}).` : 'The KEV feed is offline.';
    const b = f.ok.nvd ? ` ${n0(f.crit30)} new critical CVEs were published in 30 days, ${n0(f.hot30)} with an EPSS above 10% — i.e. a meaningful chance of near-term attack. Recent counts are understated because of the NVD analysis backlog.` : '';
    out.push(a + b);
  }
  if (f.ok.c2 || f.ok.ds) {
    const parts: string[] = [];
    if (f.ok.c2) parts.push(`${n0(f.c2on)} of ${n0(f.c2all)} tracked botnet C2 servers are online${f.families.length ? ` (${list(f.families)})` : ''}`);
    if (f.port) parts.push(`the most-probed port is ${f.port.port} (${f.port.name})`);
    if (f.icsInTop.length) parts.push(`industrial-control ports (${f.icsInTop.join(', ')}) are in the top ten — worth noting`);
    if (f.infocon) parts.push(`the ISC Infocon is ${f.infocon}${f.infocon === 'green' ? ', its normal state' : ' — above normal'}`);
    out.push(parts.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.');
  }
  const sowhat: string[] = [];
  if (f.ok.kev && f.kev30) sowhat.push(`Patch exposure: ${n0(f.kev30)} newly confirmed exploited flaws in 30 days${f.kevVendors.length ? `, led by ${list(f.kevVendors)}` : ''}. Unpatched internet-facing systems from these vendors are the most likely way in for the next wave of claims.`);
  if (f.ok.rw && f.sectors3.length) sowhat.push(`Ransomware remains the main loss driver. Exposure concentrated in ${list(f.sectors3)} is where new claims are currently landing${f.ciShare != null && f.ciShare >= 0.25 ? ', with a sizeable share in critical-infrastructure-type sectors' : ''}.`);
  sowhat.push('One busy day is not a trend. Use the Trends tab, which tests whether changes are statistically real and compares against last year, before changing a view on risk.');
  return {
    now: out,
    think: [
      'Read the page top-down. The THREATCON is a blend of the feeds below; the two numbers that most directly track real-world harm are new KEV additions (flaws confirmed in use) and ransomware claims (victims of the most costly attack type).',
      'Signal versus noise: port scanning, attack sources and botnet counts are always high and mostly background. Ransomware gangs also post victims in batches, so single days jump around. A genuine warning sign is a rise sustained over several weeks, a cluster of exploited flaws in widely used business software (remote-access, firewalls, file transfer), critical-infrastructure sectors climbing, or the Infocon leaving green.',
      'Limits: everything is public and partial. Claims are unverified and delayed, unscored flaws are missing from the NVD counts, and attacker countries show where servers are registered — not who is behind them.',
    ],
    sowhat: sowhat.slice(0, 3),
    basis: 'Computed live from the feeds on this page · ransomware over 7 and 30 days, flaws over 7 and 30 days · no figures are estimated.',
  };
}

export function liveMeans(feeds: Record<string, FeedState>, now = Date.now()) {
  const f = liveFacts(feeds, now);
  return {
    ransomware: f.ok.rw ? `${n0(f.r30)} claims in 30 days${f.topSector ? `; ${f.topSector[0]} is the most-named sector` : ''}${f.topCountry ? ` and ${cname(f.topCountry[0])} the most-named victim country` : ''}. Gang activity is lumpy — read the 30-day shape, not single days. A sector that keeps recurring week after week is the signal to act on.` : 'Feed offline — no ransomware figures available.',
    vulns: `${f.ok.kev ? `${n0(f.kev30)} exploited flaws added in 30 days${f.kevRw30 ? ` (${n0(f.kevRw30)} ransomware-linked)` : ''}. ` : ''}Exploited-list entries are being used in real attacks now and should be patched first; critical-but-unexploited flaws are a to-do list, prioritised by the likelihood bar.`,
    infra: `${f.port ? `Port ${f.port.port} (${f.port.name}) is the top target today. ` : ''}Most of this is constant automated scanning — the internet's background noise. What matters is change: a new port jumping into the top list (often right after a flaw is announced), industrial ports appearing, or botnet servers returning after a takedown.`,
    map: `${f.topCountry ? `${cname(f.topCountry[0])} has the most named ransomware victims in the last 30 days. ` : ''}Victim countries largely track where large, wealthy, well-reported economies are. Attacker countries mostly reflect where cheap servers are registered, so do not read them as who is attacking.`,
    news: 'National CERT and cyber-agency advisories are the most actionable items; news coverage adds context but its volume follows media attention (and English-language media most of all), not actual harm. A row marked "N sources" is one incident reported by several outlets — the more independent sources, the more significant it usually is.',
    geoCoverage: 'This shows how well each country is covered by our sources, so a quiet country can be told apart from a blind spot. Countries with no live local source are seen only through international outlets, which mainly report the largest incidents.',
  };
}

// =================================================================== TRENDS
const VERB = { rising: 'rising', falling: 'falling', stable: 'showing no clear trend', insufficient: 'too short a history to judge' } as const;
function describe(a: Analysis, label = a.meta.label) {
  if (a.daily.error) return `${label}: source offline.`;
  if (!a.daily.ready) return `${label}: ${a.daily.reason === 'recording' ? 'still recording history' : 'loading'}.`;
  const v = a.verdict;
  let s = `${label} ${v === 'insufficient' ? 'has' : 'are'} ${VERB[v]}${a.mk && v !== 'insufficient' ? ` (Mann–Kendall p ${a.mk.p < 0.001 ? '< 0.001' : '= ' + a.mk.p.toFixed(a.mk.p < 0.01 ? 3 : 2)})` : ''}`;
  const c = a.vsYear.available && a.vsYear.pct != null ? { cmp: a.vsYear, what: `the same ${a.period} days last year` } : a.vsPrior.available && a.vsPrior.pct != null ? { cmp: a.vsPrior, what: `the ${a.period} days before` } : null;
  if (c) s += `; the latest ${a.period} days are ${updown(Math.round(c.cmp.pct!))} on ${c.what}${c.cmp.p != null ? ` — ${sigS(c.cmp.p)}` : ''}`;
  return s + '.';
}
const PLACEHOLDER = /^(Unknown|Other|Not Found|N\/A|\?\?)$/i;
const dayS = (d: number) => new Date(d * DAY).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Rising from a base of zero is not "growth": newly tracked or returning keys are reported separately. */
const sigMover = (xs: Mover[] | undefined, dir: 1 | -1) => (xs ?? []).filter((m) => !PLACEHOLDER.test(m.key) && !m.isNew && !m.returned && m.p < 0.05 && Math.sign(m.delta) === dir && m.cur + m.prev >= 5).sort((a, b) => dir * (b.delta - a.delta))[0];
const mLabel = (m: Mover) => (m.dim.startsWith('Countries') ? cname(m.key) : m.label);

export function trendsSummary(all: Record<string, Analysis>, mv: { dims: Record<string, Mover[]>; window: string }, range: RangeId, filtered: boolean): Summary {
  const rw = all.ransomware, kev = all.kev, nvd = all.nvd, comb = all.combined;
  const now: string[] = [];
  const ready = Object.values(all).filter((a) => a.daily.ready && a.verdict !== 'insufficient');
  const cnt = (v: string) => ready.filter((a) => a.verdict === v).length;
  now.push(describe(rw, 'Ransomware claims'));
  const sec = sigMover(mv.dims['Sectors (ransomware)'], 1), cty = sigMover(mv.dims['Countries (ransomware)'], 1), grp = sigMover(mv.dims['Ransomware groups'], 1);
  const mp: string[] = [];
  if (sec) mp.push(`${sec.label} is the fastest significantly-growing sector (${n0(sec.prev)} → ${n0(sec.cur)} claims)`);
  if (grp) mp.push(`${grp.label} is the fastest-growing established group (${n0(grp.prev)} → ${n0(grp.cur)})`);
  const fresh = (mv.dims['Ransomware groups'] ?? []).filter((m) => m.isNew && !PLACEHOLDER.test(m.key) && m.cur >= 5).sort((a, b) => b.cur - a.cur);
  if (fresh.length) mp.push(`${fresh[0].label} is a newly tracked group (first seen ${dayS(fresh[0].first)}, ${n0(fresh[0].cur)} claims since — a new leak site, not growth from an existing base)${fresh.length > 1 ? `, one of ${fresh.length} groups first seen in this window` : ''}`);
  if (cty) mp.push(`${mLabel(cty)} the fastest-growing victim country (${n0(cty.prev)} → ${n0(cty.cur)})`);
  now.push(mp.length ? `Comparing ${mv.window}: ${list(mp)}.` : `No sector, group or country shows a statistically significant rise between the two windows (${mv.window}).`);
  now.push(`${describe(kev, 'Known-exploited flaw (KEV) additions')} ${describe(nvd, 'Serious new CVEs (critical + high)')} The latest weeks of the NVD series are understated by its analysis backlog.`);
  if (comb?.daily.ready && comb.sevMk) now.push(`Severity: the share of more serious items in the combined index is ${VERB[comb.sevVerdict]}.`);
  now.push(`Across ${ready.length} series with enough history: ${cnt('rising')} rising, ${cnt('falling')} falling, ${cnt('stable')} with no clear trend.`);
  const vkev = mv.dims['Vendors (KEV)']?.filter((m) => m.delta > 0 && m.p < 0.05).slice(0, 2).map((m) => m.label) ?? [];
  const sowhat: string[] = [];
  sowhat.push(rw.verdict === 'rising' ? 'Ransomware frequency is genuinely rising on this data — supports planning for more claims, not fewer, and for tighter terms on poorly controlled risks.' : rw.verdict === 'falling' ? 'Ransomware claims are falling on this data, but they are delayed and gangs rebrand — not a reason to relax controls on its own.' : 'No statistically clear change in ransomware frequency — treat headlines about "surges" with caution unless the year-on-year comparison is starred.');
  sowhat.push(sec ? `Accumulation watch: ${sec.label} is rising significantly. Check portfolio exposure to that sector, and use the sector filter above to confirm the pattern.` : 'Use the sector, country and group filters to test your own exposure — no segment stands out statistically right now.');
  sowhat.push(vkev.length ? `Supplier watch: ${list(vkev)} ${vkev.length > 1 ? 'have' : 'has'} significantly more exploited flaws than in the prior window — a common entry point for multi-victim events.` : 'Year-on-year comparisons are the fairest test of "is it getting worse": they remove seasonal swings and holiday lulls.');
  return {
    now,
    think: [
      'There are two separate questions: is it happening more often (counts — the verdict cards) and is it getting more serious (the severity mix). A bad year can be one without the other.',
      '"Rising" here is strict: it needs a consistent upward direction across many complete periods and at least a 5% change, so one spike does not count. Changes marked * are unlikely to be chance; unmarked ones should be treated as noise.',
      'Give most weight to ransomware claims and KEV additions — they follow real attacks. Serious new CVEs measure the size of the patching job and are distorted by the NVD backlog. DShield scanning and news volume reflect sensor numbers and media attention, not harm.',
      'A genuine warning sign is ransomware and exploited-flaw series rising together, confirmed year-on-year, with a growing serious share. Limits: tracker coverage has grown over time, which flatters long-run growth; the newest days are incomplete and are excluded.',
    ],
    sowhat,
    basis: `Computed from the selected range (${RANGES[range].label}, ${RANGES[range].period}-day comparison window)${filtered ? ' with your filters applied' : ''}. Tests: Mann–Kendall for trend, Mann–Whitney U for period comparisons, exact Poisson for movers.`,
  };
}

export function trendsMeans(A: Analysis, mv: { dims: Record<string, Mover[]>; window: string }) {
  const risers = Object.values(mv.dims).flatMap((xs) => xs.filter((m) => !PLACEHOLDER.test(m.key) && m.p < 0.05 && m.delta > 0 && m.cur + m.prev >= 5)).sort((a, b) => b.delta - a.delta).slice(0, 3);
  return {
    main: `${describe(A)} Focus on the trend line and smoothed averages rather than individual bars; hatched bars are incomplete and do not count.`,
    sev: A.daily.sevLevels > 0 ? `The serious share is ${A.sevMk ? VERB[A.sevVerdict] : 'not yet testable'}. A growing red/orange band means things are getting worse in severity even if counts are flat.` : 'This series has no severity levels; switch to ransomware, KEV, NVD or combined to see a mix.',
    movers: risers.length ? `Statistically significant risers: ${list(risers.map((m) => m.isNew ? `${mLabel(m)} (newly tracked, first seen ${dayS(m.first)}; ${n0(m.cur)} so far)` : `${mLabel(m)} (${n0(m.prev)} → ${n0(m.cur)}${m.returned ? ', back after a quiet spell' : ''})`))}. Small counts swing a lot — only solid bars should change your view.` : 'Nothing has risen by more than chance would explain between the two windows; the faint bars are noise.',
  };
}

// =================================================================== CRYPTO
export interface CryptoInputs {
  year: number; ytd: { u: number; n: number; r: number }; lytd: { u: number; n: number }; d30: { u: number; n: number }; p30: { u: number; n: number }; pt: number; ytdP: number;
  big?: { name: string; usd: number | null; day: string }; big2: number; byTech: { key: string; usd: number; n: number }[]; byCat: { key: string; usd: number; n: number }[]; totWin: number; top10: number; winLabel: string;
  trendBig?: Analysis; trendUsd?: Analysis; vul30: number; vulKev: number; ok: boolean;
}
export function cryptoSummary(c: CryptoInputs): Summary {
  if (!c.ok) return { now: ['The crypto incident dataset is offline, so no crypto figures are shown.'], think: [], sowhat: [] };
  const now: string[] = [];
  const dn = pctS(c.ytd.n, c.lytd.n), du = pctS(c.ytd.u, c.lytd.u);
  now.push(`Crypto thefts so far in ${c.year} total ${usdS(c.ytd.u)} across ${n0(c.ytd.n)} incidents, versus ${usdS(c.lytd.u)} and ${n0(c.lytd.n)} incidents by this date last year${dn != null ? ` — the incident count is ${updown(dn)}, ${sigS(c.ytdP)}` : ''}${du != null ? `; dollar losses are ${updown(du)}` : ''}.`);
  if (c.big?.usd && c.ytd.u) now.push(`The largest incident this year, ${c.big.name} (${usdS(c.big.usd)}, ${c.big.day}), is ${Math.round((c.big.usd / c.ytd.u) * 100)}% of the year's losses on its own${c.big2 > 0.5 ? ' — so the yearly total says more about one event than about a trend' : ''}.`);
  const d30 = pctS(c.d30.n, c.p30.n);
  now.push(`Last 30 days: ${n0(c.d30.n)} incidents and ${usdS(c.d30.u)} stolen, versus ${n0(c.p30.n)} and ${usdS(c.p30.u)} in the 30 days before${d30 != null ? ` (${updown(d30)} in count, ${sigS(c.pt)})` : ''}.`);
  if (c.trendBig?.daily.ready) now.push(`Long-run direction: ${describe(c.trendBig, 'Incidents of $1M or more')}`);
  const t = c.byTech[0], k = c.byCat[0];
  if (t && c.totWin) now.push(`In the ${c.winLabel}, ${t.key} is the costliest technique (${Math.round((t.usd / c.totWin) * 100)}% of losses, ${n0(t.n)} incidents)${k ? ` and ${k.key} the costliest category (${Math.round((k.usd / c.totWin) * 100)}%)` : ''}. Figures are USD at time of hack, as reported.`);
  const opsec = c.byTech.filter((r) => /Private-key|Access control|Phishing|Frontend/.test(r.key)).reduce((s, r) => s + r.usd, 0);
  const sowhat: string[] = [];
  if (c.totWin) sowhat.push(`Concentration risk: the ten largest incidents are ${Math.round((c.top10 / c.totWin) * 100)}% of losses in the ${c.winLabel}. Crypto loss is a few very large events, not many small ones — think accumulation, not frequency.`);
  if (c.totWin) sowhat.push(`${Math.round((opsec / c.totWin) * 100)}% of losses in the ${c.winLabel} came from stolen keys, access-control flaws, phishing or website/infrastructure compromise — ordinary security failures that can be assessed (key custody, access controls, audits), not exotic code.`);
  if (c.ytd.u) sowhat.push(`Recovery is rare: about ${((c.ytd.r / c.ytd.u) * 100).toFixed(1)}% of this year's losses were returned (where recorded). Assume stolen crypto is gone.`);
  return {
    now,
    think: [
      'Use dollars for severity and counts for direction. Dollar totals are dominated by one or two mega-hacks a year, so a "worse year" can simply mean one bad incident. The count of incidents of $1M or more is the steadiest measure of whether things are getting worse.',
      'The costliest incidents usually come from stolen keys at exchanges and bridges; code bugs in decentralised services cause the most incidents, but smaller ones. Warning signs: the $1M+ trend turning to Rising, several large incidents using the same technique within weeks, or a KEV entry for widely used wallet or exchange software.',
      'Limits: amounts are USD at time of hack, as reported, and not net of recoveries; small incidents are recorded far more thoroughly than a few years ago, which inflates all-size counts; attribution is the sources\', not SENTINEL\'s.',
    ],
    sowhat,
    basis: `Computed live from the DeFiLlama hacks dataset (${c.winLabel} for breakdowns) and crypto keyword matches in KEV/NVD (${n0(c.vul30)} in 30 days, ${n0(c.vulKev)} in KEV).`,
  };
}
export function cryptoMeans(c: CryptoInputs) {
  const t = c.byTech[0];
  return {
    stats: 'If the $1M+ series is Rising, crypto crime is genuinely getting worse; if only the all-sizes count rises, it may just be better recording of small incidents.',
    tech: t && c.totWin ? `${t.key} leads with ${Math.round((t.usd / c.totWin) * 100)}% of losses from ${n0(t.n)} incident${t.n === 1 ? '' : 's'}. ${t.n <= 2 ? 'That share comes from very few events — a single mega-hack, not a pattern.' : 'Several incidents share this technique, which makes it a pattern rather than a one-off.'}` : 'No incidents in this window.',
    top: c.totWin ? `These ten account for ${Math.round((c.top10 / c.totWin) * 100)}% of all losses in the ${c.winLabel}. The rest of the dataset is a long tail of smaller events.` : 'No incidents in this window.',
    vulns: `${n0(c.vul30)} crypto-related flaws in 30 days${c.vulKev ? `, ${n0(c.vulKev)} on the exploited list` : ''}. The ones on the exploited list are the urgent ones; keyword matches can include false positives.`,
  };
}

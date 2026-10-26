/* Trends engine: turns /api/history payloads into daily series, buckets, tests and verdicts.
 * Rules: a day with no source coverage is NULL (gap) — never zero, never interpolated. Buckets containing a gap
 * are gaps. The current (incomplete) bucket and the reporting-lag window are flagged and excluded from tests. */
import { CI_SECTORS } from './model';
import { inRegion, type Region } from './countries';
import { anomalies, mannKendall, mannWhitney, mean, movingAvg, poissonTest, twoProp, type MK } from './stats';

export const DAY = 86400_000;
export const today = () => Math.floor(Date.now() / DAY);
export const isoDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const dayOf = (s: string) => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY);

export type StreamId = 'combined' | 'ransomware' | 'kev' | 'nvd' | 'dshield' | 'news' | 'c2' | 'cryptohacks' | 'cryptobig' | 'cryptousd';
export type Gran = 'day' | 'week' | 'month';
export type RangeId = '30d' | '90d' | '1y' | '3y' | 'all';
export const RANGES: Record<RangeId, { days: number | null; period: number; gran: Gran; label: string }> = {
  '30d': { days: 30, period: 30, gran: 'day', label: '30 days' },
  '90d': { days: 90, period: 30, gran: 'week', label: '90 days' },
  '1y': { days: 365, period: 90, gran: 'week', label: '1 year' },
  '3y': { days: 1095, period: 180, gran: 'month', label: '3 years' },
  all: { days: null, period: 180, gran: 'month', label: 'All history' },
};
export const SEV_LEVELS = ['critical', 'high', 'medium', 'low', 'unscored'] as const;
export const SEV_W = [4, 3, 2, 1];

export interface Filters { region: Region; country: string; sector: string; group: string; vendor: string; product: string }
export const NO_FILTERS: Filters = { region: 'All', country: '', sector: '', group: '', vendor: '', product: '' };
export type Hist = Record<string, any | undefined>;

export interface StreamMeta { id: StreamId; label: string; short: string; unit: string; kind: 'count' | 'value'; color: string; lag: number; filters: (keyof Filters)[]; desc: string }
export const STREAMS: StreamMeta[] = [
  { id: 'combined', label: 'Combined incident index', short: 'Combined', unit: 'events', kind: 'count', color: '#22e3ff', lag: 14, filters: ['region', 'country', 'sector', 'group', 'vendor', 'product'], desc: 'Ransomware claims + KEV additions + NVD Critical/High CVEs (days where all three are covered)' },
  { id: 'ransomware', label: 'Ransomware leak-site claims', short: 'Ransomware', unit: 'claims', kind: 'count', color: '#ff2d55', lag: 2, filters: ['region', 'country', 'sector', 'group'], desc: 'Victims posted on ransomware leak sites (ransomware.live)' },
  { id: 'kev', label: 'Known exploited vulns (CISA KEV)', short: 'KEV', unit: 'CVEs added', kind: 'count', color: '#ff7a1a', lag: 1, filters: ['vendor', 'product'], desc: 'CVEs CISA confirmed as exploited in the wild' },
  { id: 'nvd', label: 'NVD Critical + High CVEs', short: 'NVD CVEs', unit: 'CVEs', kind: 'count', color: '#ffc21a', lag: 14, filters: ['vendor', 'product'], desc: 'Newly published CVEs scored CVSS v3 ≥ 7.0' },
  { id: 'dshield', label: 'DShield attack reports', short: 'DShield', unit: 'reports/day', kind: 'value', color: '#a78bfa', lag: 2, filters: [], desc: 'Firewall log records from volunteer sensors (scanning noise)' },
  { id: 'news', label: 'Security news volume', short: 'News', unit: 'stories', kind: 'count', color: '#3aa0ff', lag: 1, filters: [], desc: 'Stories across monitored RSS feeds (recorded snapshots)' },
  { id: 'c2', label: 'Active botnet C2 (Feodo)', short: 'C2 online', unit: 'servers', kind: 'value', color: '#34d399', lag: 1, filters: [], desc: 'Online botnet C2 servers (recorded daily snapshot)' },
];
/** Crypto streams (DeFiLlama hacks dataset) — shown on the Crypto view; same engine, tests and rules. */
export const CRYPTO_STREAMS: StreamMeta[] = [
  { id: 'cryptohacks', label: 'Crypto hacks & exploits (all sizes)', short: 'Crypto incidents', unit: 'incidents', kind: 'count', color: '#f7931a', lag: 3, filters: [], desc: 'Incidents in the DeFiLlama hacks dataset, by incident date' },
  { id: 'cryptobig', label: 'Crypto incidents ≥ $1M', short: 'Incidents ≥ $1M', unit: 'incidents ≥ $1M', kind: 'count', color: '#ffc21a', lag: 3, filters: [], desc: 'Only incidents with ≥ $1M lost — less sensitive to changes in how many small incidents the dataset records' },
  { id: 'cryptousd', label: 'USD stolen (time-of-hack value)', short: 'USD stolen', unit: 'USD lost', kind: 'count', color: '#ff2d55', lag: 3, filters: [], desc: 'Sum of reported USD lost at time of hack (not net of recoveries)' },
];
export interface CryptoFilter { chain: string; group: string; cat: string }
export const META = Object.fromEntries([...STREAMS, ...CRYPTO_STREAMS].map((s) => [s.id, s])) as Record<StreamId, StreamMeta>;

/** Daily series: index i ↔ day d0+i, through today (UTC). */
export interface Daily { id: StreamId; d0: number; n: (number | null)[]; sev: (number[] | null)[]; testFrom: number; lag: number; sevLevels: number; months?: Record<string, Record<string, number>>; ready: boolean; error?: string; reason?: string }
const empty = (id: StreamId, reason: string, error?: string): Daily => ({ id, d0: today(), n: [], sev: [], testFrom: today(), lag: META[id].lag, sevLevels: 0, ready: false, reason, error });

function arr<T>(len: number, f: () => T) { return Array.from({ length: len }, f); }

export function buildDaily(id: StreamId, H: Hist, F: Filters): Daily {
  const t = today();
  if (id === 'combined') {
    const parts = (['ransomware', 'kev', 'nvd'] as StreamId[]).map((s) => buildDaily(s, H, F));
    if (parts.some((p) => !p.ready)) return empty(id, 'waiting for components', parts.find((p) => p.error)?.error);
    const d0 = Math.max(...parts.map((p) => p.d0));
    const len = t - d0 + 1;
    const n: (number | null)[] = [], sev: (number[] | null)[] = [];
    for (let i = 0; i < len; i++) {
      let s = 0; const sv = [0, 0, 0, 0, 0]; let gap = false;
      for (const p of parts) { const v = p.n[d0 - p.d0 + i]; if (v == null) { gap = true; break; } s += v; p.sev[d0 - p.d0 + i]!.forEach((x, k) => (sv[k] += x)); }
      n.push(gap ? null : s); sev.push(gap ? null : sv);
    }
    return { id, d0, n, sev, testFrom: Math.max(...parts.map((p) => p.testFrom)), lag: META[id].lag, sevLevels: 2, ready: true };
  }
  if (id === 'cryptohacks' || id === 'cryptobig' || id === 'cryptousd') {
    const h = H.crypto;
    if (!h) return empty(id, 'loading');
    if (!h.ok) return empty(id, 'offline', h.error);
    const f: CryptoFilter = h.filter || { chain: '', group: '', cat: '' };
    const d0 = dayOf(h.start), len = Math.max(0, t - d0 + 1);
    const n = arr(len, () => 0 as number | null), sev = arr(len, () => [0, 0, 0, 0, 0]);
    for (const x of h.data as any[]) {
      if (f.chain && !x.chains.includes(f.chain)) continue; if (f.group && x.group !== f.group) continue; if (f.cat && x.cat !== f.cat) continue;
      if (id === 'cryptobig' && !(x.usd >= 1e6)) continue;
      const k = dayOf(x.day) - d0; if (k < 0 || k >= len) continue;
      n[k]! += id === 'cryptousd' ? x.usd || 0 : 1;
      sev[k][({ critical: 0, high: 1, medium: 2, low: 3 } as any)[x.sev] ?? 3]++;
    }
    return { id, d0, n, sev: id === 'cryptousd' ? arr(len, () => null) : sev, testFrom: dayOf(h.testFrom), lag: META[id].lag, sevLevels: id === 'cryptohacks' ? 4 : 0, ready: true };
  }
  const src = id === 'news' || id === 'c2' ? 'snapshots' : id;
  const h = H[src];
  if (!h) return empty(id, 'loading');
  if (!h.ok) return empty(id, 'offline', h.error);
  const D = h.data;
  const d0 = dayOf(h.start);
  const len = Math.max(0, t - d0 + 1);
  const zeros = () => arr(len, () => 0 as number | null);
  if (id === 'ransomware') {
    const n = zeros(), sev = arr(len, () => [0, 0, 0, 0, 0]);
    const ci = (D.sectors as string[]).map((s) => CI_SECTORS.test(s));
    const cf = F.country ? D.countries.indexOf(F.country) : -1, sf = F.sector ? D.sectors.indexOf(F.sector) : -1, gf = F.group ? D.groups.indexOf(F.group) : -1;
    const regOk = (D.countries as string[]).map((c) => F.region === 'All' || inRegion(c, F.region));
    for (let i = 0; i < D.d.length; i++) {
      if (F.country && D.c[i] !== cf) continue; if (F.sector && D.s[i] !== sf) continue; if (F.group && D.g[i] !== gf) continue; if (!regOk[D.c[i]]) continue;
      const k = D.d[i] - d0; if (k < 0 || k >= len) continue;
      n[k]!++; sev[k][ci[D.s[i]] ? 0 : 1]++;
    }
    return { id, d0, n, sev, testFrom: dayOf(h.testFrom), lag: META[id].lag, sevLevels: 2, ready: true };
  }
  if (id === 'kev' || id === 'nvd') {
    const vf = F.vendor ? D.vendors.indexOf(F.vendor) : -2, pf = F.product ? D.products.indexOf(F.product) : -2;
    const n = id === 'kev' ? zeros() : arr(len, () => null as number | null), sev = arr(len, () => null as number[] | null);
    if (id === 'kev') for (let i = 0; i < len; i++) sev[i] = [0, 0, 0, 0, 0];
    else for (const [a, b] of D.covered as [number, number][]) for (let d = a; d <= b; d++) { const k = d - d0; if (k >= 0 && k < len) { n[k] = 0; sev[k] = [0, 0, 0, 0, 0]; } }
    for (let i = 0; i < D.d.length; i++) {
      if (F.vendor && D.v[i] !== vf) continue; if (F.product && D.p[i] !== pf) continue;
      const k = D.d[i] - d0; if (k < 0 || k >= len || n[k] == null) continue;
      n[k]!++; sev[k]![id === 'kev' ? (D.r[i] ? 0 : 1) : D.s[i]]++;
    }
    return { id, d0, n, sev, testFrom: dayOf(h.testFrom), lag: META[id].lag, sevLevels: 2, ready: true, months: id === 'nvd' && !F.vendor && !F.product ? D.months : undefined };
  }
  if (id === 'dshield') {
    const n = arr(len, () => null as number | null);
    D.d.forEach((d: number, i: number) => { const k = d - d0; if (k >= 0 && k < len) n[k] = D.records[i]; });
    return { id, d0, n, sev: arr(len, () => null), testFrom: d0, lag: META[id].lag, sevLevels: 0, ready: true };
  }
  if (id === 'news') {
    const keys = Object.keys(D.news).sort();
    if (!keys.length) return empty(id, 'recording');
    const s0 = dayOf(keys[0]); const L = t - s0 + 1;
    const n = arr(L, () => null as number | null), sev = arr(L, () => null as number[] | null);
    for (const k of keys) { const i = dayOf(k) - s0; const c = D.news[k]; n[i] = c.reduce((a: number, b: number) => a + b, 0); sev[i] = [...c, 0]; }
    return { id, d0: s0, n, sev, testFrom: s0, lag: 1, sevLevels: 4, ready: true };
  }
  // c2 snapshots
  const keys = Object.keys(D.days).filter((k) => D.days[k].c2).sort();
  if (!keys.length) return empty(id, 'recording');
  const s0 = dayOf(keys[0]); const L = t - s0 + 1;
  const n = arr(L, () => null as number | null);
  for (const k of keys) n[dayOf(k) - s0] = D.days[k].c2.online;
  return { id, d0: s0, n, sev: arr(L, () => null), testFrom: s0, lag: 1, sevLevels: 0, ready: true };
}

/* ------------------------------------------------------------------ bucketing */
export type BStatus = 'ok' | 'gap' | 'partial' | 'seed';
export interface Bucket { i: number; start: number; end: number; label: string; value: number | null; sev: number[] | null; status: BStatus; why?: string; idx?: number | null; ma1?: number | null; ma2?: number | null; trend?: number | null; anomaly?: number | null }
function bucketStart(d: number, g: Gran) {
  if (g === 'day') return d;
  if (g === 'week') return d - ((new Date(d * DAY).getUTCDay() + 6) % 7); // Monday
  const x = new Date(d * DAY); return Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) / DAY);
}
function nextStart(d: number, g: Gran) {
  if (g === 'day') return d + 1; if (g === 'week') return d + 7;
  const x = new Date(d * DAY); return Math.floor(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1) / DAY);
}
export function bucketLabel(d: number, g: Gran) {
  const x = new Date(d * DAY);
  if (g === 'month') return x.toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return x.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(g === 'week' ? { year: '2-digit' } : {}), timeZone: 'UTC' });
}
export function rangeStart(D: Daily, r: RangeId) { const days = RANGES[r].days; return days == null ? D.d0 : Math.max(D.d0, today() - days + 1); }

export function bucketize(D: Daily, kind: 'count' | 'value', g: Gran, r: RangeId): Bucket[] {
  const t = today(), lastFull = t - D.lag;
  const rs = rangeStart(D, r);
  let s = bucketStart(rs, g); if (s < rs) s = nextStart(s, g);
  if (g !== 'day' && s > t) s = bucketStart(rs, g); // tiny range: keep the partial bucket visible
  const out: Bucket[] = [];
  for (let i = 0; s <= t; i++) {
    const e = nextStart(s, g);
    let sum = 0, cnt = 0, gaps = 0; const sev = [0, 0, 0, 0, 0]; let hasSev = false;
    for (let d = s; d < Math.min(e, t + 1); d++) {
      const v = d < D.d0 ? null : D.n[d - D.d0];
      if (v == null) { gaps++; continue; }
      sum += v; cnt++; const sv = D.sev[d - D.d0]; if (sv) { hasSev = true; sv.forEach((x, k) => (sev[k] += x)); }
    }
    // NVD monthly MEDIUM/LOW/unscored totals (count queries) for complete calendar months
    if (g === 'month' && D.months && hasSev) { const m = D.months[isoDay(s).slice(0, 7)]; if (m && m.medium != null && m.low != null && m.all != null) { sev[2] = m.medium; sev[3] = m.low; sev[4] = Math.max(0, m.all - sev[0] - sev[1] - m.medium - m.low); } }
    let status: BStatus = 'ok', why: string | undefined;
    let value: number | null = cnt ? (kind === 'count' ? sum : sum / cnt) : null;
    if (gaps) { status = 'gap'; why = `${gaps} day${gaps > 1 ? 's' : ''} without source coverage`; value = kind === 'value' && cnt && e - 1 > lastFull ? value : null; }
    if (e - 1 > lastFull) { status = 'partial'; why = e - 1 > t ? 'current period — incomplete' : 'inside reporting-lag window'; }
    else if (s < D.testFrom) { status = gaps ? 'gap' : 'seed'; why = why || 'source seeding period (excluded from tests)'; }
    if (status === 'partial' && gaps && kind === 'count') value = null;
    out.push({ i, start: s, end: e, label: bucketLabel(s, g), value, sev: hasSev && value != null ? sev : null, status, why });
    s = e;
  }
  return out;
}

/* ------------------------------------------------------------------ analysis */
export type VerdictStatus = 'rising' | 'falling' | 'stable' | 'insufficient';
export interface Compare { cur: number; prev: number; pct: number | null; p: number | null; label: string; available: boolean; why?: string }
export interface Analysis {
  meta: StreamMeta; daily: Daily; buckets: Bucket[]; gran: Gran; range: RangeId;
  mk: MK | null; verdict: VerdictStatus; changePct: number | null; nTest: number;
  sevMk: MK | null; sevVerdict: VerdictStatus; critShare: { cur: number; prev: number; p: number | null } | null;
  period: number; vsPrior: Compare; vsYear: Compare; anomalies: number; coverage: { from: string; days: number; gaps: number };
  sentence: string[];
}
function compare(D: Daily, kind: 'count' | 'value', a: number, b: number, a2: number, b2: number, label: string): Compare {
  const slice = (x: number, y: number) => { const o: number[] = []; for (let d = x; d <= y; d++) { const v = d < D.d0 ? null : D.n[d - D.d0]; if (v == null) return null; o.push(v); } return o; };
  const cur = slice(a, b), prev = slice(a2, b2);
  if (!cur || !prev) return { cur: 0, prev: 0, pct: null, p: null, label, available: false, why: 'no complete coverage for both periods' };
  if (a2 < D.testFrom) return { cur: 0, prev: 0, pct: null, p: null, label, available: false, why: 'comparison period falls in source seeding' };
  const agg = (v: number[]) => (kind === 'count' ? v.reduce((s, x) => s + x, 0) : mean(v));
  const c = agg(cur), p = agg(prev);
  const mw = mannWhitney(prev, cur);
  return { cur: c, prev: p, pct: p ? ((c - p) / p) * 100 : null, p: mw?.p ?? null, label, available: true };
}
function verdictOf(mk: MK | null, changePct: number | null, alpha = 0.05): VerdictStatus {
  if (!mk) return 'insufficient';
  if (mk.p >= alpha || changePct == null || Math.abs(changePct) < 5) return 'stable';
  return mk.slope > 0 ? 'rising' : 'falling';
}
const GLABEL: Record<Gran, string> = { day: 'daily', week: 'weekly', month: 'monthly' };
const pct = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)}%`);
export { pct as fmtPct };
const pS = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`);

export function analyse(id: StreamId, H: Hist, F: Filters, range: RangeId, granIn: Gran | 'auto'): Analysis {
  const meta = META[id];
  const daily = buildDaily(id, H, F);
  const gran = granIn === 'auto' ? RANGES[range].gran : granIn;
  const buckets = daily.ready ? bucketize(daily, meta.kind, gran, range) : [];
  // severity index (weighted mean of known levels)
  for (const b of buckets) { if (b.sev && daily.sevLevels) { let w = 0, n = 0; for (let k = 0; k < 4; k++) { w += SEV_W[k] * b.sev[k]; n += b.sev[k]; } b.idx = n >= 5 ? w / n : null; } }
  const vals = buckets.map((b) => b.value);
  const [w1, w2] = gran === 'day' ? [7, 28] : gran === 'week' ? [4, 12] : [3, 6];
  const m1 = movingAvg(vals, w1), m2 = movingAvg(vals, w2);
  buckets.forEach((b, i) => { b.ma1 = m1[i]; b.ma2 = m2[i]; });
  const test = buckets.filter((b) => b.status === 'ok' && b.value != null);
  const mk = mannKendall(test.map((b) => b.value!), test.map((b) => b.i));
  const tMean = mean(test.map((b) => b.value!));
  let changePct: number | null = null; let changeBase: 'start' | 'mean' = 'start';
  if (mk && test.length) {
    const x0 = test[0].i, x1 = test[test.length - 1].i;
    const f0 = mk.intercept + mk.slope * x0, f1 = mk.intercept + mk.slope * x1;
    // relative to the fitted starting level; if that is tiny (series grew from ~0) use the window average instead
    changeBase = f0 >= 0.25 * tMean && f0 > 0 ? 'start' : 'mean';
    changePct = changeBase === 'start' ? ((f1 - f0) / f0) * 100 : tMean > 0 ? ((f1 - f0) / tMean) * 100 : null;
    for (const b of buckets) if (b.i >= x0 && b.i <= x1) b.trend = Math.max(0, mk.intercept + mk.slope * b.i);
  }
  const verdict = verdictOf(mk, changePct);
  const win = gran === 'day' ? 28 : gran === 'week' ? 12 : 6;
  const an = anomalies(buckets.map((b) => (b.status === 'ok' ? b.value : null)), win, gran === 'month' ? 6 : 8);
  for (const a of an) buckets[a.i].anomaly = a.z;
  const sevTest = test.filter((b) => b.idx != null);
  const sevMk = daily.sevLevels ? mannKendall(sevTest.map((b) => b.idx!), sevTest.map((b) => b.i)) : null;
  let sevChange: number | null = null;
  if (sevMk && sevTest.length) { const a = sevMk.intercept + sevMk.slope * sevTest[0].i, b = sevMk.intercept + sevMk.slope * sevTest[sevTest.length - 1].i; sevChange = a ? ((b - a) / a) * 100 : null; }
  const sevVerdict = !daily.sevLevels ? 'insufficient' : !sevMk ? 'insufficient' : sevMk.p < 0.05 && sevChange != null && Math.abs(sevChange) >= 2 ? (sevMk.slope > 0 ? 'rising' : 'falling') : 'stable';
  // period comparisons on DAILY values ending at the last complete (post-lag) day
  const P = RANGES[range].period, last = today() - daily.lag;
  const vsPrior = daily.ready ? compare(daily, meta.kind, last - P + 1, last, last - 2 * P + 1, last - P, `last ${P}d vs prior ${P}d`) : { cur: 0, prev: 0, pct: null, p: null, label: '', available: false };
  const vsYear = daily.ready ? compare(daily, meta.kind, last - P + 1, last, last - P + 1 - 365, last - 365, `last ${P}d vs same ${P}d a year earlier`) : { cur: 0, prev: 0, pct: null, p: null, label: '', available: false };
  let critShare: Analysis['critShare'] = null;
  if (daily.sevLevels && daily.ready) {
    const sum = (a: number, b: number) => { const s = [0, 0, 0, 0]; for (let d = a; d <= b; d++) { const v = daily.sev[d - daily.d0]; if (!v) return null; for (let k = 0; k < 4; k++) s[k] += v[k]; } return s; };
    const c = sum(last - P + 1, last), p = sum(last - 2 * P + 1, last - P);
    if (c && p && last - 2 * P + 1 >= daily.d0) { const nc = c.reduce((a, b) => a + b, 0), np = p.reduce((a, b) => a + b, 0); const tp = twoProp(p[0], np, c[0], nc); critShare = { cur: nc ? c[0] / nc : 0, prev: np ? p[0] / np : 0, p: tp?.p ?? null }; }
  }
  const covDays = daily.n.length, gapsN = daily.n.filter((v) => v == null).length;
  // ---- plain-English explanation
  const s: string[] = [];
  const unit = gran === 'day' ? 'day' : gran;
  if (!daily.ready) s.push(daily.reason === 'recording' ? 'History for this stream is being recorded by the server from today; trends appear once at least 8 complete periods exist.' : daily.error ? `Source offline: ${daily.error}` : 'Loading history…');
  else if (!mk) s.push(`Not enough complete ${GLABEL[gran]} periods to test (${test.length} of the 8 needed). Pick a longer range or finer granularity.`);
  else {
    const dir = verdict === 'rising' ? 'RISING' : verdict === 'falling' ? 'FALLING' : 'STABLE';
    if (verdict === 'stable' && mk.p < 0.05) s.push(`${dir}: a statistically detectable drift (${pS(mk.p)}) but the fitted change is only ${pct(changePct)} over the window — practically flat.`);
    else if (verdict === 'stable') s.push(`${dir}: no statistically significant trend across ${mk.n} complete ${GLABEL[gran]} periods (Mann–Kendall ${pS(mk.p)}). Movement up and down is consistent with normal noise.`);
    else s.push(`${dir}: ${GLABEL[gran]} ${meta.unit} show a statistically significant ${verdict === 'rising' ? 'upward' : 'downward'} trend over ${mk.n} complete periods (Mann–Kendall ${pS(mk.p)}, τ = ${mk.tau.toFixed(2)}). Sen's slope ${mk.slope > 0 ? '+' : ''}${mk.slope.toFixed(mk.slope < 10 && mk.slope > -10 ? 2 : 0)} per ${unit}, ≈ ${pct(changePct)} across the window${changeBase === 'mean' ? ' (relative to the window average — the series started near zero)' : ''}.`);
    if (mk.acf > 1.05) s.push(`Variance inflated ×${mk.acf.toFixed(2)} for serial autocorrelation (Hamed–Rao), so clustered bursts are not mistaken for a trend.`);
  }
  if (vsPrior.available) s.push(`${meta.kind === 'count' ? 'Total' : 'Average'} ${vsPrior.label}: ${fmtN(vsPrior.cur)} vs ${fmtN(vsPrior.prev)} (${pct(vsPrior.pct)}; ${vsPrior.p != null ? `Mann–Whitney ${pS(vsPrior.p)}${vsPrior.p >= 0.05 ? ', not significant' : ''}` : 'test n/a'}).`);
  if (vsYear.available) s.push(`Year on year (${vsYear.label.replace(/^last \d+d vs /, '')}): ${pct(vsYear.pct)}${vsYear.p != null ? ` (${pS(vsYear.p)}${vsYear.p >= 0.05 ? ', not significant' : ''})` : ''}.`);
  else if (daily.ready) s.push(`Year-on-year comparison unavailable: ${vsYear.why}.`);
  if (daily.sevLevels && sevMk) s.push(`Severity mix: ${sevVerdict === 'rising' ? 'getting MORE severe' : sevVerdict === 'falling' ? 'getting less severe' : sevMk.p < 0.05 ? `statistically detectable but negligible shift (${pct(sevChange)} in the index)` : 'no significant change'} (severity-index Mann–Kendall ${pS(sevMk.p)}${critShare ? `; critical share ${(critShare.prev * 100).toFixed(1)}% → ${(critShare.cur * 100).toFixed(1)}%${critShare.p != null ? `, ${pS(critShare.p)}` : ''}` : ''}).`);
  if (an.length) s.push(`${an.length} anomalous spike${an.length > 1 ? 's' : ''} (> 3σ above the trailing ${win}-${unit} baseline) marked on the chart.`);
  return { meta, daily, buckets, gran, range, mk, verdict, changePct, nTest: test.length, sevMk, sevVerdict, critShare, period: P, vsPrior, vsYear, anomalies: an.length,
    coverage: { from: daily.ready ? isoDay(daily.d0) : '', days: covDays, gaps: gapsN }, sentence: s };
}
export const fmtN = (n: number) => (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Number.isInteger(n) ? n.toLocaleString('en') : n.toFixed(1));

/* ------------------------------------------------------------------ top movers */
export interface Mover { dim: string; key: string; label: string; cur: number; prev: number; delta: number; pct: number | null; p: number }
export function movers(H: Hist, F: Filters, P: number): { dims: Record<string, Mover[]>; window: string; notes: string[] } {
  const t = today(); const dims: Record<string, Mover[]> = {}; const notes: string[] = [];
  const run = (dim: string, src: string, lag: number, keyOf: (D: any, i: number) => string | null, labelOf: (k: string) => string, covered?: (a: number, b: number) => boolean) => {
    const h = H[src]; if (!h?.ok) return;
    const D = h.data, last = t - lag, a = last - P + 1, b = last - 2 * P + 1;
    if (covered && !covered(b, last)) { notes.push(`${dim}: NVD backfill has not yet covered both periods`); return; }
    const cur = new Map<string, number>(), prev = new Map<string, number>();
    for (let i = 0; i < D.d.length; i++) {
      const d = D.d[i]; if (d < b || d > last) continue;
      const k = keyOf(D, i); if (k == null) continue;
      const m = d >= a ? cur : prev; m.set(k, (m.get(k) || 0) + 1);
    }
    const keys = new Set([...cur.keys(), ...prev.keys()]);
    dims[dim] = [...keys].map((k) => { const c = cur.get(k) || 0, p = prev.get(k) || 0; return { dim, key: k, label: labelOf(k), cur: c, prev: p, delta: c - p, pct: p ? ((c - p) / p) * 100 : null, p: poissonTest(c, p).p }; })
      .filter((m) => m.key && m.key !== 'Unknown' && m.key !== '' && m.cur + m.prev >= 3);
  };
  const rw = H.ransomware?.data;
  if (rw) {
    const cf = F.country ? rw.countries.indexOf(F.country) : -1, sf = F.sector ? rw.sectors.indexOf(F.sector) : -1, gf = F.group ? rw.groups.indexOf(F.group) : -1;
    const ok = (D: any, i: number) => (!F.country || D.c[i] === cf) && (!F.sector || D.s[i] === sf) && (!F.group || D.g[i] === gf) && (F.region === 'All' || inRegion(D.countries[D.c[i]], F.region));
    run('Countries (ransomware)', 'ransomware', 2, (D, i) => (ok(D, i) ? D.countries[D.c[i]] : null), (k) => k);
    run('Sectors (ransomware)', 'ransomware', 2, (D, i) => (ok(D, i) ? D.sectors[D.s[i]] : null), (k) => k);
    run('Ransomware groups', 'ransomware', 2, (D, i) => (ok(D, i) ? D.groups[D.g[i]] : null), (k) => k);
  }
  const vok = (D: any, i: number) => (!F.vendor || D.vendors[D.v[i]] === F.vendor) && (!F.product || D.products[D.p[i]] === F.product);
  run('Vendors (KEV)', 'kev', 1, (D, i) => (vok(D, i) ? D.vendors[D.v[i]] : null), prettyVendor);
  const nv = H.nvd?.data;
  run('Vendors (NVD crit/high)', 'nvd', 14, (D, i) => (vok(D, i) ? D.vendors[D.v[i]] : null), prettyVendor, (a, b) => !!nv && (nv.covered as [number, number][]).some(([x, y]) => x <= a && y >= b));
  for (const k of Object.keys(dims)) dims[k].sort((x, y) => y.delta - x.delta || x.p - y.p);
  return { dims, window: `last ${P}d vs prior ${P}d`, notes };
}
export const prettyVendor = (s: string) => s.replace(/_/g, ' ').replace(/\\/g, '').replace(/\b\w/g, (c) => c.toUpperCase());

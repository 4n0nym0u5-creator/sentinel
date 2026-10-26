/*
 * Historical backfill + persistent daily snapshot store for the Trends view.
 * Only REAL dated records are used. Periods a source does not cover are reported
 * as coverage gaps (never zero-filled or interpolated).
 */
import { getFeed, getJSON, nvdGate, strip, type Env, type FeedResult } from './feeds';
import { newsSeverity } from './newsSev';

export interface Store { kind: string; get(key: string): Promise<any | null>; put(key: string, v: any): Promise<void> }
export function memStore(): Store { const m = new Map<string, any>(); return { kind: 'memory (not persistent)', get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; }

const DAY = 86400_000;
const dnum = (t: number) => Math.floor(t / DAY);
const iso = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const today = () => dnum(Date.now());
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Dictionary encoder for compact columnar payloads */
function dict() { const list: string[] = []; const idx = new Map<string, number>(); return { list, id(s: string) { let i = idx.get(s); if (i == null) { i = list.length; list.push(s); idx.set(s, i); } return i; } }; }

export interface HistoryPayload {
  stream: string; ok: boolean; fetchedAt: string; source: { name: string; url: string }[]; error?: string; stale?: boolean;
  start: string; testFrom: string; end: string; // ISO days (UTC). Days outside [start,end] are gaps.
  notes: string[]; data?: any; progress?: any; store?: string;
}

/* ---------------------------------------------------------------- ransomware.live (full history) */
async function ransomwareHistory(): Promise<Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>> {
  const url = 'https://data.ransomware.live/victims.json';
  const arr: any[] = await getJSON(url, {}, 120000);
  const START = Date.UTC(2021, 0, 1);
  const G = dict(), S = dict(), C = dict();
  const d: number[] = [], p: number[] = [], g: number[] = [], s: number[] = [], c: number[] = [];
  for (const v of arr) {
    const t = Date.parse(v.discovered);
    if (!(t >= START)) continue;
    const pt = Date.parse(v.published);
    d.push(dnum(t)); p.push(isNaN(pt) ? -1 : dnum(pt));
    g.push(G.id(String(v.group_name || 'unknown')));
    s.push(S.id(v.activity && v.activity !== 'Not Found' ? v.activity : 'Unknown'));
    c.push(C.id(String(v.country || '').toUpperCase().slice(0, 2)));
  }
  return {
    source: [{ name: 'ransomware.live open data (victims.json)', url: 'https://www.ransomware.live' }],
    start: iso(dnum(START)), testFrom: '2021-01-01', end: iso(today()),
    notes: [
      `${arr.length.toLocaleString('en')} leak-site claims in the dataset; ${d.length.toLocaleString('en')} discovered since 2021-01-01 are used (pre-2021 coverage is sparse and excluded).`,
      'Dated by when ransomware.live discovered the post. Claims are not verified breaches.',
      'Tracker coverage grows as more leak sites are monitored — part of any long-run rise can be coverage, not attacks.',
    ],
    data: { groups: G.list, sectors: S.list, countries: C.list, d, p, g, s, c },
  };
}

/* ---------------------------------------------------------------- ransomware.live per-year archives (serverless) */
// The ~20 MB victims.json is too heavy for a Cloudflare Workers free-plan invocation, so the Cloudflare collector
// reads ransomware.live's per-year archives (data.ransomware.live/<year>-victims.json, grouped by publish year)
// one per run and merges them. Records are filtered by DISCOVERED date >= 2021-01-01, exactly as above.
export const RW_FIRST_YEAR = 2020;
export interface RwChunk { year: number; fetchedAt: string; total: number; recs: [number, number, string, string, string][]; recent: any[] }
export async function ransomwareYear(year: number): Promise<RwChunk> {
  const arr: any[] = await getJSON(`https://data.ransomware.live/${year}-victims.json`, {}, 60000);
  if (!Array.isArray(arr)) throw new Error(`ransomware.live ${year} archive: unexpected format`);
  const START = Date.UTC(2021, 0, 1), cutoff = Date.now() - 35 * DAY;
  const recs: RwChunk['recs'] = [], recent: any[] = [];
  for (const v of arr) {
    const t = Date.parse(v.discovered);
    if (!(t >= START)) continue;
    const pt = Date.parse(v.published);
    recs.push([dnum(t), isNaN(pt) ? -1 : dnum(pt), String(v.group_name || 'unknown'), v.activity && v.activity !== 'Not Found' ? v.activity : 'Unknown', String(v.country || '').toUpperCase().slice(0, 2)]);
    if (t >= cutoff) recent.push({
      id: `${v.group_name}|${v.post_title}`, victim: strip(v.post_title, 140), group: v.group_name,
      discovered: new Date(t).toISOString(), published: v.published ? new Date(v.published).toISOString() : null,
      country: (v.country || '').toUpperCase().slice(0, 2) || null, sector: v.activity && v.activity !== 'Not Found' ? v.activity : 'Unknown',
      website: v.website || '', desc: strip(v.description, 360),
    });
  }
  return { year, fetchedAt: new Date().toISOString(), total: arr.length, recs, recent };
}
export function assembleRansomwareHistory(chunks: RwChunk[], missing: number[]): Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'> {
  const G = dict(), S = dict(), C = dict();
  const d: number[] = [], p: number[] = [], g: number[] = [], s: number[] = [], c: number[] = [];
  const all = chunks.flatMap((k) => k.recs).sort((a, b) => b[0] - a[0]);
  for (const r of all) { d.push(r[0]); p.push(r[1]); g.push(G.id(r[2])); s.push(S.id(r[3])); c.push(C.id(r[4])); }
  const total = chunks.reduce((a, k) => a + k.total, 0);
  const oldest = chunks.map((k) => k.fetchedAt).sort()[0];
  return {
    source: [{ name: 'ransomware.live open data (per-year archives <year>-victims.json)', url: 'https://www.ransomware.live' }],
    start: '2021-01-01', testFrom: '2021-01-01', end: iso(today()),
    notes: [
      `${total.toLocaleString('en')} leak-site claims in the ${chunks.map((k) => k.year).sort().join(', ')} archives; ${d.length.toLocaleString('en')} discovered since 2021-01-01 are used (pre-2021 coverage is sparse and excluded).`,
      'Dated by when ransomware.live discovered the post. Claims are not verified breaches.',
      'Tracker coverage grows as more leak sites are monitored — part of any long-run rise can be coverage, not attacks.',
      `Cloudflare collector: archives are refreshed one per run (current year every 30 min, older years daily/weekly); oldest archive copy fetched ${oldest}.`,
      ...(missing.length ? [`Archives not yet collected or failing: ${missing.join(', ')} — their claims are missing (counts for those years are incomplete).`] : []),
    ],
    data: { groups: G.list, sectors: S.list, countries: C.list, d, p, g, s, c },
  };
}
export function ransomwareLiveFrom(chunks: RwChunk[]) {
  const cutoff = Date.now() - 30 * DAY;
  const items = chunks.flatMap((k) => k.recent).filter((x) => Date.parse(x.discovered) >= cutoff).sort((a, b) => b.discovered.localeCompare(a.discovered));
  const seen = new Set<string>();
  const out = items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  return { sources: [{ name: 'ransomware.live victims (30d, from per-year archives)', url: 'https://www.ransomware.live', ok: true, count: out.length }], data: { scanned: chunks.reduce((a, k) => a + k.total, 0), items: out } };
}

/* ---------------------------------------------------------------- CISA KEV (full catalogue) */
export async function kevHistory(pre?: any): Promise<Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>> {
  const url = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
  const j: any = pre ?? await getJSON(url, {}, 45000);
  const V = dict(), P = dict();
  const d: number[] = [], v: number[] = [], p: number[] = [], r: number[] = [], id: string[] = [];
  for (const x of j.vulnerabilities || []) {
    const t = Date.parse(x.dateAdded + 'T00:00:00Z'); if (isNaN(t)) continue;
    d.push(dnum(t)); id.push(x.cveID); v.push(V.id(norm(x.vendorProject))); p.push(P.id(norm(x.product))); r.push(x.knownRansomwareCampaignUse === 'Known' ? 1 : 0);
  }
  return {
    source: [{ name: 'CISA Known Exploited Vulnerabilities catalogue', url }],
    start: '2021-11-03', testFrom: '2022-04-01', end: iso(today()),
    notes: [
      `${id.length.toLocaleString('en')} catalogue entries (version ${j.catalogVersion}), dated by dateAdded.`,
      'Nov 2021 – Mar 2022 was the initial catalogue seeding (hundreds of older CVEs added in bulk); it is shown but excluded from trend tests.',
      'Severity: Critical = known use in ransomware campaigns, High = other known exploitation.',
    ],
    data: { vendors: V.list, products: P.list, d, v, p, r, id },
  };
}

/* ---------------------------------------------------------------- SANS ISC / DShield daily summary */
export async function dshieldHistory(): Promise<Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>> {
  const url = `https://isc.sans.edu/api/dailysummary/2020-01-01/${iso(today())}?json`;
  const j: any[] = await getJSON(url, {}, 60000);
  const rows = (Array.isArray(j) ? j : []).filter((x) => x?.date && x.records != null);
  return {
    source: [{ name: 'SANS ISC DShield daily summary', url: 'https://isc.sans.edu/api/#dailysummary' }],
    start: rows[0]?.date || '2020-01-01', testFrom: rows[0]?.date || '2020-01-01', end: rows[rows.length - 1]?.date || iso(today()),
    notes: [
      'Firewall-log reports submitted by volunteer DShield sensors. Volume depends on how many sensors report, so it is a scanning-noise indicator, not an incident count.',
      'Days missing from the API are shown as gaps.',
    ],
    data: { d: rows.map((x) => dnum(Date.parse(x.date + 'T00:00:00Z'))), records: rows.map((x) => +x.records), sources: rows.map((x) => +x.sources), targets: rows.map((x) => +x.targets) },
  };
}

/* ---------------------------------------------------------------- NVD resumable backfill */
// Full records for CRITICAL and HIGH (CVSS v3 severity) in fixed 120-day windows (the API maximum),
// plus monthly COUNT queries (resultsPerPage=1) for MEDIUM, LOW and ALL published CVEs.
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NVD_START = Date.UTC(2024, 0, 1);
const W = 120;
const SEVS = ['CRITICAL', 'HIGH'] as const;
const CNT = ['MEDIUM', 'LOW', 'ALL'] as const;
interface WinSev { total: number; next: number; done: boolean; fetchedAt: number }
interface NvdState {
  v: 2; windows: Record<string, Partial<Record<(typeof SEVS)[number], WinSev>>>;
  items: Record<string, [number, number, number | null, string, string]>; // id -> [day, sev(0 crit,1 high), score, vendor, product]
  months: Record<string, Partial<Record<(typeof CNT)[number], { n: number; fetchedAt: number }>>>;
  lastError?: string; lastErrorAt?: number; lastRunAt?: number; requests?: number;
}
const nvdTime = (t: number) => new Date(t).toISOString().slice(0, 23);
function windowsList() { const out: { key: string; a: number; b: number }[] = []; for (let a = NVD_START; a <= Date.now(); a += W * DAY) out.push({ key: new Date(a).toISOString().slice(0, 10), a, b: Math.min(a + W * DAY, Date.now() + DAY) }); return out; }
function monthsList() { const out: { key: string; a: number; b: number }[] = []; const d = new Date(NVD_START); while (d.getTime() <= Date.now()) { const a = d.getTime(); d.setUTCMonth(d.getUTCMonth() + 1); out.push({ key: new Date(a).toISOString().slice(0, 7), a, b: d.getTime() }); } return out; }
const RECENT = 60 * DAY, REFRESH = 12 * 3600_000;

let nvdState: NvdState | null = null;
/** Drop per-isolate caches so the next call re-reads the persistent store (serverless collector). */
export function resetHistoryCaches() { nvdState = null; snapCache = null; }
let nvdRunning = false;
async function loadNvd(store: Store): Promise<NvdState> {
  if (nvdState) return nvdState;
  const s = await store.get('nvd-backfill');
  nvdState = s && s.v === 2 ? s : { v: 2, windows: {}, items: {}, months: {}, requests: 0 };
  return nvdState!;
}
type Task = { kind: 'rec'; win: { key: string; a: number; b: number }; sev: (typeof SEVS)[number]; start: number } | { kind: 'cnt'; m: { key: string; a: number; b: number }; sev: (typeof CNT)[number] };
function nextTask(st: NvdState): Task | null {
  const now = Date.now();
  const wins = windowsList().reverse(), months = monthsList().reverse();
  // newest periods first; recent periods are refreshed every 12h because NVD keeps scoring older CVEs (backlog)
  for (const w of wins) {
    for (const sev of SEVS) {
      const ws = st.windows[w.key]?.[sev];
      const recent = w.b > now - RECENT;
      if (!ws || !ws.done) return { kind: 'rec', win: w, sev, start: ws?.next ?? 0 };
      if (recent && now - ws.fetchedAt > REFRESH) return { kind: 'rec', win: w, sev, start: 0 };
    }
    for (const m of months.filter((m) => m.a >= w.a && m.a < w.b)) for (const sev of CNT) {
      const ms = st.months[m.key]?.[sev];
      if (!ms || (m.b > now - RECENT && now - ms.fetchedAt > REFRESH)) return { kind: 'cnt', m, sev };
    }
  }
  return null;
}
function progressOf(st: NvdState) {
  let total = 0, done = 0;
  for (const w of windowsList()) for (const s of SEVS) { total++; if (st.windows[w.key]?.[s]?.done) done++; }
  for (const m of monthsList()) for (const s of CNT) { total++; if (st.months[m.key]?.[s]) done++; }
  return { done, total, running: nvdRunning, requests: st.requests || 0, lastError: st.lastError, lastErrorAt: st.lastErrorAt ? new Date(st.lastErrorAt).toISOString() : undefined, lastRunAt: st.lastRunAt ? new Date(st.lastRunAt).toISOString() : undefined };
}
function vendorOf(cve: any): [string, string] {
  for (const c of cve.configurations || []) for (const n of c.nodes || []) for (const m of n.cpeMatch || []) {
    if (m.vulnerable && m.criteria) { const p = String(m.criteria).split(':'); return [norm(p[3]), norm(p[4])]; }
  }
  const a = cve.affected?.[0]?.affectedData?.[0];
  return a ? [norm(a.vendor), norm(a.product)] : ['', ''];
}
/** Perform ONE polite NVD request (returns false when nothing is pending). */
export async function nvdStep(store: Store, env: Env): Promise<boolean> {
  const st = await loadNvd(store);
  const t = nextTask(st);
  if (!t) return false;
  const headers: Record<string, string> = env.NVD_API_KEY ? { apiKey: env.NVD_API_KEY } : {};
  st.lastRunAt = Date.now(); st.requests = (st.requests || 0) + 1;
  try {
    if (t.kind === 'rec') {
      const url = `${NVD}?cvssV3Severity=${t.sev}&pubStartDate=${nvdTime(t.win.a)}&pubEndDate=${nvdTime(t.win.b - 1)}&resultsPerPage=2000&startIndex=${t.start}`;
      await nvdGate(env);
      const j: any = await getJSON(url, { headers }, 150000);
      const sevIdx = t.sev === 'CRITICAL' ? 0 : 1;
      if (t.start === 0) for (const [id, r] of Object.entries(st.items)) if (r[1] === sevIdx && r[0] * DAY >= t.win.a && r[0] * DAY < t.win.b) delete st.items[id]; // full refresh of this slice
      for (const { cve } of j.vulnerabilities || []) {
        const m = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0];
        const [v, p] = vendorOf(cve);
        st.items[cve.id] = [dnum(Date.parse(cve.published + 'Z')), sevIdx, m?.cvssData?.baseScore ?? null, v, p];
      }
      const next = t.start + (j.vulnerabilities?.length || 0);
      const w = (st.windows[t.win.key] ||= {});
      w[t.sev] = { total: j.totalResults, next, done: next >= j.totalResults || !j.vulnerabilities?.length, fetchedAt: w[t.sev]?.done && t.start > 0 ? w[t.sev]!.fetchedAt : Date.now() };
    } else {
      const sevQ = t.sev === 'ALL' ? '' : `cvssV3Severity=${t.sev}&`;
      const url = `${NVD}?${sevQ}pubStartDate=${nvdTime(t.m.a)}&pubEndDate=${nvdTime(t.m.b - 1)}&resultsPerPage=1`;
      await nvdGate(env);
      const j: any = await getJSON(url, { headers }, 60000);
      (st.months[t.m.key] ||= {})[t.sev] = { n: +j.totalResults, fetchedAt: Date.now() };
    }
    st.lastError = undefined;
  } catch (e: any) {
    st.lastError = String(e?.message || e); st.lastErrorAt = Date.now();
    await store.put('nvd-backfill', st);
    throw e;
  }
  await store.put('nvd-backfill', st);
  return true;
}
/** Long-running backfill loop for the Node server (dev/preview). Respects NVD's public rate limit (5 req / 30 s without a key). */
export function startNvdBackfill(store: Store, env: Env, log = console.log) {
  if (nvdRunning) return;
  nvdRunning = true;
  const gap = env.NVD_API_KEY ? 1200 : 6500;
  (async () => {
    let fails = 0;
    while (true) {
      try {
        const more = await nvdStep(store, env);
        fails = 0;
        await sleep(more ? gap : 30 * 60_000);
      } catch (e: any) {
        fails++;
        log(`[nvd-backfill] ${e?.message || e} (retry in ${Math.min(10, fails)} min)`);
        await sleep(Math.min(10, fails) * 60_000);
      }
    }
  })();
}
export async function nvdHistory(store: Store, env: Env, steps = 0): Promise<Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>> {
  // serverless (Cloudflare): advance the backfill a little on each request
  for (let i = 0; i < steps; i++) { try { if (!(await nvdStep(store, env))) break; } catch { break; } }
  const st = await loadNvd(store);
  const V = dict(), P = dict();
  const ids: string[] = [], d: number[] = [], s: number[] = [], sc: (number | null)[] = [], v: number[] = [], p: number[] = [];
  for (const [id, r] of Object.entries(st.items)) { ids.push(id); d.push(r[0]); s.push(r[1]); sc.push(r[2]); v.push(V.id(r[3])); p.push(P.id(r[4])); }
  // day ranges fully covered for CRITICAL+HIGH records
  const covered: [number, number][] = [];
  for (const w of windowsList()) if (SEVS.every((x) => st.windows[w.key]?.[x]?.done)) {
    const a = dnum(w.a), b = Math.min(dnum(w.b) - 1, today());
    const last = covered[covered.length - 1];
    if (last && last[1] === a - 1) last[1] = b; else covered.push([a, b]);
  }
  const months: Record<string, Record<string, number>> = {};
  for (const [k, m] of Object.entries(st.months)) months[k] = Object.fromEntries(Object.entries(m).map(([s2, x]) => [s2.toLowerCase(), x!.n]));
  return {
    source: [{ name: 'NIST NVD CVE API 2.0 (published date, CVSS v3 severity)', url: 'https://nvd.nist.gov/developers/vulnerabilities' }],
    start: iso(dnum(NVD_START)), testFrom: iso(dnum(NVD_START)), end: iso(today()),
    notes: [
      'Daily records: CRITICAL + HIGH CVEs (CVSS v3.x) by publish date, fetched in 120-day windows. MEDIUM/LOW/ALL are monthly totals (count queries).',
      'NVD has an analysis backlog: many recent CVEs are not yet scored, so recent months under-count and get revised upward. CVEs scored only with CVSS v4 are not included.',
      'Backfill is resumable and rate-limited; uncovered periods are gaps until fetched.',
    ],
    data: { ids, d, s, sc, v, p, vendors: V.list, products: P.list, covered, months },
    progress: progressOf(st),
  };
}

/* ---------------------------------------------------------------- daily snapshot store (feeds without history) */
interface Snapshots { v: 1; days: Record<string, { c2?: { online: number; total: number }; infocon?: string; news?: boolean }>; news: Record<string, Record<string, number>>; newsFrom?: string }
let snapCache: Snapshots | null = null;
const lastRec: Record<string, string> = {};
async function loadSnaps(store: Store): Promise<Snapshots> {
  if (snapCache) return snapCache;
  const s = await store.get('snapshots');
  snapCache = s && s.v === 1 ? s : { v: 1, days: {}, news: {} };
  return snapCache!;
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const SEVI: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
/** Record today's aggregate for a feed result (idempotent per upstream fetch). */
export async function recordSnapshot(store: Store, name: string, r: FeedResult) {
  if (!r.ok || !['c2', 'news', 'dshield'].includes(name) || lastRec[name] === r.fetchedAt) return;
  lastRec[name] = r.fetchedAt;
  const s = await loadSnaps(store);
  const day = r.fetchedAt.slice(0, 10);
  const rec = (s.days[day] ||= {});
  const data: any = r.data;
  if (name === 'c2') {
    const online = (data.items || []).filter((x: any) => x.status === 'online').length;
    rec.c2 = { online: Math.max(online, rec.c2?.online ?? 0), total: Math.max((data.items || []).length, rec.c2?.total ?? 0) };
  } else if (name === 'dshield' && data.infocon) rec.infocon = data.infocon;
  else if (name === 'news') {
    const items: any[] = (data.items || []).filter((x: any) => x.published);
    if (!s.newsFrom) {
      // first run: only days that EVERY responding RSS source still fully covers
      const oldest: Record<string, string> = {};
      for (const it of items) { const d = it.published.slice(0, 10); if (!oldest[it.source] || d < oldest[it.source]) oldest[it.source] = d; }
      const mins = Object.values(oldest).sort();
      const from = mins[mins.length - 1];
      s.newsFrom = from ? iso(dnum(Date.parse(from)) + 1) : day;
    }
    for (const it of items) {
      const d = it.published.slice(0, 10);
      if (d < s.newsFrom! || d > day) continue;
      (s.news[d] ||= {})[hash(it.link || it.id)] = SEVI[newsSeverity(`${it.title} ${it.summary}`).sev];
    }
    rec.news = true;
  }
  await store.put('snapshots', s);
}
export async function snapshotHistory(store: Store): Promise<Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>> {
  const s = await loadSnaps(store);
  const days = Object.keys(s.days).sort();
  const news: Record<string, number[]> = {};
  // a news day counts as covered if the server polled news that day or the next (RSS keeps ≥ 1–2 days of items)
  const t = today();
  if (s.newsFrom) for (let d = dnum(Date.parse(s.newsFrom)); d <= t; d++) {
    const k = iso(d);
    if (!(s.days[k]?.news || s.days[iso(d + 1)]?.news)) continue;
    const c = [0, 0, 0, 0]; for (const v of Object.values(s.news[k] || {})) c[v]++;
    news[k] = c;
  }
  return {
    source: [{ name: `SENTINEL snapshot store (${store.kind})`, url: '' }],
    start: days[0] || iso(t), testFrom: days[0] || iso(t), end: iso(t),
    notes: [
      'Daily aggregates recorded by this server going forward for feeds that publish no history (Feodo C2 count, ISC Infocon, news volume).',
      'Days the server was not running are gaps. Trend tests need at least 8 recorded periods.',
    ],
    data: { days: s.days, news, newsFrom: s.newsFrom || null },
  };
}

/* ---------------------------------------------------------------- registry + memo */
export const HISTORY: Record<string, { label: string; ttl: number }> = {
  ransomware: { label: 'Ransomware leak-site claims', ttl: 3600 },
  kev: { label: 'CISA KEV additions', ttl: 6 * 3600 },
  nvd: { label: 'NVD CVEs', ttl: 120 },
  dshield: { label: 'DShield sensor reports', ttl: 3 * 3600 },
  snapshots: { label: 'Recorded snapshots', ttl: 120 },
};
const hmemo = new Map<string, { at: number; v: HistoryPayload; pending?: Promise<HistoryPayload> }>();
export async function getHistory(name: string, env: Env, store: Store, opts: { nvdSteps?: number } = {}): Promise<HistoryPayload> {
  const def = HISTORY[name];
  const base = { stream: name, fetchedAt: new Date().toISOString() };
  if (!def) return { ...base, ok: false, error: 'Unknown stream', source: [], start: '', testFrom: '', end: '', notes: [] };
  const hit = hmemo.get(name);
  if (hit && Date.now() - hit.at < def.ttl * 1000) return hit.v;
  if (hit?.pending) return hit.pending;
  const run = async (): Promise<HistoryPayload> => {
    try {
      const r = name === 'ransomware' ? await ransomwareHistory() : name === 'kev' ? await kevHistory() : name === 'dshield' ? await dshieldHistory()
        : name === 'nvd' ? await nvdHistory(store, env, opts.nvdSteps || 0) : await snapshotHistory(store);
      const v: HistoryPayload = { ...base, ok: true, ...r, store: store.kind };
      if (name !== 'nvd' && name !== 'snapshots') store.put(`hist-${name}`, v).catch(() => {});
      return v;
    } catch (e: any) {
      // fall back to the last good copy persisted in the store (clearly flagged stale)
      const prev = await store.get(`hist-${name}`).catch(() => null);
      if (prev) return { ...prev, stale: true, error: String(e?.message || e) };
      return { ...base, ok: false, error: String(e?.message || e), source: [], start: '', testFrom: '', end: '', notes: [] };
    }
  };
  const pending = run();
  hmemo.set(name, { at: hit?.at ?? 0, v: hit?.v as HistoryPayload, pending });
  const v = await pending;
  hmemo.set(name, { at: v.ok && !v.stale ? Date.now() : Date.now() - (def.ttl - 60) * 1000, v });
  return v;
}

/** Node server: poll snapshot feeds every 30 min so the store keeps recording without a browser open. */
export function startRecorder(store: Store, env: Env) {
  const tick = async () => { for (const f of ['c2', 'news', 'dshield']) { try { await recordSnapshot(store, f, await getFeed(f, env)); } catch { /* feed shows offline */ } } };
  tick(); setInterval(tick, 30 * 60_000);
}

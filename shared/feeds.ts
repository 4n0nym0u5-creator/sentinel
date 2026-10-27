/*
 * Feed adapters shared by the local Vite proxy (dev/preview) and the
 * Cloudflare Pages Function (functions/api/feed/[name].ts).
 * Every adapter fetches a REAL public source and normalises it. Nothing is
 * ever synthesised: on failure the adapter throws and the UI shows the feed
 * as OFFLINE with the error message.
 */
import { XMLParser } from 'fast-xml-parser';
import { cryptoFeed, cryptoVulns } from './crypto';
import { frontierFeed } from './frontier';

export type Env = Record<string, string | undefined>;
export interface FeedResult {
  feed: string;
  ok: boolean;
  fetchedAt: string; // when the proxy fetched upstream (ISO, UTC)
  ttl: number; // seconds the proxy caches
  sources: { name: string; url: string; ok: boolean; error?: string; count?: number }[];
  error?: string;
  data?: unknown;
}

export const UA = 'CyberSituationMonitor/1.0 (personal SOC dashboard; polite polling)';
const DAY = 86400_000;

function anySignal(a: AbortSignal, b: AbortSignal) { const c = new AbortController(); const f = () => c.abort(); if (a.aborted || b.aborted) c.abort(); a.addEventListener('abort', f); b.addEventListener('abort', f); return c.signal; }
export async function get(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: init.signal ? anySignal(init.signal, ctl.signal) : ctl.signal,
      headers: { 'User-Agent': UA, Accept: '*/*', ...(init.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`Timeout after ${timeoutMs / 1000}s (${new URL(url).host})`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
/** GET + parse JSON; the timeout covers the body download too (not just the headers). */
/** Global NVD politeness gate shared by the live feed, the history backfill and the crypto keyword searches
 *  (public limit: 5 requests / 30 s without an API key). */
let nvdNext = 0;
export async function nvdGate(env: Env = {}) {
  const gap = env.NVD_API_KEY ? 1200 : 6500;
  const now = Date.now(); const at = Math.max(now, nvdNext); nvdNext = at + gap;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}
export async function getJSON(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await (await get(url, { ...init, signal: ctl.signal }, timeoutMs)).json(); }
  catch (e: any) { if (e?.name === 'AbortError' || ctl.signal.aborted) throw new Error(`Timeout after ${timeoutMs / 1000}s (${new URL(url).host})`); throw e; }
  finally { clearTimeout(t); }
}

/** Read only the first `maxBytes` of a response body (for very large feeds). */
export async function readPrefix(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = '';
  let n = 0;
  while (n < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    out += dec.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  return out;
}

export const strip = (s: unknown, max = 320) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);

/* ------------------------------------------------------------------ EPSS */
export async function epss(cves: string[]): Promise<Record<string, { epss: number; pct: number }>> {
  const out: Record<string, { epss: number; pct: number }> = {};
  for (let i = 0; i < cves.length; i += 100) {
    const chunk = cves.slice(i, i + 100);
    const j: any = await getJSON(`https://api.first.org/data/v1/epss?cve=${chunk.join(',')}&limit=100`);
    for (const r of j.data || []) out[r.cve] = { epss: +r.epss, pct: +r.percentile };
  }
  return out;
}

/* ------------------------------------------------------------- CISA KEV */
export const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
export async function kev(pre?: any): Promise<Partial<FeedResult>> {
  const url = KEV_URL;
  const j: any = pre ?? await getJSON(url, {}, 30000);
  const all: any[] = j.vulnerabilities || [];
  const now = Date.now();
  const recent = all
    .filter((v) => now - Date.parse(v.dateAdded) < 120 * DAY)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, 200);
  const sources: FeedResult['sources'] = [{ name: 'CISA KEV catalog', url, ok: true, count: all.length }];
  let scores: Record<string, { epss: number; pct: number }> = {};
  try {
    scores = await epss(recent.map((v) => v.cveID));
    sources.push({ name: 'FIRST EPSS (enrichment)', url: 'https://api.first.org/data/v1/epss', ok: true, count: Object.keys(scores).length });
  } catch (e: any) {
    sources.push({ name: 'FIRST EPSS (enrichment)', url: 'https://api.first.org/data/v1/epss', ok: false, error: String(e.message || e) });
  }
  return {
    sources,
    data: {
      catalogVersion: j.catalogVersion,
      dateReleased: j.dateReleased,
      total: all.length,
      items: recent.map((v) => ({
        id: v.cveID,
        vendor: v.vendorProject,
        product: v.product,
        name: v.vulnerabilityName,
        dateAdded: v.dateAdded,
        dueDate: v.dueDate,
        desc: strip(v.shortDescription, 600),
        action: strip(v.requiredAction, 300),
        ransomware: v.knownRansomwareCampaignUse === 'Known',
        cwes: v.cwes || [],
        epss: scores[v.cveID]?.epss ?? null,
        epssPct: scores[v.cveID]?.pct ?? null,
      })),
    },
  };
}

/* ------------------------------------------------------------- NVD 2.0 */
const nvdDate = (d: Date) => d.toISOString().replace('Z', '').slice(0, 23);
export async function nvd(env: Env): Promise<Partial<FeedResult>> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * DAY);
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&pubStartDate=${nvdDate(start)}&pubEndDate=${nvdDate(end)}&resultsPerPage=500`;
  const headers: Record<string, string> = env.NVD_API_KEY ? { apiKey: env.NVD_API_KEY } : {};
  await nvdGate(env);
  const j: any = await getJSON(url, { headers }, 40000);
  const items = (j.vulnerabilities || []).map(({ cve }: any) => {
    const m = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0] || cve.metrics?.cvssMetricV40?.[0];
    return {
      id: cve.id,
      published: cve.published + 'Z',
      lastModified: cve.lastModified + 'Z',
      status: cve.vulnStatus,
      source: cve.sourceIdentifier,
      desc: strip(cve.descriptions?.find((d: any) => d.lang === 'en')?.value, 600),
      score: m?.cvssData?.baseScore ?? null,
      vector: m?.cvssData?.vectorString ?? '',
      cwe: cve.weaknesses?.[0]?.description?.[0]?.value ?? '',
      ref: cve.references?.[0]?.url ?? '',
      kev: !!cve.cisaExploitAdd,
    };
  });
  items.sort((a: any, b: any) => b.published.localeCompare(a.published));
  const sources: FeedResult['sources'] = [{ name: 'NIST NVD CVE API 2.0 (CVSS v3 CRITICAL, 30d)', url: 'https://services.nvd.nist.gov/rest/json/cves/2.0', ok: true, count: j.totalResults }];
  try {
    const s = await epss(items.slice(0, 300).map((i: any) => i.id));
    for (const i of items) { i.epss = s[i.id]?.epss ?? null; i.epssPct = s[i.id]?.pct ?? null; }
    sources.push({ name: 'FIRST EPSS (enrichment)', url: 'https://api.first.org/data/v1/epss', ok: true, count: Object.keys(s).length });
  } catch (e: any) {
    sources.push({ name: 'FIRST EPSS (enrichment)', url: 'https://api.first.org/data/v1/epss', ok: false, error: String(e.message || e) });
  }
  return { sources, data: { total: j.totalResults, items } };
}

/* ------------------------------------------------------- ENISA EUVD */
export async function euvd(): Promise<Partial<FeedResult>> {
  const base = 'https://euvdservices.enisa.europa.eu/api';
  const map = (v: any, kind: string) => ({
    id: v.id,
    kind,
    cve: String(v.aliases || '').split('\n').find((a: string) => a.startsWith('CVE-')) || '',
    desc: strip(v.description, 500),
    published: v.datePublished ? new Date(v.datePublished).toISOString() : null,
    exploitedSince: v.exploitedSince ? new Date(v.exploitedSince).toISOString() : null,
    score: v.baseScore ?? null,
    scoreVersion: v.baseScoreVersion,
    vendor: v.enisaIdVendor?.[0]?.vendor?.name || v.assigner || '',
    epss: v.epss ?? null,
    ref: String(v.references || '').split('\n')[0] || '',
  });
  const sources: FeedResult['sources'] = [];
  const items: any[] = [];
  for (const [kind, path] of [['exploited', 'search?exploited=true&size=60'], ['critical', 'criticalvulnerabilities'], ['latest', 'lastvulnerabilities']] as const) {
    const url = `${base}/${path}`;
    try {
      const raw: any = await getJSON(url);
      const j: any[] = Array.isArray(raw) ? raw : raw.items || [];
      j.forEach((v) => items.push(map(v, kind)));
      sources.push({ name: `ENISA EUVD ${kind}`, url, ok: true, count: j.length });
    } catch (e: any) {
      sources.push({ name: `ENISA EUVD ${kind}`, url, ok: false, error: String(e.message || e) });
    }
  }
  if (!sources.some((s) => s.ok)) throw new Error(sources.map((s) => s.error).join('; '));
  return { sources, data: { items } };
}

/* ----------------------------------------------- ransomware.live victims */
async function ransomware(): Promise<Partial<FeedResult>> {
  // victims.json is ~20 MB, newest first. Stream it and stop once we pass 30 days.
  const url = 'https://data.ransomware.live/victims.json';
  const res = await get(url, {}, 45000);
  const cutoff = Date.now() - 30 * DAY;
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const items: any[] = [];
  let buf = '';
  let depth = 0, inStr = false, esc = false, objStart = -1, older = 0, scanned = 0;
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const startIdx = buf.length;
    buf += dec.decode(value, { stream: true });
    for (let i = startIdx; i < buf.length; i++) {
      const ch = buf[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') { if (depth === 1) objStart = i; depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 1 && objStart >= 0) {
          const v = JSON.parse(buf.slice(objStart, i + 1));
          scanned++;
          const t = Date.parse(v.discovered);
          if (t >= cutoff) {
            older = 0;
            items.push({
              id: `${v.group_name}|${v.post_title}`,
              victim: strip(v.post_title, 140),
              group: v.group_name,
              discovered: new Date(t).toISOString(),
              published: v.published ? new Date(v.published).toISOString() : null,
              country: (v.country || '').toUpperCase().slice(0, 2) || null,
              sector: v.activity && v.activity !== 'Not Found' ? v.activity : 'Unknown',
              website: v.website || '',
              desc: strip(v.description, 360),
            });
          } else if (++older > 200) break outer;
          objStart = -1;
        }
      } else if (ch === '[' && depth === 0) depth = 1;
    }
    // drop consumed text to keep memory small
    const keepFrom = objStart >= 0 ? objStart : buf.length;
    buf = buf.slice(keepFrom);
    if (objStart >= 0) objStart = 0;
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  return { sources: [{ name: 'ransomware.live victims (30d)', url: 'https://www.ransomware.live', ok: true, count: items.length }], data: { scanned, items } };
}

/* --------------------------------------- abuse.ch Feodo Tracker (C2 IPs) */
export async function feodo(): Promise<Partial<FeedResult>> {
  const url = 'https://feodotracker.abuse.ch/downloads/ipblocklist.json';
  const j: any[] = await getJSON(url);
  return {
    sources: [{ name: 'abuse.ch Feodo Tracker botnet C2 blocklist', url, ok: true, count: j.length }],
    data: {
      items: j.map((r) => ({
        id: `${r.ip_address}:${r.port}`,
        ip: r.ip_address, port: r.port, status: r.status, malware: r.malware, country: r.country,
        asn: r.as_number, asName: r.as_name, firstSeen: r.first_seen ? r.first_seen.replace(' ', 'T') + 'Z' : null, lastOnline: r.last_online,
      })),
    },
  };
}

/* ------------------------------- abuse.ch ThreatFox (needs free Auth-Key) */
export async function threatfox(env: Env): Promise<Partial<FeedResult>> {
  const url = 'https://threatfox-api.abuse.ch/api/v1/';
  if (!env.ABUSECH_AUTH_KEY) throw new Error('Not configured: abuse.ch now requires a free Auth-Key (set ABUSECH_AUTH_KEY). See README.');
  const j: any = await getJSON(url, { method: 'POST', headers: { 'Auth-Key': env.ABUSECH_AUTH_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'get_iocs', days: 1 }) });
  if (j.query_status !== 'ok') throw new Error(`ThreatFox: ${j.query_status}`);
  const items = (j.data || []).slice(0, 400).map((r: any) => ({
    id: String(r.id), ioc: r.ioc, type: r.ioc_type, threat: r.threat_type, malware: r.malware_printable, confidence: r.confidence_level,
    firstSeen: r.first_seen ? r.first_seen.replace(' UTC', 'Z').replace(' ', 'T') : null, tags: r.tags || [], reporter: r.reporter,
  }));
  return { sources: [{ name: 'abuse.ch ThreatFox IOCs (24h)', url: 'https://threatfox.abuse.ch', ok: true, count: items.length }], data: { items } };
}

/* -------------------------------------------------- SANS ISC / DShield */
export const geoCache = new Map<string, { country: string | null; asn: number | null; asname: string | null }>();
let geoBudget = Infinity;
/** Cap uncached ISC IP lookups per run (Cloudflare free plan: 50 subrequests per invocation). */
export function setGeoBudget(n: number) { geoBudget = n; }
async function iscIp(ip: string) {
  if (geoCache.has(ip)) return geoCache.get(ip)!;
  if (geoBudget <= 0) throw new Error('enrichment deferred to next run (subrequest budget)');
  geoBudget--;
  const j: any = await getJSON(`https://isc.sans.edu/api/ip/${ip}?json`, {}, 12000);
  const r = { country: j.ip?.ascountry || null, asn: j.ip?.as || null, asname: j.ip?.asname || null };
  geoCache.set(ip, r);
  return r;
}
export async function dshield(): Promise<Partial<FeedResult>> {
  const base = 'https://isc.sans.edu/api';
  const sources: FeedResult['sources'] = [];
  const grab = async (name: string, path: string) => {
    const url = `${base}/${path}`;
    try { const j = await getJSON(url); sources.push({ name, url, ok: true }); return j; }
    catch (e: any) { sources.push({ name, url, ok: false, error: String(e.message || e) }); return null; }
  };
  const today = new Date();
  const from = new Date(today.getTime() - 14 * DAY).toISOString().slice(0, 10);
  const [info, attackers, ports, daily] = await Promise.all([
    grab('ISC Infocon', 'infocon?json'),
    grab('DShield top attacking sources', 'sources/attacks/40?json'),
    grab('DShield top target ports', 'topports/records/15?json'),
    grab('DShield daily summary (14d)', `dailysummary/${from}/${today.toISOString().slice(0, 10)}?json`),
  ]);
  if (!sources.some((s) => s.ok)) throw new Error(sources.map((s) => s.error).join('; '));
  const att: any[] = Array.isArray(attackers) ? attackers : [];
  // ASN-country enrichment from ISC's own IP API (cached; 4 at a time to be polite)
  let geoOk = 0, geoErr = '';
  for (let i = 0; i < att.length; i += 4) {
    await Promise.all(att.slice(i, i + 4).map(async (a) => {
      try { Object.assign(a, await iscIp(a.ip)); geoOk++; } catch (e: any) { geoErr = String(e.message || e); }
    }));
  }
  sources.push({ name: 'ISC IP API (AS-country enrichment)', url: `${base}/ip/`, ok: geoOk > 0 || att.length === 0, count: geoOk, error: geoErr || undefined });
  const portList = ports ? Object.values(ports).filter((p: any) => p && p.targetport != null) : [];
  return {
    sources,
    data: {
      infocon: info?.status ?? null,
      attackers: att.map((a) => ({ ip: a.ip, attacks: +a.attacks, reports: +a.count, firstSeen: a.firstseen, lastSeen: a.lastseen, country: a.country ?? null, asn: a.asn ?? null, asname: a.asname ?? null })),
      ports: portList.map((p: any) => ({ port: +p.targetport, records: +p.records, targets: +p.targets, sources: +p.sources })),
      daily: Array.isArray(daily) ? daily.map((d: any) => ({ date: d.date, records: +d.records, sources: +d.sources, targets: +d.targets })) : [],
    },
  };
}

/* ------------------------------------------------------------- News RSS */
/** One RSS/Atom/RDF source. `cc` = home country of the publisher (ISO-2; EU bodies use 'EU'), `kind` = national CERT /
 *  cyber agency vs news outlet, `filter` = general-news outlet whose items are kept only if they match CYBER_RX,
 *  `lang` = feed language when not English. Regional sources are fetched in small batches (see REGIONAL_BATCH). */
export type NewsSource = { name: string; url: string; prefix?: number; cc?: string; region: string; kind: 'cert' | 'news'; filter?: boolean; lang?: string; tz?: string };
/** Cyber keyword gate for general-news feeds (English + the non-English feeds we carry). */
export const CYBER_RX = /cyber|hack(er|ed|ing|s)?\b|ransomware|malware|spyware|phishing|data breach|breach(ed)? |data leak|leaked data|unauthori[sz]ed access|ddos|zero-day|vulnerabilit|extortion|infostealer|botnet|stolen (data|credentials|login)|personal (data|information) (of|was|were) (exposed|leaked|stolen)|ciberataque|ciberseguridad|hackeo|hacker|vazamento|ataque hacker|cyberangriff|sicherheitslücke|cyberattaque|piratage|サイバー|不正アクセス|ランサム|情報漏え?い|해킹|사이버|랜섬|개인정보 유출/i;
export const NEWS_SOURCES: NewsSource[] = [
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'The Record', url: 'https://therecord.media/feed', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', region: 'Global', cc: 'IN', kind: 'news' },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'The Register · Security', url: 'https://www.theregister.com/security/headlines.atom', region: 'Global', cc: 'GB', kind: 'news' },
  { name: 'SANS ISC Diary', url: 'https://isc.sans.edu/rssfeed_full.xml', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', prefix: 600_000, region: 'Americas', cc: 'US', kind: 'cert' },
  { name: 'UK NCSC', url: 'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml', region: 'Europe', cc: 'GB', kind: 'cert' },
  { name: 'ACSC (cyber.gov.au) Alerts', url: 'https://www.cyber.gov.au/rss/alerts', region: 'Oceania', cc: 'AU', kind: 'cert' },
];
/** Regional + extra global sources, collected in batches of REGIONAL_BATCH per cron invocation (each batch hourly). */
export const REGIONAL_SOURCES: NewsSource[] = [
  // Global outlets
  { name: 'Help Net Security', url: 'https://www.helpnetsecurity.com/feed/', region: 'Global', cc: 'HR', kind: 'news' },
  { name: 'CyberScoop', url: 'https://cyberscoop.com/feed/', region: 'Global', cc: 'US', kind: 'news' },
  { name: 'Infosecurity Magazine', url: 'https://www.infosecurity-magazine.com/rss/news/', prefix: 150_000, region: 'Global', cc: 'GB', kind: 'news' },
  { name: 'The Cyber Express', url: 'https://www.thecyberexpress.com/feed/', prefix: 200_000, region: 'Global', cc: 'IN', kind: 'news' },
  // Oceania
  { name: 'AusCERT bulletins', url: 'https://portal.auscert.org.au/rss/bulletins/', prefix: 200_000, region: 'Oceania', cc: 'AU', kind: 'cert' },
  { name: 'SecurityBrief Australia', url: 'https://securitybrief.com.au/feed', region: 'Oceania', cc: 'AU', kind: 'news' },
  { name: 'iTnews (AU)', url: 'https://www.itnews.com.au/RSS/rss.ashx', region: 'Oceania', cc: 'AU', kind: 'news', filter: true },
  { name: 'SecurityBrief New Zealand', url: 'https://www.securitybrief.co.nz/feed', region: 'Oceania', cc: 'NZ', kind: 'news' },
  { name: 'IT Brief New Zealand', url: 'https://itbrief.co.nz/feed', region: 'Oceania', cc: 'NZ', kind: 'news', filter: true },
  // Europe
  { name: 'CERT-EU advisories', url: 'https://cert.europa.eu/publications/security-advisories-rss', region: 'Europe', cc: 'EU', kind: 'cert' },
  { name: 'CERT-EU threat intel', url: 'https://cert.europa.eu/publications/threat-intelligence-rss', region: 'Europe', cc: 'EU', kind: 'cert' },
  { name: 'UK NCSC (all)', url: 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml', region: 'Europe', cc: 'GB', kind: 'cert' },
  { name: 'Computer Weekly · Security', url: 'https://www.computerweekly.com/rss/IT-security.xml', prefix: 150_000, region: 'Europe', cc: 'GB', kind: 'news' },
  { name: 'Guardian · Data & security', url: 'https://www.theguardian.com/technology/data-computer-security/rss', region: 'Europe', cc: 'GB', kind: 'news' },
  { name: 'BSI CERT-Bund (DE)', url: 'https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_CSW.xml', region: 'Europe', cc: 'DE', kind: 'cert', lang: 'de' },
  { name: 'BSI press (DE)', url: 'https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_Presse_Veranstaltungen.xml', region: 'Europe', cc: 'DE', kind: 'cert', lang: 'de' },
  { name: 'heise Security (DE)', url: 'https://www.heise.de/security/rss/news-atom.xml', region: 'Europe', cc: 'DE', kind: 'news', lang: 'de' },
  { name: 'CERT-FR / ANSSI (FR)', url: 'https://www.cert.ssi.gouv.fr/feed/', region: 'Europe', cc: 'FR', kind: 'cert', lang: 'fr' },
  { name: 'NCSC-NL advisories', url: 'https://advisories.ncsc.nl/rss/advisories', region: 'Europe', cc: 'NL', kind: 'cert', lang: 'nl' },
  { name: 'NCSC-NL news', url: 'https://feeds.ncsc.nl/nieuws.rss', prefix: 120_000, region: 'Europe', cc: 'NL', kind: 'cert', lang: 'nl' },
  { name: 'CCB Belgium advisories', url: 'https://ccb.belgium.be/advisories.xml', region: 'Europe', cc: 'BE', kind: 'cert' },
  { name: 'CERT.at (AT)', url: 'https://cert.at/cert-at.en.blog.rss_2.0.xml', prefix: 150_000, region: 'Europe', cc: 'AT', kind: 'cert' },
  { name: 'NCSC Switzerland', url: 'https://www.newsd.admin.ch/newsd/feeds/rss?lang=en&org-nr=1101', region: 'Europe', cc: 'CH', kind: 'cert' },
  { name: 'CSIRT Italia / ACN (IT)', url: 'https://www.acn.gov.it/portale/feedrss/-/journal/rss/20119/723192', region: 'Europe', cc: 'IT', kind: 'cert', lang: 'it' },
  { name: 'INCIBE-CERT (ES)', url: 'https://www.incibe.es/en/incibe-cert/alerta-temprana/avisos/feed', region: 'Europe', cc: 'ES', kind: 'cert' },
  { name: 'CERT Polska', url: 'https://cert.pl/en/rss.xml', region: 'Europe', cc: 'PL', kind: 'cert' },
  { name: 'NCSC-FI (Traficom)', url: 'https://www.kyberturvallisuuskeskus.fi/feed/rss/en', prefix: 120_000, region: 'Europe', cc: 'FI', kind: 'cert' },
  { name: 'CERT-SE (SE)', url: 'https://www.cert.se/feed.rss', region: 'Europe', cc: 'SE', kind: 'cert', lang: 'sv' },
  { name: 'NSM NCSC (NO)', url: 'https://nsm.no/fagomrader/digital-sikkerhet/nasjonalt-cybersikkerhetssenter/varsler-fra-ncsc/rss/', region: 'Europe', cc: 'NO', kind: 'cert', lang: 'no' },
  { name: 'CERT-UA (UA)', url: 'https://cert.gov.ua/api/articles/rss', region: 'Europe', cc: 'UA', kind: 'cert', lang: 'uk' },
  // Americas
  { name: 'Canadian Centre for Cyber Security alerts', url: 'https://cyber.gc.ca/webservice/en/rss/alerts', prefix: 150_000, region: 'Americas', cc: 'CA', kind: 'cert' },
  { name: 'Canadian Centre for Cyber Security news', url: 'https://cyber.gc.ca/webservice/en/rss/news', prefix: 150_000, region: 'Americas', cc: 'CA', kind: 'cert' },
  { name: 'CERT.br (BR)', url: 'https://www.cert.br/rss/certbr-rss.xml', region: 'Americas', cc: 'BR', kind: 'cert', lang: 'pt' },
  { name: 'CISO Advisor (BR)', url: 'https://www.cisoadvisor.com.br/feed/', region: 'Americas', cc: 'BR', kind: 'news', lang: 'pt' },
  { name: 'WeLiveSecurity Español (LatAm)', url: 'https://www.welivesecurity.com/es/rss/feed/', prefix: 120_000, region: 'Americas', kind: 'news', lang: 'es' },
  { name: 'Infobae (AR)', url: 'https://www.infobae.com/arc/outboundfeeds/rss/', prefix: 250_000, region: 'Americas', cc: 'AR', kind: 'news', filter: true, lang: 'es' },
  // Asia
  { name: 'JPCERT/CC alerts', url: 'https://www.jpcert.or.jp/english/rss/jpcert-en.rdf', region: 'Asia', cc: 'JP', kind: 'cert' },
  { name: 'JPCERT/CC blog', url: 'https://blogs.jpcert.or.jp/en/atom.xml', prefix: 120_000, region: 'Asia', cc: 'JP', kind: 'cert' },
  { name: 'IPA security alerts (JP)', url: 'https://www.ipa.go.jp/security/alert-rss.rdf', region: 'Asia', cc: 'JP', kind: 'cert', lang: 'ja' },
  { name: 'Japan Times', url: 'https://www.japantimes.co.jp/news/feed/', region: 'Asia', cc: 'JP', kind: 'news', filter: true },
  { name: 'Mainichi (EN)', url: 'https://mainichi.jp/english/rss/etc/english_latest.rss', region: 'Asia', cc: 'JP', kind: 'news', filter: true },
  { name: 'Nikkei Asia', url: 'https://asia.nikkei.com/rss/feed/nar', region: 'Asia', cc: 'JP', kind: 'news', filter: true },
  { name: 'KISA / KrCERT (KR)', url: 'https://www.boho.or.kr/kr/rss.do?bbsId=B0000133', region: 'Asia', cc: 'KR', kind: 'cert', lang: 'ko', tz: '+09:00' },
  { name: 'Dailysecu (KR)', url: 'https://www.dailysecu.com/rss/S1N2.xml', region: 'Asia', cc: 'KR', kind: 'news', lang: 'ko', tz: '+09:00' },
  { name: 'Yonhap (EN)', url: 'https://en.yna.co.kr/RSS/news.xml', region: 'Asia', cc: 'KR', kind: 'news', filter: true },
  { name: 'Korea Herald', url: 'https://www.koreaherald.com/rss/newsAll', region: 'Asia', cc: 'KR', kind: 'news', filter: true },
  { name: 'HKCERT bulletins', url: 'https://www.hkcert.org/getrss/security-bulletin', region: 'Asia', cc: 'HK', kind: 'cert' },
  { name: 'HKCERT news', url: 'https://www.hkcert.org/getrss/security-news', region: 'Asia', cc: 'HK', kind: 'cert' },
  { name: 'SCMP · Tech', url: 'https://www.scmp.com/rss/36/feed', region: 'Asia', cc: 'HK', kind: 'news', filter: true },
  { name: 'SecurityBrief Asia', url: 'https://securitybrief.asia/feed', region: 'Asia', kind: 'news' },
  { name: 'ETCISO (IN) · cybercrime', url: 'https://ciso.economictimes.indiatimes.com/rss/cybercrime-fraud', region: 'Asia', cc: 'IN', kind: 'news' },
  { name: 'ETCISO (IN) · top stories', url: 'https://ciso.economictimes.indiatimes.com/rss/topstories', region: 'Asia', cc: 'IN', kind: 'news' },
  // Middle East & Africa
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', region: 'Middle East', cc: 'IL', kind: 'news', filter: true },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', region: 'Middle East', cc: 'SA', kind: 'news', filter: true },
  { name: 'The National (UAE)', url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml', prefix: 200_000, region: 'Middle East', cc: 'AE', kind: 'news', filter: true },
  { name: 'ITWeb Africa', url: 'https://itweb.africa/rss', region: 'Africa', kind: 'news', filter: true },
  { name: 'TechCentral (ZA)', url: 'https://techcentral.co.za/feed/', region: 'Africa', cc: 'ZA', kind: 'news', filter: true },
  { name: 'TechCabal (Africa)', url: 'https://www.techcabal.com/feed/', prefix: 150_000, region: 'Africa', cc: 'NG', kind: 'news', filter: true },
];
export const REGIONAL_BATCH = 5;
export const ALL_NEWS_SOURCES: NewsSource[] = [...NEWS_SOURCES, ...REGIONAL_SOURCES];
/** Feeds we tried and could not use (shown in the coverage panel so gaps are visible, not hidden). */
export const NEWS_DROPPED: { name: string; cc?: string; region: string; why: string }[] = [
  { name: 'NHK World (EN)', cc: 'JP', region: 'Asia', why: 'No public article RSS (only a radio-bulletin podcast); site uses an internal API' },
  { name: 'NCSC New Zealand / CERT NZ', cc: 'NZ', region: 'Oceania', why: 'No RSS feed published (email subscription only)' },
  { name: 'ENISA', cc: 'EU', region: 'Europe', why: 'RSS endpoints return 404' },
  { name: 'CSA Singapore / SingCERT', cc: 'SG', region: 'Asia', why: 'RSS endpoint returns 404' },
  { name: 'CERT-In (India)', cc: 'IN', region: 'Asia', why: 'No usable RSS (empty feed)' },
  { name: 'EG-CERT (Egypt)', cc: 'EG', region: 'Africa', why: 'Feed has no items' },
  { name: 'CERT-IL / INCD (Israel)', cc: 'IL', region: 'Middle East', why: 'gov.il feed returns 403 (bot protection) — not bypassed' },
  { name: 'MyBroadband (ZA)', cc: 'ZA', region: 'Africa', why: '403 (bot protection) — not bypassed' },
  { name: 'Focus Taiwan', cc: 'TW', region: 'Asia', why: 'RSS returns 404' },
  { name: 'GMO Internet news', cc: 'JP', region: 'Asia', why: 'No RSS feed (company newsroom is HTML only)' },
];
export const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text' });
export const txt = (v: any): string => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? txt(v[0]) : v['#text'] != null ? String(v['#text']) : '');
/** Close a byte-capped RSS / Atom / RDF document after its last complete item so it still parses. */
export function closeTruncated(body: string): string {
  if (/<\/(rss|feed|rdf:RDF)>\s*$/.test(body.trim())) return body;
  const i = body.lastIndexOf('</item>'), e = body.lastIndexOf('</entry>');
  if (e > i) return body.slice(0, e + 8) + '</feed>';
  if (i < 0) return body;
  const rdf = /<rdf:RDF/.test(body.slice(0, 2000));
  return body.slice(0, i + 7) + (rdf ? '</rdf:RDF>' : '</channel></rss>');
}
/** Atom <link> can be one object or an array (rel=alternate / self / enclosure). */
export function pickLink(l: any): string {
  if (l == null) return '';
  if (Array.isArray(l)) { const alt = l.find((x) => typeof x === 'object' && (!x['@rel'] || x['@rel'] === 'alternate')); return pickLink(alt ?? l[0]); }
  if (typeof l === 'object') return String(l['@href'] ?? txt(l)).trim();
  return String(l).trim();
}
export function parseFeedItems(body: string, src: { name: string; filter?: boolean; tz?: string; sum?: number }, max = 40) {
  const doc = xml.parse(body);
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.['rdf:RDF']?.item ?? [];
  const list: any[] = Array.isArray(raw) ? raw : [raw];
  const out: any[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const link = pickLink(it.link) || String(it['@rdf:about'] ?? '').trim() || txt(it.guid).trim();
    const pub = (txt(it.pubDate) || txt(it.published) || txt(it.updated) || txt(it['dc:date'])).trim();
    // zone-less local timestamps ("2026-10-27 12:57:49") are interpreted in the source's own zone when known
    const local = src.tz && /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(pub);
    const t = pub ? Date.parse(local ? `${pub.length === 10 ? pub + 'T00:00:00' : pub.replace(' ', 'T')}${src.tz}` : pub) : NaN;
    const cats = ([] as any[]).concat(it.category ?? []).map((c) => (typeof c === 'object' && c['@term'] ? c['@term'] : txt(c))).filter(Boolean).slice(0, 6);
    const item = {
      id: `${src.name}|${txt(it.guid).trim() || link}`,
      source: src.name,
      title: strip(txt(it.title), 220),
      link,
      published: isNaN(t) ? null : new Date(t).toISOString(),
      summary: strip(txt(it.description) || txt(it.summary) || txt(it['content:encoded']) || txt(it.content), src.sum ?? 300),
      tags: cats,
    };
    if (!item.title) continue;
    if (src.filter && !CYBER_RX.test(`${item.title} ${item.summary} ${cats.join(' ')}`)) continue;
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
export async function rssItems(src: NewsSource | { name: string; url: string; prefix?: number; filter?: boolean }) {
  const res = await get(src.url, {}, 20000);
  let body = src.prefix ? await readPrefix(res, src.prefix) : await res.text();
  if (src.prefix) body = closeTruncated(body);
  // the cyber keyword gate applies to general-news NewsSources only (crypto feeds use their own filter downstream)
  const cyber = 'region' in src && !!src.filter;
  return parseFeedItems(body, { name: src.name, filter: cyber, tz: (src as NewsSource).tz }, cyber ? 30 : 40);
}
export type SrcResult = { name: string; url: string; ok: boolean; items?: any[]; error?: string; fetchedAt?: string; scanned?: number };
/** Fetch one RSS source and wrap the outcome (never throws). Used per-source by the Cloudflare collector. */
export async function rssSource(src: NewsSource | { name: string; url: string; prefix?: number; filter?: boolean }): Promise<SrcResult> {
  try { const items = await rssItems(src); return { name: src.name, url: src.url, ok: true, items, fetchedAt: new Date().toISOString() }; }
  catch (e: any) { return { name: src.name, url: src.url, ok: false, error: String(e?.message || e), fetchedAt: new Date().toISOString() }; }
}
/** Keep recent items that have scrolled off a source's (often short: 5–15 item) RSS window, so a story stays
 *  visible for NEWS_RETAIN_DAYS instead of vanishing hours after publication. Only items the source itself published
 *  are kept; a failed fetch still reports the source as offline (the kept items wait for its next good fetch).
 *  Items without a date in the feed (e.g. Nikkei Asia) get the time the collector FIRST saw them (flagged firstSeen). */
export const NEWS_RETAIN_DAYS = 14;
export function retainNews(prev: (SrcResult & { kept?: any[] }) | null | undefined, cur: SrcResult, max = 120, days = NEWS_RETAIN_DAYS): SrcResult & { kept?: any[] } {
  const old = (prev?.items ?? prev?.kept ?? []) as any[];
  const cutoff = Date.now() - days * 86400_000;
  const fresh = (x: any) => { const t = Date.parse(x?.published); return !isNaN(t) && t >= cutoff; };
  if (!cur.ok) return { ...cur, kept: old.filter(fresh).slice(0, max) };
  const byLink = new Map(old.map((x) => [x.link || x.id, x]));
  const now = new Date().toISOString();
  const items = (cur.items ?? []).map((x) => (x.published ? x : { ...x, published: byLink.get(x.link || x.id)?.published ?? now, firstSeen: true }));
  const seen = new Set(items.map((x) => x.link || x.id));
  for (const x of old) { const k = x.link || x.id; if (!seen.has(k) && fresh(x)) { seen.add(k); items.push(x); } }
  items.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  return { ...cur, items: items.slice(0, max) };
}
export const NEWS_MAX_ITEMS = 900, NEWS_MAX_AGE_DAYS = 30;
/** Merge per-source RSS results into the news feed payload. Each item carries its source's home country/region. */
export function assembleNews(results: SrcResult[], meta: NewsSource[] = ALL_NEWS_SOURCES): Partial<FeedResult> {
  const sources: FeedResult['sources'] = [];
  const items: any[] = [];
  const M = new Map(meta.map((s) => [s.name, s]));
  const cutoff = Date.now() - NEWS_MAX_AGE_DAYS * 86400_000;
  for (const r of results) {
    const m = M.get(r.name);
    const tag = { cc: m?.cc ?? null, region: m?.region ?? 'Global', kind: m?.kind ?? 'news', lang: m?.lang ?? 'en', filtered: !!m?.filter };
    if (r.ok) {
      const its = (r.items || []).filter((x) => { const t = Date.parse(x.published); return isNaN(t) || t >= cutoff; });
      items.push(...its.map((x) => ({ ...x, srcCc: tag.cc, srcRegion: tag.region, srcKind: tag.kind, srcLocal: tag.filtered || undefined, lang: tag.lang !== 'en' ? tag.lang : undefined })));
      sources.push({ name: r.name, url: r.url, ok: true, count: its.length, ...tag } as any);
    } else sources.push({ name: r.name, url: r.url, ok: false, error: r.error, ...tag } as any);
  }
  if (!items.length) throw new Error('All news sources failed');
  const seen = new Set<string>();
  for (let i = items.length - 1; i >= 0; i--) { const k = items[i].link || items[i].id; if (seen.has(k)) items.splice(i, 1); else seen.add(k); }
  items.sort((a, b) => String(b.published).localeCompare(String(a.published)));
  return { sources, data: { items: items.slice(0, NEWS_MAX_ITEMS), dropped: NEWS_DROPPED } };
}
async function news(): Promise<Partial<FeedResult>> {
  return assembleNews(await Promise.all(ALL_NEWS_SOURCES.map(rssSource)));
}

/* -------------------------------------------------------------- registry */
export const FEEDS: Record<string, { label: string; ttl: number; poll: number; run: (env: Env) => Promise<Partial<FeedResult>> }> = {
  ransomware: { label: 'Ransomware victims · ransomware.live', ttl: 600, poll: 300, run: ransomware },
  kev: { label: 'CISA Known Exploited Vulns', ttl: 900, poll: 600, run: kev },
  nvd: { label: 'NVD critical CVEs', ttl: 900, poll: 900, run: nvd },
  euvd: { label: 'ENISA EU Vulnerability DB', ttl: 900, poll: 900, run: euvd },
  c2: { label: 'abuse.ch Feodo Tracker C2', ttl: 600, poll: 600, run: feodo },
  threatfox: { label: 'abuse.ch ThreatFox IOCs', ttl: 600, poll: 600, run: threatfox },
  dshield: { label: 'SANS ISC / DShield sensors', ttl: 300, poll: 300, run: dshield },
  news: { label: 'Security news & advisories', ttl: 300, poll: 180, run: news },
  crypto: { label: 'Crypto hacks (DeFiLlama) & crypto-security news', ttl: 600, poll: 600, run: cryptoFeed },
  cryptovulns: { label: 'Crypto-related vulns (KEV + NVD keyword)', ttl: 6 * 3600, poll: 3600, run: cryptoVulns },
  frontier: { label: 'Frontier: AI & quantum crypto-break watch', ttl: 1800, poll: 900, run: () => frontierFeed() },
};

const memo = new Map<string, { at: number; value: FeedResult; pending?: Promise<FeedResult> }>();
export async function getFeed(name: string, env: Env = {}, force = false): Promise<FeedResult> {
  const def = FEEDS[name];
  if (!def) return { feed: name, ok: false, fetchedAt: new Date().toISOString(), ttl: 0, sources: [], error: 'Unknown feed' };
  const hit = memo.get(name);
  if (!force && hit && Date.now() - hit.at < def.ttl * 1000) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = (async (): Promise<FeedResult> => {
    try {
      const r = await def.run(env);
      return { feed: name, ok: true, fetchedAt: new Date().toISOString(), ttl: def.ttl, sources: r.sources || [], data: r.data };
    } catch (e: any) {
      return { feed: name, ok: false, fetchedAt: new Date().toISOString(), ttl: def.ttl, sources: [], error: String(e?.message || e) };
    }
  })();
  memo.set(name, { at: hit?.at ?? 0, value: hit?.value as FeedResult, pending });
  const value = await pending;
  // failed fetches are cached only briefly so we retry soon
  memo.set(name, { at: value.ok ? Date.now() : Date.now() - (def.ttl - 60) * 1000, value });
  return value;
}

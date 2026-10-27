/*
 * SENTINEL Cloudflare collector. Runs in a Cron-triggered Worker (worker/index.ts), NOT inside user requests.
 * Work is split into small tasks (one upstream source each) so every invocation stays light enough for the
 * Workers free plan. Results are written to D1 as ready-to-serve JSON; Pages Functions only read them.
 * Real data only: a failing source is stored as failed and shown OFFLINE by the UI.
 */
import { FEEDS, NEWS_SOURCES, REGIONAL_SOURCES, REGIONAL_BATCH, ALL_NEWS_SOURCES, KEV_URL, kev, nvd, euvd, feodo, threatfox, dshield, getJSON, geoCache, setGeoBudget, rssSource, retainNews, assembleNews, type Env, type FeedResult, type SrcResult } from './feeds';
import { CRYPTO_RSS, CRYPTO_NVD_TERMS, hackResult, assembleCrypto, cryptoVulnsKev, cryptoVulnsNvd, assembleCryptoVulns } from './crypto';
import { kevHistory, dshieldHistory, nvdHistory, nvdStep, snapshotHistory, recordSnapshot, resetHistoryCaches, ransomwareYear, assembleRansomwareHistory, ransomwareLiveFrom, RW_FIRST_YEAR, HISTORY, type RwChunk, type HistoryPayload } from './history';
import type { RawStore, D1Like } from './d1Store';

const MIN = 60, HOUR = 3600, DAYS = 86400;
type Ctx = { env: Env; store: RawStore };
type Task = { id: string; every: number; light?: boolean; run: (c: Ctx) => Promise<number | void> }; // run may return a custom next-delay (s)

export function feedEnvelope(id: string, every: number, build: () => Partial<FeedResult>): FeedResult {
  const base = { feed: id, fetchedAt: new Date().toISOString(), ttl: FEEDS[id]?.ttl ?? 600, collectEvery: every };
  try { const r = build(); return { ...base, ok: true, sources: r.sources || [], data: r.data } as FeedResult; }
  catch (e: any) { return { ...base, ok: false, sources: [], error: String(e?.message || e) } as FeedResult; }
}
async function runFeed(c: Ctx, id: string, every: number, fn: () => Promise<Partial<FeedResult>>) {
  let r: FeedResult;
  try { const out = await fn(); r = feedEnvelope(id, every, () => out); }
  catch (e: any) { r = feedEnvelope(id, every, () => { throw e; }); }
  await c.store.put(`feed:${id}`, r);
  return r;
}
const histEnvelope = (id: string, store: RawStore, r: Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>): HistoryPayload => ({ stream: id, ok: true, fetchedAt: new Date().toISOString(), ...r, store: store.kind });
async function putHist(c: Ctx, id: string, fn: () => Promise<Omit<HistoryPayload, 'stream' | 'ok' | 'fetchedAt'>>) {
  try { await c.store.put(`hist:${id}`, histEnvelope(id, c.store, await fn())); }
  catch (e: any) {
    const prev = await c.store.get(`hist:${id}`);
    await c.store.put(`hist:${id}`, prev?.ok ? { ...prev, stale: true, error: String(e?.message || e) } : { stream: id, ok: false, fetchedAt: new Date().toISOString(), error: String(e?.message || e), source: [], start: '', testFrom: '', end: '', notes: [] });
  }
}
async function snapshot(c: Ctx, name: string, r: FeedResult) {
  await recordSnapshot(c.store, name, r).catch(() => {});
  await putHist(c, 'snapshots', () => snapshotHistory(c.store));
}

/* ---------- multi-source feeds: each source is its own task, the feed is re-assembled after each one */
const notYet = (name: string, url: string): SrcResult => ({ name, url, ok: false, error: 'not collected yet (collector warming up)' });
async function assembleNewsFeed(c: Ctx) {
  const got = await c.store.getPrefix('src:news:');
  const res = ALL_NEWS_SOURCES.map((s) => got[s.name] || notYet(s.name, s.url));
  const r = feedEnvelope('news', 30 * MIN, () => assembleNews(res));
  await c.store.put('feed:news', r);
  return r;
}
async function assembleCryptoFeed(c: Ctx) {
  const got = await c.store.getPrefix('src:crypto:');
  const rss = CRYPTO_RSS.map((s) => got[s.name] || notYet(s.name, s.url));
  const hk = got['__hacks'] || { ok: false, error: 'not collected yet (collector warming up)' };
  const news = await c.store.get('feed:news');
  await c.store.put('feed:crypto', feedEnvelope('crypto', HOUR, () => assembleCrypto(hk, rss, news)));
}
async function assembleCryptoVulnsFeed(c: Ctx) {
  const got = await c.store.getPrefix('src:cv:');
  const parts = ['__kev', ...CRYPTO_NVD_TERMS].map((k) => got[k] || { sources: [{ name: k === '__kev' ? 'CISA KEV (crypto filter)' : `NVD keyword "${k}"`, url: '', ok: false, error: 'not collected yet (collector warming up)' }], items: [] });
  await c.store.put('feed:cryptovulns', feedEnvelope('cryptovulns', 6 * HOUR, () => assembleCryptoVulns(parts)));
}
async function assembleRansomware(c: Ctx) {
  const got = await c.store.getPrefix('src:rw:');
  const years: number[] = []; for (let y = RW_FIRST_YEAR; y <= new Date().getUTCFullYear(); y++) years.push(y);
  const chunks = years.map((y) => got[String(y)]).filter((k): k is RwChunk => !!k?.recs);
  const missing = years.filter((y) => !got[String(y)]?.recs);
  const cur = got[String(years[years.length - 1])];
  if (chunks.length) await c.store.put('hist:ransomware', histEnvelope('ransomware', c.store, assembleRansomwareHistory(chunks, missing)));
  // live 30-day feed needs the current-year archive (and the previous one in January)
  const curOk = cur?.recs && Date.now() - Date.parse(cur.fetchedAt) < 6 * HOUR * 1000;
  await c.store.put('feed:ransomware', curOk ? feedEnvelope('ransomware', 30 * MIN, () => ransomwareLiveFrom(chunks.filter((k) => k.year >= years[years.length - 1] - 1)))
    : feedEnvelope('ransomware', 30 * MIN, () => { throw new Error(got[String(years[years.length - 1])]?.error || 'current-year ransomware.live archive not collected yet'); }));
}

function tasks(): Task[] {
  const T: Task[] = [];
  // News: each core source is its own light task (store only); regional sources are fetched REGIONAL_BATCH at a time
  // (≤ 5 subrequests) once an hour; the merged feed is re-assembled by its own task so the D1 read of every source
  // happens once per 10 min instead of after every fetch.
  NEWS_SOURCES.forEach((s) => T.push({ id: `news:${s.name}`, every: 30 * MIN, light: true, run: async (c) => {
    const prev = await c.store.get(`src:news:${s.name}`).catch(() => null);
    await c.store.put(`src:news:${s.name}`, retainNews(prev as any, await rssSource(s)));
  } }));
  for (let i = 0; i < REGIONAL_SOURCES.length; i += REGIONAL_BATCH) {
    const batch = REGIONAL_SOURCES.slice(i, i + REGIONAL_BATCH);
    T.push({ id: `newsb:${i / REGIONAL_BATCH}`, every: HOUR, run: async (c) => {
      const got = await Promise.all(batch.map(rssSource));
      for (let j = 0; j < batch.length; j++) {
        const prev = await c.store.get(`src:news:${batch[j].name}`).catch(() => null);
        await c.store.put(`src:news:${batch[j].name}`, retainNews(prev as any, got[j], 60));
      }
    } });
  }
  T.push({ id: 'news:assemble', every: 10 * MIN, run: async (c) => { await snapshot(c, 'news', await assembleNewsFeed(c)); } });
  CRYPTO_RSS.forEach((s) => T.push({ id: `crypto:${s.name}`, every: HOUR, light: true, run: async (c) => {
    await c.store.put(`src:crypto:${s.name}`, await rssSource(s));
    await assembleCryptoFeed(c);
  } }));
  T.push({ id: 'crypto:hacks', every: HOUR, run: async (c) => { await c.store.put('src:crypto:__hacks', await hackResult()); await assembleCryptoFeed(c); } });
  T.push({ id: 'kev', every: 30 * MIN, run: async (c) => {
    let cat: any = null, err: any = null;
    try { cat = await getJSON(KEV_URL, {}, 45000); } catch (e) { err = e; }
    const fail = async () => { throw err; };
    await runFeed(c, 'kev', 30 * MIN, () => (cat ? kev(cat) : fail()));
    await putHist(c, 'kev', () => (cat ? kevHistory(cat) : fail()));
    if (cat) { await c.store.put('src:cv:__kev', await cryptoVulnsKev(cat)); await assembleCryptoVulnsFeed(c); }
  } });
  CRYPTO_NVD_TERMS.forEach((t) => T.push({ id: `cv:${t}`, every: 6 * HOUR, light: true, run: async (c) => { await c.store.put(`src:cv:${t}`, await cryptoVulnsNvd(t, c.env)); await assembleCryptoVulnsFeed(c); } }));
  T.push({ id: 'nvd', every: 30 * MIN, run: async (c) => { await runFeed(c, 'nvd', 30 * MIN, () => nvd(c.env)); } });
  T.push({ id: 'euvd', every: 30 * MIN, light: true, run: async (c) => { await runFeed(c, 'euvd', 30 * MIN, () => euvd()); } });
  T.push({ id: 'c2', every: 15 * MIN, light: true, run: async (c) => { await snapshot(c, 'c2', await runFeed(c, 'c2', 15 * MIN, () => feodo())); } });
  T.push({ id: 'threatfox', every: HOUR, light: true, run: async (c) => { await runFeed(c, 'threatfox', HOUR, () => threatfox(c.env)); } });
  T.push({ id: 'dshield', every: 15 * MIN, run: async (c) => {
    const geo = (await c.store.get('isc-geo')) || {};
    geoCache.clear(); for (const [ip, v] of Object.entries(geo)) geoCache.set(ip, v as any);
    setGeoBudget(30); // free plan: ≤ 50 subrequests per invocation (4 ISC API calls + ≤ 30 IP look-ups)
    const r = await runFeed(c, 'dshield', 15 * MIN, () => dshield());
    await c.store.put('isc-geo', Object.fromEntries([...geoCache.entries()].slice(-600)));
    await snapshot(c, 'dshield', r);
  } });
  T.push({ id: 'hist:dshield', every: 3 * HOUR, light: true, run: async (c) => { await putHist(c, 'dshield', () => dshieldHistory()); } });
  const cy = new Date().getUTCFullYear();
  for (let y = RW_FIRST_YEAR; y <= cy; y++) {
    const every = y === cy ? 30 * MIN : y === cy - 1 ? (new Date().getUTCMonth() === 0 ? 30 * MIN : DAYS) : 7 * DAYS;
    T.push({ id: `rw:${y}`, every, run: async (c) => {
      try { await c.store.put(`src:rw:${y}`, await ransomwareYear(y)); }
      catch (e: any) { const prev = await c.store.get(`src:rw:${y}`); await c.store.put(`src:rw:${y}`, prev?.recs ? prev : { year: y, error: String(e?.message || e) }); await assembleRansomware(c); throw e; }
      await assembleRansomware(c);
    } });
  }
  // NVD history backfill: one polite request per run; every 90 s while pending, else check every 30 min.
  T.push({ id: 'nvd:backfill', every: 30 * MIN, light: true, run: async (c) => { const more = await nvdStep(c.store, c.env); return more ? 90 : 30 * MIN; } });
  T.push({ id: 'hist:nvd', every: 20 * MIN, run: async (c) => {
    const st = await c.store.getRaw('nvd-backfill');
    const meta = await c.store.get('hist:nvd:meta');
    if (meta && st && meta.stateAt === st.at && Date.now() - meta.at < 6 * HOUR * 1000) return; // backfill unchanged
    await putHist(c, 'nvd', () => nvdHistory(c.store, c.env, 0));
    await c.store.put('hist:nvd:meta', { stateAt: st?.at ?? 0, at: Date.now() });
  } });
  return T;
}

/** Run the most overdue task(s). Called by the cron trigger every minute. */
export async function runDue(db: D1Like, store: RawStore, env: Env, maxTasks = 3, log: (s: string) => void = console.log) {
  const all = tasks();
  const byId = new Map(all.map((t) => [t.id, t]));
  const now = Date.now();
  const have = await db.prepare('SELECT id FROM tasks').all();
  const known = new Set(have.results.map((r: any) => r.id));
  const add = all.filter((t) => !known.has(t.id));
  if (add.length) await db.batch(add.map((t) => db.prepare('INSERT OR IGNORE INTO tasks (id, next) VALUES (?1, 0)').bind(t.id)));
  const done: string[] = [];
  for (let i = 0; i < maxTasks; i++) {
    const t0 = Date.now();
    const row = await db.prepare(`UPDATE tasks SET lease = ?1 WHERE id = (SELECT id FROM tasks WHERE next <= ?2 AND lease <= ?2 AND id IN (${all.map((t) => `'${t.id.replace(/'/g, "''")}'`).join(',')}) ORDER BY next LIMIT 1) RETURNING id, fails`).bind(t0 + 10 * MIN * 1000, t0).first();
    if (!row) break;
    const t = byId.get(row.id)!;
    resetHistoryCaches();
    try {
      const custom = await t.run({ env, store });
      const next = Date.now() + (typeof custom === 'number' ? custom : t.every) * 1000;
      await db.prepare('UPDATE tasks SET next = ?1, lease = 0, last = ?2, ok = 1, err = NULL, ms = ?3, runs = runs + 1, fails = 0 WHERE id = ?4').bind(next, Date.now(), Date.now() - t0, t.id).first();
      log(`[collector] ${t.id} ok in ${Date.now() - t0} ms`);
    } catch (e: any) {
      const fails = (row.fails || 0) + 1;
      const next = Date.now() + Math.min(t.every, 120 * 2 ** Math.min(fails, 6)) * 1000;
      await db.prepare('UPDATE tasks SET next = ?1, lease = 0, last = ?2, ok = 0, err = ?3, ms = ?4, runs = runs + 1, fails = ?5 WHERE id = ?6').bind(next, Date.now(), String(e?.message || e).slice(0, 500), Date.now() - t0, fails, t.id).first();
      log(`[collector] ${t.id} FAILED: ${e?.message || e}`);
    }
    done.push(t.id);
    if (!t.light) break; // at most one heavy task per invocation (free-plan CPU budget)
  }
  return done;
}
export const HISTORY_IDS = Object.keys(HISTORY);

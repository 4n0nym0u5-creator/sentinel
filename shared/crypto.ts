/*
 * Crypto-security feeds. REAL public sources only; each source reports its own status and a failed
 * source is listed as offline (never back-filled with made-up items).
 *  - DeFiLlama hacks dataset (api.llama.fi/hacks): date, protocol, chain, USD lost (time-of-hack), technique, returned funds
 *  - Crypto-security RSS: rekt.news, SlowMist, PeckShield, CertiK, Immunefi, Chainalysis, TRM Labs, Web3 Is Going Great,
 *    Cointelegraph (hacks tag) + security-filtered The Block / Decrypt / CoinDesk + crypto-filtered general security news
 *  - Crypto-related vulns: CISA KEV full catalog (keyword filter) + NVD API keyword searches (last 120 days)
 */
import { getFeed, getJSON, nvdGate, rssSource, strip, KEV_URL, type Env, type FeedResult, type SrcResult } from './feeds';

const DAY = 86400_000;
export const usdSev = (usd: number | null | undefined) => (usd == null ? null : usd >= 100e6 ? 'critical' : usd >= 10e6 ? 'high' : usd >= 1e6 ? 'medium' : 'low');

export function techniqueGroup(cls: string, tech: string): string {
  const c = cls || '', t = tech || '';
  if (c === 'Key Compromise' || /key (compromis|leak)|private key|seed phrase|mnemonic|multisig/i.test(t)) return 'Private-key compromise';
  if (/flash ?loan/i.test(t)) return 'Flash loan';
  if (c === 'Bridge & Cross-Chain' || /bridge|forged proof|cross-chain/i.test(t)) return 'Bridge exploit';
  if (c === 'Oracle Manipulation' || /oracle|price manipulation/i.test(t)) return 'Oracle / price manipulation';
  if (c === 'Rugpull' || /rug|exit scam|admin drain|backdoor/i.test(t)) return 'Rug pull / insider';
  if (c === 'Social Engineering' || /phish|drainer|approval|social/i.test(t)) return 'Phishing / drainer';
  if (c === 'Reentrancy' || /reentran/i.test(t)) return 'Reentrancy';
  if (c === 'Access Control') return 'Access control';
  if (c === 'Frontend & Infrastructure') return 'Frontend / infra / supply chain';
  if (c === 'Governance') return 'Governance attack';
  if (c === 'Market Manipulation') return 'Market manipulation';
  if (/Protocol Logic|Token & Share Accounting|Input Validation/.test(c)) return 'Logic / accounting bug';
  return 'Other / unknown';
}
export function categoryOf(target: string, bridge: boolean): string {
  if (bridge) return 'Bridge';
  if (target === 'CEX') return 'CeFi (exchange)';
  if (/DeFi|Liquidity|NFTfi|DAO|Gambling|RWA|AI Agent/.test(target)) return 'DeFi';
  if (target === 'Wallet') return 'Wallet';
  if (/Chain|Layer 1|Foundation/.test(target)) return 'Chain / L1';
  if (target === 'Token' || target === 'ICO') return 'Token';
  return 'Other';
}

export async function hacks() {
  const url = 'https://api.llama.fi/hacks';
  const arr: any[] = await getJSON(url, {}, 45000);
  if (!Array.isArray(arr) || !arr.length) throw new Error('DeFiLlama hacks: empty response');
  const items = arr
    .filter((h) => h && Number.isFinite(h.date))
    .map((h, i) => {
      const t = h.date * 1000;
      const usd = Number.isFinite(h.amount) ? h.amount : null;
      const chains: string[] = Array.isArray(h.chain) ? h.chain : h.chain ? [h.chain] : [];
      return {
        id: `llama|${h.date}|${h.name}|${i}`,
        t, day: new Date(t).toISOString().slice(0, 10),
        name: String(h.name || 'Unknown'),
        cls: h.classification || 'Unknown', tech: h.technique || 'Unknown',
        group: techniqueGroup(h.classification, h.technique),
        cat: categoryOf(h.targetType || '', !!h.bridgeHack),
        target: h.targetType || 'Other', bridge: !!h.bridgeHack,
        usd, returned: Number.isFinite(h.returnedFunds) ? h.returnedFunds : null,
        chains, lang: h.language || null,
        link: h.source && /^https?:/.test(h.source) ? h.source : 'https://defillama.com/hacks',
        sev: usdSev(usd) || 'low',
      };
    })
    .sort((a, b) => b.t - a.t);
  return { url, items };
}

export const SPECIALIST = [
  { name: 'rekt.news', url: 'https://rekt.news/rss/feed.xml' },
  { name: 'SlowMist', url: 'https://slowmist.medium.com/feed' },
  { name: 'PeckShield', url: 'https://medium.com/feed/@peckshield' },
  { name: 'CertiK', url: 'https://medium.com/feed/@certik' },
  { name: 'Immunefi', url: 'https://medium.com/feed/immunefi' },
  { name: 'Chainalysis', url: 'https://www.chainalysis.com/blog/feed/' },
  { name: 'TRM Labs', url: 'https://www.trmlabs.com/resources/blog/rss.xml' },
  { name: 'Web3 Is Going Great', url: 'https://www.web3isgoinggreat.com/feed.xml' },
  { name: 'Cointelegraph · Hacks', url: 'https://cointelegraph.com/rss/tag/hacks' },
];
export const GENERAL = [
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
];
const SEC = /\b(hack(ed|er|s)?|exploit(ed|s)?|drain(ed|er|ers)?|stole|stolen|steal|theft|thief|phish\w*|scam\w*|rug ?pull\w*|attack(ed|er|s)?|vulnerab\w*|breach\w*|lazarus|launder\w*|ransom\w*|malware|compromis\w*|heist|seiz\w*|sanction\w*|fraud\w*|ponzi|address poisoning|wrench)\b/i;
export const CRYPTO = /\b(crypto(currenc(y|ies))?|bitcoin|btc|ethereum|eth|blockchain|web3|defi|nft|stablecoin|usdt|usdc|monero|xmr|solana|binance|coinbase|bybit|kraken|metamask|wallet drainer|drainer|cryptojack\w*|coin ?miner|cryptomin\w*|xmrig|token)\b/i;
const NOT_CRYPTO = /cryptograph|crypto(graphic)? librar|crypto api|cryptoapi|tls|openssl/i;
const KIND: [RegExp, string][] = [
  [/sentenc|charged|indict|must pay|plead|convict|arrest|extradit|seiz|confiscat|court|lawsuit|sued|forfeit/i, 'enforcement'],
  [/ransom/i, 'ransom'], [/phish|drainer|address poisoning|approval/i, 'phishing/drainer'], [/rug ?pull|exit scam|scam|ponzi|fraud/i, 'scam'],
  [/lazarus|dprk|north korea/i, 'nation-state'], [/launder|mixer|tornado cash|sanction/i, 'laundering'],
  [/hack|exploit|drain|stole|stolen|steal|heist|theft|compromis|breach|loss(es)?\b|attacker/i, 'hack'], [/vulnerab|cve-|bug bounty|audit/i, 'vuln/research'],
];
/** First USD figure in a headline ("$1.5 billion", "$45M", "US$3.2 million"). */
export function parseUsd(s: string): number | null {
  const m = s.match(/(?:US)?\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(billion|bn|b\b|million|mn|m\b|thousand|k\b)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, '')), u = (m[2] || '').toLowerCase();
  return n * (u.startsWith('b') ? 1e9 : u.startsWith('m') ? 1e6 : u.startsWith('t') || u === 'k' ? 1e3 : 1);
}
function classify(it: any) {
  const text = `${it.title} ${it.summary}`;
  const kinds = KIND.filter(([r]) => r.test(text)).map(([, k]) => k);
  const usd = SEC.test(it.title) ? parseUsd(it.title) : null;
  const hackish = !kinds.includes('enforcement') && kinds.some((k) => ['hack', 'phishing/drainer', 'scam', 'ransom', 'nation-state'].includes(k));
  let sev = usd != null && hackish ? usdSev(usd)! : hackish ? 'medium' : 'low';
  let why = usd != null && hackish ? `headline reports ~$${fmtUsd(usd)} lost (USD tier)` : hackish ? `incident keywords (${kinds.join(', ')}) without a stated amount` : 'analysis / research post';
  if (sev === 'low' && hackish) { sev = 'medium'; why += ' (min. medium for incident reports)'; }
  if (kinds.includes('enforcement')) why = 'law-enforcement / legal action (not a new loss)';
  return { ...it, kinds, usd, sev, sevReason: why };
}
export const fmtUsd = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : n.toFixed(0));

export const CRYPTO_RSS = [...SPECIALIST.map((s) => ({ ...s, filter: false })), ...GENERAL.map((s) => ({ ...s, filter: true }))];
export type HackResult = { ok: boolean; items?: any[]; error?: string };
/** Merge DeFiLlama hacks + per-source crypto RSS + the (already assembled) security news feed. */
export function assembleCrypto(hk: HackResult, rss: SrcResult[], g: FeedResult | null): Partial<FeedResult> {
  const sources: FeedResult['sources'] = [];
  let hackItems: any[] = [];
  if (hk.ok) { hackItems = hk.items || []; sources.push({ name: 'DeFiLlama hacks dataset', url: 'https://defillama.com/hacks', ok: true, count: hackItems.length }); }
  else sources.push({ name: 'DeFiLlama hacks dataset', url: 'https://api.llama.fi/hacks', ok: false, error: hk.error });
  const news: any[] = [];
  for (const r of rss) {
    const s = CRYPTO_RSS.find((x) => x.name === r.name) || { filter: false };
    if (r.ok) {
      const kept = (r.items || []).filter((it: any) => !s.filter || SEC.test(it.title));
      news.push(...kept.map((it: any) => ({ ...it, specialist: !s.filter })));
      sources.push({ name: r.name + (s.filter ? ' (security-filtered)' : ''), url: r.url, ok: true, count: kept.length });
    } else sources.push({ name: r.name, url: r.url, ok: false, error: r.error });
  }
  // crypto-related items from the general security news feed (crypto ransom, drainers, exchange hacks …)
  try {
    if (!g || !g.ok) throw new Error(g?.error || 'news feed offline');
    const kept = (g.data as any).items.filter((it: any) => CRYPTO.test(`${it.title} ${it.summary}`) && !NOT_CRYPTO.test(it.title));
    news.push(...kept.map((it: any) => ({ ...it, specialist: false, viaSecurityNews: true })));
    sources.push({ name: 'Security news (crypto-filtered, 11 RSS)', url: '/api/feed/news', ok: true, count: kept.length });
  } catch (e: any) { sources.push({ name: 'Security news (crypto-filtered)', url: '/api/feed/news', ok: false, error: String(e?.message || e) }); }
  if (!hackItems.length && !news.length) throw new Error('All crypto sources failed');
  const seen = new Set<string>();
  const items = news.map(classify).filter((it) => { const k = it.link || it.id; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => String(b.published).localeCompare(String(a.published)));
  return { sources, data: { hacks: hackItems, news: items } };
}
export async function hackResult(): Promise<HackResult> {
  try { return { ok: true, items: (await hacks()).items }; } catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
}
export async function cryptoFeed(env: Env): Promise<Partial<FeedResult>> {
  const [hk, ...rss] = await Promise.all([hackResult(), ...CRYPTO_RSS.map((s) => rssSource(s))]);
  return assembleCrypto(hk, rss, await getFeed('news', env).catch(() => null));
}

/* ------------------------------------------------------------------ crypto-related vulnerabilities */
const CVULN = /\b(bitcoin|ethereum|go-ethereum|geth|blockchain|cryptocurrenc\w*|crypto[- ]?(wallet|exchange|currency|asset|mining|miner)s?|web3|metamask|trezor|ledger live|solidity|solana|defi|nft|smart contract|coinminer|cryptomin\w*|cryptojack\w*|monero|xmrig|wallet extension|hardware wallet)\b/i;
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const NVD_TERMS = ['cryptocurrency', 'blockchain', 'ethereum', 'bitcoin', 'web3', 'smart contract'];
const nvdTime = (t: number) => new Date(t).toISOString().slice(0, 23);
type CV = { sources: FeedResult['sources']; items: any[] };
/** KEV part of the crypto-vulns feed (pass a pre-fetched catalogue to avoid a second download). */
export async function cryptoVulnsKev(pre?: any): Promise<CV> {
  try {
    const j: any = pre ?? await getJSON(KEV_URL, {}, 40000);
    const hits = (j.vulnerabilities || []).filter((v: any) => CVULN.test(`${v.vendorProject} ${v.product} ${v.vulnerabilityName} ${v.shortDescription} ${v.notes || ''}`));
    const items = hits.map((v: any) => ({ id: v.cveID, src: 'KEV', kev: true, date: v.dateAdded, vendor: v.vendorProject, product: v.product, title: v.vulnerabilityName, desc: strip(v.shortDescription, 500), score: null, sev: 'critical', sevReason: 'in CISA KEV (exploited in the wild)', ransomware: v.knownRansomwareCampaignUse === 'Known', link: `https://nvd.nist.gov/vuln/detail/${v.cveID}` }));
    return { sources: [{ name: 'CISA KEV (full catalog, crypto keyword filter)', url: KEV_URL, ok: true, count: hits.length }], items };
  } catch (e: any) { return { sources: [{ name: 'CISA KEV (crypto filter)', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', ok: false, error: String(e?.message || e) }], items: [] }; }
}
/** One NVD keyword search (last 120 days). */
export async function cryptoVulnsNvd(term: string, env: Env): Promise<CV> {
  const headers: Record<string, string> = env.NVD_API_KEY ? { apiKey: env.NVD_API_KEY } : {};
  const end = Date.now(), start = end - 119 * DAY;
  const url = `${NVD}?keywordSearch=${encodeURIComponent(term)}${term.includes(' ') ? '&keywordExactMatch' : ''}&pubStartDate=${nvdTime(start)}&pubEndDate=${nvdTime(end)}&resultsPerPage=200`;
  try {
    await nvdGate(env);
    const j: any = await getJSON(url, { headers }, 60000);
    const items: any[] = [];
    for (const { cve } of j.vulnerabilities || []) {
      const desc = cve.descriptions?.find((d: any) => d.lang === 'en')?.value || '';
      if (!CVULN.test(desc) && !new RegExp(term, 'i').test(desc)) continue;
      const m = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0] || cve.metrics?.cvssMetricV40?.[0];
      const score = m?.cvssData?.baseScore ?? null;
      const sev = score == null ? 'low' : score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
      items.push({ id: cve.id, src: 'NVD', kev: !!cve.cisaExploitAdd, date: String(cve.published).slice(0, 10), vendor: '', product: '', title: strip(desc, 140), desc: strip(desc, 500), score, sev, sevReason: score == null ? 'not yet scored by NVD' : `CVSS ${score}`, nvdTerm: term, link: `https://nvd.nist.gov/vuln/detail/${cve.id}` });
    }
    return { sources: [{ name: `NVD keyword "${term}" (120d)`, url: 'https://nvd.nist.gov/developers/vulnerabilities', ok: true, count: items.length }], items };
  } catch (e: any) { return { sources: [{ name: `NVD keyword "${term}"`, url: 'https://nvd.nist.gov/developers/vulnerabilities', ok: false, error: String(e?.message || e) }], items: [] }; }
}
export const CRYPTO_NVD_TERMS = NVD_TERMS;
/** Merge the KEV part and the NVD keyword parts (KEV first, so KEV entries win and get the NVD term attached). */
export function assembleCryptoVulns(parts: CV[]): Partial<FeedResult> {
  const sources: FeedResult['sources'] = [];
  const items = new Map<string, any>();
  for (const p of parts) {
    sources.push(...p.sources);
    for (const it of p.items) { const prev = items.get(it.id); if (prev) { if (it.nvdTerm && !prev.nvdTerm) prev.nvdTerm = it.nvdTerm; } else items.set(it.id, { ...it }); }
  }
  if (!sources.some((s) => s.ok)) throw new Error('All crypto-vulnerability sources failed');
  return { sources, data: { items: [...items.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))) } };
}
export async function cryptoVulns(env: Env): Promise<Partial<FeedResult>> {
  const parts: CV[] = [await cryptoVulnsKev()];
  for (const term of NVD_TERMS) parts.push(await cryptoVulnsNvd(term, env));
  return assembleCryptoVulns(parts);
}

// Incident clustering for news: several outlets reporting the same incident become ONE event with a timeline of
// linked sources. Rules (no ML): two items within 7 days are linked if
//   (a) their titles share ≥ 50 % of significant words (Jaccard), or
//   (b) both match the same curated incident alias (ENTITY_ALIASES, e.g. GMO / Onamae.com), or
//   (c) they share a rare capitalised name (seen in ≤ 6 items) AND ≥ 20 % title-word overlap.
// Items from the same outlet merge only when their titles are identical (re-posts), so one feed's routine bulletins don't chain.
// Links are merged with union-find; a cluster may not span more than 10 days.
export const ENTITY_ALIASES: Record<string, RegExp> = {
  'GMO Internet / Onamae.com Desktop Cloud': /\bGMO\b|onamae|お名前|ＧＭＯ|japan\w*\b.{0,60}desktop cloud|desktop cloud.{0,80}(japan|forex|foreign exchange|securities)/i,
};
const STOP = new Set('the and for with from that this into over after amid about says said new how why what who are was were has have its their than more less will can not but out off via report reports update updates week weekly news alert alerts security cyber cybersecurity attack attacks hackers hacker hacked data breach company firm firms users customers warns warning patch patches critical multiple vulnerabilities vulnerability products product high severity cvss max advisory advisories flaw flaws remote code execution immediately launches launch stormcast diary podcast january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday risolte vulnerabilità sicherheitslücke schwachstelle schwachstellen vulnérabilité vulnérabilités dans multiples'.split(' '));
const DAY = 86400_000;
const words = (s: string) => (s.toLowerCase().replace(/\d+/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'.-]*/gu) || []).map((w) => w.replace(/['.-]+$/, '')).filter((w) => w.length >= 3 && !STOP.has(w));
const caps = (s: string) => new Set((s.match(/\b([A-Z][a-zA-Z0-9]{2,}|[A-Z]{2,}[0-9]*)\b/g) || []).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w)));
function jac(a: Set<string>, b: Set<string>) { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); }

export interface ClusterInput { key: string; time: number; title: string; text: string; source?: string }
/** Returns groups of input indexes (each group = one incident), plus the alias name that tied a group, if any. */
export function clusterNews(items: ClusterInput[]): { idx: number[]; alias?: string }[] {
  const n = items.length;
  const W = items.map((x) => new Set(words(x.title)));
  const C = items.map((x) => caps(x.title));
  const A = items.map((x) => Object.keys(ENTITY_ALIASES).filter((k) => ENTITY_ALIASES[k].test(`${x.title} ${x.text}`)));
  const df = new Map<string, number>();
  C.forEach((s) => s.forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const parent = items.map((_, i) => i), lo = items.map((x) => x.time), hi = items.map((x) => x.time);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b); if (ra === rb) return;
    if (Math.max(hi[ra], hi[rb]) - Math.min(lo[ra], lo[rb]) > 10 * DAY) return;
    parent[rb] = ra; lo[ra] = Math.min(lo[ra], lo[rb]); hi[ra] = Math.max(hi[ra], hi[rb]);
  };
  const order = items.map((_, i) => i).sort((a, b) => items[a].time - items[b].time);
  for (let x = 0; x < n; x++) {
    const i = order[x];
    for (let y = x + 1; y < n; y++) {
      const j = order[y];
      if (items[j].time - items[i].time > 7 * DAY) break;
      if (A[i].length && A[i].some((a) => A[j].includes(a))) { union(i, j); continue; }
      const jj = jac(W[i], W[j]);
      // the same outlet's own items only merge when the titles are near-identical (re-posts / updates)
      if (items[i].source && items[i].source === items[j].source) { if (items[i].title.trim().toLowerCase() === items[j].title.trim().toLowerCase()) union(i, j); continue; }
      if (jj >= 0.5) { union(i, j); continue; }
      if (jj >= 0.2) for (const w of C[i]) if (C[j].has(w) && (df.get(w) || 0) <= 6) { union(i, j); break; }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); groups.set(r, [...(groups.get(r) || []), i]); }
  return [...groups.values()].map((idx) => ({ idx, alias: idx.map((i) => A[i][0]).find(Boolean) }));
}

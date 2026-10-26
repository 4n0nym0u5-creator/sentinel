/* Small, dependency-free statistics used by the Trends view. */

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 erf approximation, |err| < 1.5e-7). */
export function normCdf(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
const twoSided = (z: number) => Math.min(1, 2 * (1 - normCdf(Math.abs(z))));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function ranks(a: number[]) {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; }
  return r as number[];
}
const tieGroups = (a: number[]) => { const m = new Map<number, number>(); a.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.values()].filter((t) => t > 1); };

/** Sen's slope (median of pairwise slopes) per unit of x. */
export function senSlope(y: number[], x: number[] = y.map((_, i) => i)) {
  const s: number[] = [];
  for (let i = 0; i < y.length; i++) for (let j = i + 1; j < y.length; j++) if (x[j] !== x[i]) s.push((y[j] - y[i]) / (x[j] - x[i]));
  const slope = s.length ? median(s) : 0;
  const intercept = median(y.map((v, i) => v - slope * x[i]));
  return { slope, intercept };
}

export interface MK { n: number; S: number; z: number; p: number; tau: number; slope: number; intercept: number; acf: number }
/** Mann–Kendall trend test (x ascending; gaps allowed) with tie correction and the
 *  Hamed–Rao (1998) variance correction for serial autocorrelation. */
export function mannKendall(y: number[], x: number[] = y.map((_, i) => i)): MK | null {
  const n = y.length;
  if (n < 8) return null;
  let S = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  let varS = (n * (n - 1) * (2 * n + 5) - tieGroups(y).reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0)) / 18;
  const { slope, intercept } = senSlope(y, x);
  const r = ranks(y.map((v, i) => v - slope * x[i]));
  const rm = mean(r), den = r.reduce((s, v) => s + (v - rm) ** 2, 0);
  let corr = 0;
  if (den > 0) for (let k = 1; k <= Math.floor(n / 3); k++) {
    let num = 0; for (let i = 0; i < n - k; i++) num += (r[i] - rm) * (r[i + k] - rm);
    const rho = num / den;
    if (Math.abs(rho) > 1.96 / Math.sqrt(n)) corr += (n - k) * (n - k - 1) * (n - k - 2) * rho;
  }
  const ratio = Math.max(1, 1 + (2 / (n * (n - 1) * (n - 2))) * corr);
  varS *= ratio;
  const z = S > 0 ? (S - 1) / Math.sqrt(varS) : S < 0 ? (S + 1) / Math.sqrt(varS) : 0;
  return { n, S, z, p: twoSided(z), tau: S / (n * (n - 1) / 2), slope, intercept, acf: ratio };
}

/** Mann–Whitney U (two-sided, normal approximation with tie correction). Returns z>0 when b > a. */
export function mannWhitney(a: number[], b: number[]) {
  const n1 = a.length, n2 = b.length;
  if (n1 < 3 || n2 < 3) return null;
  const r = ranks([...a, ...b]);
  const R2 = r.slice(n1).reduce((s, x) => s + x, 0);
  const U2 = R2 - (n2 * (n2 + 1)) / 2;
  const N = n1 + n2;
  const ties = tieGroups([...a, ...b]).reduce((s, t) => s + (t ** 3 - t), 0);
  const v = (n1 * n2 / 12) * ((N + 1) - ties / (N * (N - 1)));
  if (v <= 0) return { z: 0, p: 1 };
  const z = (U2 - (n1 * n2) / 2) / Math.sqrt(v);
  return { z, p: twoSided(z) };
}

/** Comparison of two Poisson counts with equal exposure: exact conditional binomial test (normal approx for large n). */
export function poissonTest(cur: number, prev: number) {
  const n = cur + prev;
  if (n === 0) return { p: 1 };
  if (n > 400) { const z = (Math.abs(cur - n / 2) - 0.5) / Math.sqrt(n / 4); return { p: twoSided(Math.max(0, z)) }; }
  // exact two-sided binomial(n, 0.5)
  const lf = (k: number) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const LN = lf(n);
  const pk = (k: number) => Math.exp(LN - lf(k) - lf(n - k) - n * Math.LN2);
  const p0 = pk(cur);
  let p = 0; for (let k = 0; k <= n; k++) { const q = pk(k); if (q <= p0 * (1 + 1e-9)) p += q; }
  return { p: Math.min(1, p) };
}

/** Two-proportion z-test. */
export function twoProp(x1: number, n1: number, x2: number, n2: number) {
  if (n1 < 10 || n2 < 10) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return { z: 0, p: 1 };
  const z = (x2 / n2 - x1 / n1) / se;
  return { z, p: twoSided(z) };
}

/** Spikes: value ≥ 3σ above the trailing-window mean (σ floored at √mean, the Poisson s.d.). */
export function anomalies(y: (number | null)[], window: number, minPrior = 8, k = 3, minVal = 5) {
  const out: { i: number; z: number; base: number }[] = [];
  for (let i = 0; i < y.length; i++) {
    const v = y[i]; if (v == null) continue;
    const prior = y.slice(Math.max(0, i - window), i).filter((x): x is number => x != null);
    if (prior.length < Math.min(minPrior, window)) continue;
    const m = mean(prior), s = Math.max(sd(prior), Math.sqrt(Math.max(m, 0)), 1e-9);
    const z = (v - m) / s;
    if (z >= k && v >= minVal) out.push({ i, z, base: m });
  }
  return out;
}

/** Trailing moving average; null unless ≥80% of the window has data. */
export function movingAvg(y: (number | null)[], w: number) {
  return y.map((_, i) => {
    if (i < w - 1) return null;
    const win = y.slice(i - w + 1, i + 1).filter((x): x is number => x != null);
    return win.length >= Math.ceil(w * 0.8) ? mean(win) : null;
  });
}
export const fmtP = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`);

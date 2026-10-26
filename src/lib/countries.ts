import raw from '../data/countries.json';
export interface Country { n: string; num: string; lat: number; lon: number; r: string; s: string; f: string }
export const COUNTRIES = raw as Record<string, Country>;
export const byNum: Record<string, string> = {};
for (const [k, v] of Object.entries(COUNTRIES)) if (v.num) byNum[String(+v.num)] = k;
export const cname = (cc?: string | null) => (cc && COUNTRIES[cc]?.n) || cc || 'Unknown';
export const REGIONS = ['All', 'APAC', 'Americas', 'Europe', 'Asia', 'Oceania', 'Africa', 'Middle East'] as const;
export type Region = (typeof REGIONS)[number];
const ME = new Set(['Western Asia']);
export function inRegion(cc: string | null | undefined, region: Region): boolean {
  if (region === 'All') return true;
  const c = cc ? COUNTRIES[cc] : undefined;
  if (!c) return false;
  if (region === 'APAC') return (c.r === 'Asia' && !ME.has(c.s)) || c.r === 'Oceania';
  if (region === 'Middle East') return ME.has(c.s) || ['EG'].includes(cc!);
  return c.r === region;
}
// Country names safe to match in free text (skip ambiguous words)
const SKIP = new Set(['Chad', 'Georgia', 'Jordan', 'Niger', 'Guinea', 'Turkey', 'Dominica', 'Mali', 'Togo', 'Jersey', 'Man', 'Monaco', 'Peru', 'Panama']);
const EXTRA: [RegExp, string][] = [
  [/\b(U\.S\.|US|USA|United States|American)\b/, 'US'], [/\b(UK|U\.K\.|Britain|British)\b/, 'GB'], [/\bRussian?\b/, 'RU'], [/\bChin(a|ese)\b/, 'CN'],
  [/\b(North Korea|N\. Korea|DPRK|North Korean)\b/, 'KP'], [/\b(South Korea|South Korean)\b/, 'KR'], [/\bIran(ian)?\b/, 'IR'], [/\bUkrain(e|ian)\b/, 'UA'],
  [/\bIsrael(i)?\b/, 'IL'], [/\bAustralian?\b/, 'AU'], [/\bTaiwan(ese)?\b/, 'TW'], [/\bJapan(ese)?\b/, 'JP'], [/\bIndian\b/, 'IN'], [/\bGerman(y)?\b/, 'DE'], [/\bFrench\b/, 'FR'],
  [/\bCanadian\b/, 'CA'], [/\bBrazilian\b/, 'BR'], [/\bVietnam(ese)?\b/, 'VN'], [/\bSingapore(an)?\b/, 'SG'], [/\bHong Kong\b/, 'HK'], [/\bNew Zealand\b/, 'NZ'],
];
const NAME_RX: [RegExp, string][] = Object.entries(COUNTRIES)
  .filter(([, c]) => c.n.length > 3 && !SKIP.has(c.n))
  .map(([cc, c]) => [new RegExp(`\\b${c.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), cc] as [RegExp, string]);
export function detectCountries(text: string): string[] {
  const out = new Set<string>();
  for (const [rx, cc] of EXTRA) if (rx.test(text)) out.add(cc);
  for (const [rx, cc] of NAME_RX) if (rx.test(text)) out.add(cc);
  return [...out];
}

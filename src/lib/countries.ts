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
const SKIP = new Set(['Chad', 'Georgia', 'Jordan', 'Niger', 'Guinea', 'Turkey', 'Dominica', 'Mali', 'Togo', 'Jersey', 'Man', 'Monaco', 'Peru', 'Panama', 'Aruba']);
const EXTRA: [RegExp, string][] = [
  [/\b(U\.S\.|US|USA|United States|American)\b/, 'US'], [/\b(UK|U\.K\.|Britain|British)\b/, 'GB'], [/\bRussian?\b/, 'RU'], [/\bChin(a|ese)\b/, 'CN'],
  [/\b(North Korea|N\. Korea|DPRK|North Korean)\b/, 'KP'], [/\b(South Korea|South Korean)\b/, 'KR'], [/\bIran(ian)?\b/, 'IR'], [/\bUkrain(e|ian)\b/, 'UA'],
  [/\bIsrael(i)?\b/, 'IL'], [/\bAustralian?\b/, 'AU'], [/\bTaiwan(ese)?\b/, 'TW'], [/\bJapan(ese)?\b/, 'JP'], [/\bIndian\b/, 'IN'], [/\bGerman(y)?\b/, 'DE'], [/\bFrench\b/, 'FR'],
  [/\bCanadian\b/, 'CA'], [/\bBrazilian\b/, 'BR'], [/\bVietnam(ese)?\b/, 'VN'], [/\bSingapore(an)?\b/, 'SG'], [/\bHong Kong\b/, 'HK'], [/\bNew Zealand\b/, 'NZ'],
];
// Demonyms / local-language names not covered by the plain country-name match
const DEMONYMS: [RegExp, string][] = [
  [/\bSpanish\b|\bEspaña\b/, 'ES'], [/\bItalian\b|\bItalia\b/, 'IT'], [/\bDutch\b|\bNederland\b/, 'NL'], [/\bSwiss\b|\bSchweiz\b|\bSuisse\b/, 'CH'], [/\bSwedish\b|\bSverige\b/, 'SE'],
  [/\bNorwegian\b|\bNorge\b/, 'NO'], [/\bFinnish\b|\bSuomi\b/, 'FI'], [/\bDanish\b/, 'DK'], [/\bPolish (government|police|company|bank|hospital|authorit)|\bPolska\b/, 'PL'], [/\bBelgian\b/, 'BE'],
  [/\bAustrian\b|\bÖsterreich\b/, 'AT'], [/\bIrish\b/, 'IE'], [/\bMexican\b|\bMéxico\b/, 'MX'], [/\bArgentin(e|a|ian)\b/, 'AR'], [/\bChilean\b/, 'CL'], [/\bColombian\b/, 'CO'],
  [/\bPeruvian\b/, 'PE'], [/\bIndonesian\b/, 'ID'], [/\bMalaysian\b/, 'MY'], [/\bThai\b/, 'TH'], [/\bFilipino\b|\bPhilippine\b/, 'PH'], [/\bPakistani\b/, 'PK'],
  [/\bSaudi\b/, 'SA'], [/\bEmirati\b|\bUAE\b|\bDubai\b|\bAbu Dhabi\b/, 'AE'], [/\bQatari\b/, 'QA'], [/\bTurkish\b|\bTürkiye\b/, 'TR'], [/\bEgyptian\b/, 'EG'], [/\bNigerian\b/, 'NG'],
  [/\bKenyan\b/, 'KE'], [/\bSouth African\b/, 'ZA'], [/\bCzech\b/, 'CZ'], [/\bRomanian\b/, 'RO'], [/\bGreek\b/, 'GR'], [/\bPortuguese\b/, 'PT'], [/\bLithuanian\b/, 'LT'],
  [/\bLatvian\b/, 'LV'], [/\bEstonian\b/, 'EE'], [/\bHungarian\b/, 'HU'], [/\bBulgarian\b/, 'BG'], [/\bSerbian\b/, 'RS'], [/\bCroatian\b/, 'HR'], [/\bSlovak\b/, 'SK'],
  [/\bKorean\b/, 'KR'], [/\bBangladeshi\b/, 'BD'], [/\bSri Lankan\b/, 'LK'], [/\bNepalese\b|\bNepali\b/, 'NP'], [/\bMoroccan\b/, 'MA'], [/\bGhanaian\b/, 'GH'],
  [/\bEthiopian\b/, 'ET'], [/\bJordanian\b/, 'JO'], [/\bLebanese\b/, 'LB'], [/\bIraqi\b/, 'IQ'], [/\bSyrian\b/, 'SY'], [/\bVenezuelan\b/, 'VE'], [/\bEcuadorian\b/, 'EC'],
  [/\bKiwi\b|\bAotearoa\b/, 'NZ'], [/\bBrasil\b/, 'BR'], [/\bDeutschland\b|\bdeutsche[nr]?\b/i, 'DE'], [/\bFrankreich\b|\bfrançais(e)?\b/i, 'FR'],
  [/日本/, 'JP'], [/한국|대한민국/, 'KR'], [/中国/, 'CN'],
];
// Organisations whose name implies a country (companies, agencies). Used as a geotag when no country is named.
export const ORG_CC: [RegExp, string][] = [
  // Japan
  [/\bGMO\b|Onamae|お名前|SBI (Securities|Holdings)|Rakuten|\bNTT\b|\bKDDI\b|SoftBank|\bSony\b|Nintendo|Fujitsu|\bNEC\b|Hitachi|Asahi|Nomura|Mizuho|\bMUFG\b|Kadokawa|Japan Airlines|Toyota|Panasonic|Toshiba|\bJPCERT|\bIPA\b|Keidanren|Takaichi/, 'JP'],
  // South Korea
  [/Samsung|SK Telecom|\bSKT\b|LG Uplus|Coupang|\bNaver\b|Kakao|Hyundai|\bKISA\b|KrCERT/, 'KR'],
  // China / Taiwan / HK
  [/Huawei|Alibaba|Tencent|ByteDance|Baidu|Xiaomi|\bZTE\b/, 'CN'], [/\bTSMC\b|Foxconn/, 'TW'], [/\bHKCERT\b|Cathay Pacific/, 'HK'],
  // Europe
  [/Siemens|Deutsche Telekom|Volkswagen|\bBSI\b|CERT-Bund|\bBMW\b|Bundeswehr|Bundestag/, 'DE'], [/\bANSSI\b|CERT-FR|Orange S\.?A\.?|Thales|Airbus/, 'FR'],
  [/Marks (&|and) Spencer|\bM&S\b|\bCo-op\b|Jaguar Land Rover|\bJLR\b|\bNHS\b|BT Group|\bNCSC UK|\bGCHQ\b|Harrods|Heathrow/, 'GB'],
  [/\bCERT-EU\b|\bENISA\b|European Commission|Europol/, 'EU'], [/\bNCSC-NL\b|ASML|Philips/, 'NL'], [/Ericsson|Volvo/, 'SE'], [/Nokia/, 'FI'],
  // Oceania / Asia / Americas
  [/\bOptus\b|Medibank|Qantas|Telstra|\bASD\b|\bACSC\b|Latitude Financial/, 'AU'], [/\bInfosys\b|\bWipro\b|Airtel|\bTCS\b|\bCERT-In\b|\bUPI\b/, 'IN'], [/Singtel|\bCSA Singapore\b/, 'SG'],
  [/\bCISA\b|\bFBI\b|\bNSA\b|Pentagon|\bDHS\b|\bSEC\b filing|UnitedHealth|Change Healthcare|Ticketmaster/, 'US'], [/\bCCCS\b|Canadian Centre for Cyber/, 'CA'],
];
const NAME_RX: [RegExp, string][] = Object.entries(COUNTRIES)
  .filter(([, c]) => c.n.length > 3 && !SKIP.has(c.n))
  .map(([cc, c]) => [new RegExp(`\\b${c.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), cc] as [RegExp, string]);
/** Countries named in a text: country names + demonyms first, then organisations that imply a country. */
export function detectCountries(text: string): string[] {
  const out = new Set<string>();
  for (const [rx, cc] of EXTRA) if (rx.test(text)) out.add(cc);
  for (const [rx, cc] of DEMONYMS) if (rx.test(text)) out.add(cc);
  for (const [rx, cc] of NAME_RX) if (rx.test(text)) out.add(cc);
  for (const [rx, cc] of ORG_CC) if (rx.test(text)) out.add(cc);
  out.delete('EU');
  return [...out];
}

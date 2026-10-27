/**
 * Frontier: AI & quantum crypto-break watch.
 * Real public feeds from AI labs, quantum-computing groups, cryptography research and standards bodies, each item
 * scored by transparent RULES (no LLM): Impact 1–5 (what breaks if this line of work succeeds) and
 * Proximity 1–5 (how close it is to actually breaking deployed systems). Every score carries its reasons.
 */
import { get, readPrefix, closeTruncated, parseFeedItems, type FeedResult, type SrcResult } from './feeds';

export type FrontierGroup = 'AI labs' | 'Quantum computing' | 'Cryptography research' | 'Standards & government' | 'Mathematics' | 'Research preprints';
export interface FrontierSource { name: string; url: string; group: FrontierGroup; home: string; prefix?: number; gate?: 'all' | 'topic' | 'strict' | 'eprint' | 'math'; arxiv?: boolean; max?: number }

const AX = (q: string) => `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=40`;
export const FRONTIER_SOURCES: FrontierSource[] = [
  // AI labs (topic-gated: only quantum / crypto / maths-proof posts pass)
  { name: 'Google Research blog', url: 'https://research.google/blog/rss/', group: 'AI labs', home: 'https://research.google/blog/', gate: 'topic' },
  { name: 'Google DeepMind blog', url: 'https://deepmind.google/blog/rss.xml', group: 'AI labs', home: 'https://deepmind.google/discover/blog/', gate: 'topic' },
  { name: 'OpenAI news', url: 'https://openai.com/news/rss.xml', group: 'AI labs', home: 'https://openai.com/news/', gate: 'topic', prefix: 200_000 },
  { name: 'Microsoft Research blog', url: 'https://www.microsoft.com/en-us/research/feed/', group: 'AI labs', home: 'https://www.microsoft.com/en-us/research/blog/', gate: 'topic' },
  { name: 'IBM Research blog', url: 'https://research.ibm.com/rss', group: 'AI labs', home: 'https://research.ibm.com/blog', gate: 'topic' },
  // Quantum computing
  { name: 'AWS Quantum Technologies blog', url: 'https://aws.amazon.com/blogs/quantum-computing/feed/', group: 'Quantum computing', home: 'https://aws.amazon.com/blogs/quantum-computing/', gate: 'all' },
  { name: 'Quantum Frontiers (Caltech IQIM)', url: 'https://quantumfrontiers.com/feed/', group: 'Quantum computing', home: 'https://quantumfrontiers.com/', gate: 'topic' },
  { name: 'Shtetl-Optimized (Scott Aaronson)', url: 'https://scottaaronson.blog/?feed=rss2', group: 'Quantum computing', home: 'https://scottaaronson.blog/', gate: 'topic' },
  { name: 'MIT News: quantum computing', url: 'https://news.mit.edu/rss/topic/quantum-computing', group: 'Quantum computing', home: 'https://news.mit.edu/topic/quantum-computing', gate: 'all', prefix: 200_000 },
  { name: 'The Quantum Insider', url: 'https://thequantuminsider.com/feed/', group: 'Quantum computing', home: 'https://thequantuminsider.com/', gate: 'strict' },
  { name: 'Quantum Computing Report', url: 'https://quantumcomputingreport.com/feed/', group: 'Quantum computing', home: 'https://quantumcomputingreport.com/', gate: 'strict' },
  { name: 'Phys.org: quantum physics', url: 'https://phys.org/rss-feed/physics-news/quantum-physics/', group: 'Quantum computing', home: 'https://phys.org/physics-news/quantum-physics/', gate: 'strict' },
  { name: 'ScienceDaily: quantum computers', url: 'https://www.sciencedaily.com/rss/computers_math/quantum_computers.xml', group: 'Quantum computing', home: 'https://www.sciencedaily.com/news/computers_math/quantum_computers/', gate: 'strict' },
  { name: 'npj Quantum Information (Nature)', url: 'https://www.nature.com/npjqi.rss', group: 'Quantum computing', home: 'https://www.nature.com/npjqi/', gate: 'strict' },
  { name: 'Nature Physics', url: 'https://www.nature.com/nphys.rss', group: 'Quantum computing', home: 'https://www.nature.com/nphys/', gate: 'strict' },
  // Cryptography research
  { name: 'IACR ePrint archive', url: 'https://eprint.iacr.org/rss/rss.xml', group: 'Cryptography research', home: 'https://eprint.iacr.org/', gate: 'eprint', max: 60 },
  { name: 'Cloudflare blog: post-quantum', url: 'https://blog.cloudflare.com/tag/post-quantum/rss/', group: 'Cryptography research', home: 'https://blog.cloudflare.com/tag/post-quantum/', gate: 'all', prefix: 200_000 },
  { name: 'PQShield blog', url: 'https://pqshield.com/feed/', group: 'Cryptography research', home: 'https://pqshield.com/', gate: 'all' },
  { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/', group: 'Cryptography research', home: 'https://www.schneier.com/', gate: 'topic' },
  { name: 'Cryptography Engineering (Matthew Green)', url: 'https://blog.cryptographyengineering.com/feed/', group: 'Cryptography research', home: 'https://blog.cryptographyengineering.com/', gate: 'topic' },
  { name: 'Trail of Bits blog', url: 'https://blog.trailofbits.com/feed/', group: 'Cryptography research', home: 'https://blog.trailofbits.com/', gate: 'topic', prefix: 200_000 },
  { name: 'ScienceDaily: encryption', url: 'https://www.sciencedaily.com/rss/computers_math/encryption.xml', group: 'Cryptography research', home: 'https://www.sciencedaily.com/news/computers_math/encryption/', gate: 'topic' },
  // Standards & government
  { name: 'NIST news', url: 'https://www.nist.gov/news-events/news/rss.xml', group: 'Standards & government', home: 'https://www.nist.gov/news-events/news', gate: 'topic' },
  { name: 'NIST Cybersecurity Insights blog', url: 'https://www.nist.gov/blogs/cybersecurity-insights/rss.xml', group: 'Standards & government', home: 'https://www.nist.gov/blogs/cybersecurity-insights', gate: 'topic' },
  { name: 'NIST CSRC drafts open for comment', url: 'https://csrc.nist.gov/CSRC/media/feeds/pubs/drafts-open-for-comment.xml', group: 'Standards & government', home: 'https://csrc.nist.gov/publications/drafts-open-for-comment', gate: 'topic' },
  // Mathematics
  { name: 'Quanta Magazine: computer science', url: 'https://www.quantamagazine.org/computer-science/feed/', group: 'Mathematics', home: 'https://www.quantamagazine.org/computer-science/', gate: 'math' },
  { name: 'Quanta Magazine: mathematics', url: 'https://www.quantamagazine.org/mathematics/feed/', group: 'Mathematics', home: 'https://www.quantamagazine.org/mathematics/', gate: 'math' },
  { name: "Terence Tao's blog", url: 'https://terrytao.wordpress.com/feed/', group: 'Mathematics', home: 'https://terrytao.wordpress.com/', gate: 'topic', prefix: 200_000 },
  // arXiv preprints (API; polite: one query per collector minute)
  { name: 'arXiv: quantum attacks on RSA / ECC', url: AX('cat:quant-ph+AND+(abs:Shor+OR+abs:RSA+OR+abs:%22elliptic+curve%22+OR+abs:%22discrete+logarithm%22+OR+abs:factoring)'), group: 'Research preprints', home: 'https://arxiv.org/list/quant-ph/recent', gate: 'all', arxiv: true },
  { name: 'arXiv: fault-tolerant / logical qubits', url: AX('cat:quant-ph+AND+(ti:%22logical+qubits%22+OR+ti:%22fault-tolerant%22+OR+ti:%22below+threshold%22+OR+ti:%22error+correction%22)'), group: 'Research preprints', home: 'https://arxiv.org/list/quant-ph/recent', gate: 'all', arxiv: true },
  { name: 'arXiv: cryptanalysis & post-quantum (cs.CR)', url: AX('cat:cs.CR+AND+(abs:%22post-quantum%22+OR+abs:lattice+OR+abs:cryptanalysis+OR+abs:%22ML-KEM%22+OR+abs:Kyber+OR+abs:Dilithium+OR+abs:%22key+recovery%22)'), group: 'Research preprints', home: 'https://arxiv.org/list/cs.CR/recent', gate: 'all', arxiv: true },
  { name: 'arXiv: AI for theorem proving & maths', url: AX('(cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.LO)+AND+(ti:%22theorem+proving%22+OR+ti:%22formal+proof%22+OR+ti:conjecture+OR+ti:%22mathematical+discovery%22+OR+ti:%22open+problem%22)'), group: 'Research preprints', home: 'https://arxiv.org/list/cs.AI/recent', gate: 'all', arxiv: true },
];
/** Tried and not used — shown in the UI so gaps are explicit. */
export const FRONTIER_DROPPED: { name: string; why: string }[] = [
  { name: 'Google Quantum AI', why: 'No RSS feed (quantumai.google feed URLs return 404); its papers and posts arrive via the Google Research blog and arXiv' },
  { name: 'IBM Quantum blog', why: 'No RSS feed (404); IBM quantum news arrives via the IBM Research blog' },
  { name: 'Microsoft Azure Quantum blog', why: 'Feed returns 403 (bot protection) — not bypassed; Microsoft Research blog used instead' },
  { name: 'Anthropic', why: 'No RSS feed published (404)' },
  { name: 'IonQ', why: 'No RSS feed published (404)' },
  { name: 'Quantinuum', why: 'No RSS feed published (404)' },
  { name: 'NIST CSRC publications / news metafeeds', why: 'Old CSRC feed URLs return 404; the "drafts open for comment" feed is used' },
  { name: 'ETSI quantum-safe cryptography', why: 'Feed returns 0 items' },
  { name: 'Open Quantum Safe', why: 'Feed returns 0 items' },
  { name: 'Google Project Zero', why: 'Feed is ~11 MB (full post bodies) — too large for the collector' },
];
export const FRONTIER_RETAIN_DAYS = 180;

// ---------------------------------------------------------------- relevance gates
const QC = String.raw`qubits?|quantum (comput\w*|processor|chip|hardware|advantage|supremacy|error|algorithm)|error[- ]correct\w*|fault[- ]tolerant|logical qubit|surface code|qLDPC|shor'?s?\b|grover'?s?\b`;
const CRYPTO = String.raw`cryptanaly\w*|cryptograph\w*|encrypt\w*|post[- ]quantum|quantum[- ](safe|resistant|secure)|\bPQC\b|ML-KEM|ML-DSA|SLH-DSA|FN-DSA|Kyber|Dilithium|SPHINCS|\bFalcon\b|\bHQC\b|lattice|\bLWE\b|\bRSA\b|elliptic[- ]curve|ECDSA|ECDH|ECDLP|discrete log\w*|Diffie[- ]Hellman|\bAES\b|SHA-?[123]|hash function|factor(ing|ization|isation|ise|ize)`;
const AIMATH_S = String.raw`(theorem|proof|prover|conjecture|olympiad|\bIMO\b|open problem|mathematic\w*|\bLean\b|AlphaProof|AlphaEvolve|AlphaGeometry)`;
const AI_S = String.raw`(\bAI\b|artificial intelligence|machine learning|LLMs?|language models?|neural|deep learning|Gemini|GPT|AlphaProof|AlphaEvolve|AlphaGeometry|reasoning model)`;
const MATHB = String.raw`conjecture|theorem|proof|proved|prime|Riemann|P ?(vs\.?|versus) ?NP|complexity|algorithm|unsolved|open problem`;
const RX_QC = new RegExp(QC, 'i'), RX_CRYPTO = new RegExp(CRYPTO, 'i'), RX_MATH = new RegExp(MATHB, 'i');
const RX_AIMATH = new RegExp(`${AI_S}[^.]{0,120}${AIMATH_S}|${AIMATH_S}[^.]{0,120}${AI_S}`, 'i');
const RX_QC_STRICT = new RegExp(String.raw`qubits?|quantum (comput\w*|processor|chip|advantage|error correction)|error[- ]correct\w*|fault[- ]tolerant|logical qubit|shor'?s?\b|post[- ]quantum|cryptograph\w*|encrypt\w*`, 'i');
const RX_EPRINT = new RegExp(String.raw`attack|cryptanaly\w*|break\w*|key[- ]recovery|forg\w*|collision|quantum|side[- ]channel|fault injection|lattice reduction|\bBKZ\b|security (of|analysis)|insecur\w*|ML-KEM|ML-DSA|Kyber|Dilithium|Falcon|HQC|SLH-DSA|SPHINCS`, 'i');
export function frontierRelevant(x: { title: string; summary?: string; tags?: string[] }, gate: FrontierSource['gate'] = 'topic'): boolean {
  const t = `${x.title} ${x.summary ?? ''} ${(x.tags ?? []).join(' ')}`;
  switch (gate) {
    case 'all': return true;
    case 'eprint': return RX_EPRINT.test(x.title);
    case 'strict': return RX_QC_STRICT.test(t);
    case 'math': return RX_MATH.test(t) || RX_CRYPTO.test(t) || RX_QC.test(t) || RX_AIMATH.test(t);
    default: return RX_QC.test(t) || RX_CRYPTO.test(t) || RX_AIMATH.test(t);
  }
}

// ---------------------------------------------------------------- rules-based scoring
export type FrontierCat = 'Quantum attack on public-key crypto' | 'Quantum hardware & error correction' | 'Classical cryptanalysis' | 'Post-quantum standards & migration' | 'AI for maths & proofs' | 'Mathematics' | 'Other';
export interface FrontierScore { impact: number; impactWhy: string; proximity: number; proxWhy: string; notes: string[]; cat: FrontierCat; targets: string[]; score: number }

const R = (s: string) => new RegExp(s, 'i');
const T_PK = R(String.raw`\bRSA\b|elliptic[- ]curve|\bECC\b|ECDLP|ECDSA|ECDH|EdDSA|Ed25519|secp256k1|P-256|discrete[- ]log\w*|Diffie[- ]Hellman|shor'?s?\b|integer factori[sz]ation|factor(ing|ise|ize) (large |2048|rsa)`);
const T_COIN = R(String.raw`bitcoin|ethereum|cryptocurrenc\w*|blockchain`);
const T_PQC = R(String.raw`ML-KEM|ML-DSA|SLH-DSA|FN-DSA|Kyber|Dilithium|SPHINCS\+?|\bFalcon\b|\bHQC\b|lattice|\bLWE\b|learning with errors|post[- ]quantum|\bPQC\b|quantum[- ](safe|resistant)|isogen\w*|McEliece|code-based|multivariate|UOV|SNOVA|MAYO`);
const T_SYM = R(String.raw`\bAES\b|SHA-?(1|2|256|3|512)|hash function|block cipher|stream cipher|\bChaCha|Grover'?s?\b`);
const T_PROTO = R(String.raw`\bTLS\b|\bSSH\b|\bVPN\b|\bPKI\b|certificate|signal protocol|end-to-end|zero[- ]knowledge|\bZK\b|SNARK|homomorphic|smart card|HSM|cryptograph\w*|encrypt\w*|signature scheme|key exchange`);
const T_QHW = R(String.raw`qubits?|quantum (comput\w*|processor|chip|hardware|device)|error[- ]correct\w*|fault[- ]tolerant|logical qubit|surface code|qLDPC|neutral[- ]atom|trapped[- ]ion|superconducting|photonic quantum|magic state`);
const T_QEC = R(String.raw`error[- ]correct\w*|fault[- ]tolerant|logical qubits?|below[- ]threshold|surface code|qLDPC|magic state|logical (gate|circuit|operation)`);
const ATTACK = R(String.raw`attack\w*|cryptanaly\w*|\bbreak(s|ing)?\b|broke(n)?\b|key[- ]recovery|recover(s|ed|ing)? (the )?(secret|private) key|forg(e|ery|eries)|collision|distinguisher|side[- ]channel|fault (injection|attack)|timing attack|vulnerab\w*|insecur\w*|flaw`);
const PRACTICAL = R(String.raw`practical (attack|break|key[- ]recovery|forgery|collision)|full key recovery|recover(ed|s)? (the )?(full )?(secret|private) key|broke(n)? in (minutes|hours|seconds|days)|real[- ]world attack|in the wild|exploited|demonstrat\w* (a |an |the )?(practical )?(attack|break)|end-to-end attack|total break|completely broken`);
const IMPL = R(String.raw`side[- ]channel|power analysis|electromagnetic|\bEM\b|timing|cache|fault (injection|attack)|rowhammer|implementation|bug|CVE-\d|firmware|library|hardware wallet`);
const PARTIAL = R(String.raw`reduced[- ]round|round-reduced|\b\d+-round|toy (parameters|version)|weak(er)? (keys|parameters|instances)|special (case|instances)|variant of|distinguisher|lower bound|upper bound|asymptotic|theoretical|we (prove|show) that|reduction from|hardness|worst-case|average-case|complexity of`);
const RESOURCE = R(String.raw`resource estimat\w*|(fewer|less) than (a |one )?(million|\d[\d,. ]*(thousand|k|m)?) (noisy |physical |logical )?qubits|\d[\d,.]*\s*(million |thousand |k )?(noisy |physical |logical )qubits|toffoli|t-count|qubit count|spacetime (volume|cost)|reduc\w+ (the )?(cost|number of (physical |logical )?qubits|qubit (count|requirement))|(in|within) (hours|days|a week|a month|minutes)`);
const HWMIL = R(String.raw`below[- ]threshold|logical qubits?|logical (gate|circuit|error rate)|fault[- ]tolerant (operation|computation|gate|logical)|record|\b\d[,\d]{2,}[- ](physical |atomic |superconducting )?qubits?\b|quantum advantage|beyond classical|error suppression|magic state (distillation|cultivation)`);
const IMPROVED_ALG = R(String.raw`(new|improved|faster|efficient|optimi[sz]ed) (quantum )?(algorithm|circuit|implementation|factoring|period finding)|quantum algorithm for|regev`);
const TOY = R(String.raw`\b([1-9]|[1-4]\d)-bit (rsa|integer|number|key|modulus)|factor(ed|s|ing) (the )?(number )?(15|21|35|\d{2,6})\b|d-?wave|quantum anneal\w*|annealer|toy[- ](example|model|size|demonstration)|small[- ]scale (demonstration|instance)|proof[- ]of[- ]concept`);
const HYPE = R(String.raw`d-?wave|annealer|quantum anneal\w*|(chinese|china).{0,60}(break|crack)\w* (rsa|military|encryption)|crack(s|ed)? (rsa|military[- ]grade|bank)`);
const SOFT = R(String.raw`roadmap|migration|migrat\w+|transition|guidance|guideline|standard(s|i[sz]ation)?\b|draft|webinar|interview|podcast|explainer|opinion|survey of|overview|primer|report\b|announc\w+|partnership|funding|raises|investment|launch\w*|policy|deadline|inventory|readiness|compliance|roundup|newsletter|event|conference|summit|hiring|award`);
const STD_EVENT = R(String.raw`(fips|sp 800|draft|standard).{0,40}(released|published|final|selected|approv\w+|comment)|nist (selects|releases|publishes|finali[sz]es)|selected for standardi[sz]ation`);
const AIMATH_RX = RX_AIMATH;
const MATH_BIG = R(String.raw`conjecture|theorem|proof|proved|prime|Riemann|P ?(vs\.?|versus) ?NP|open problem|decades-old|unsolved`);

const MOTIVE = R(String.raw`advent|emergence|\brise\b|threat|\bera\b|looming|upcoming|eventual|anticipat\w*|harvest|vulnerable|susceptib\w*|resist\w*|resilien\w*|secure against|protect\w*|safeguard\w*|migrat\w*|transition\w*|prepar\w*|future`);
const DEFENSIVE_T = R(String.raw`(against|from|for the) (the )?(future |emerging )?quantum[^.:]{0,40}|post[- ]quantum|quantum[- ](safe|resistant|secure|proof|ready|readiness)`);
const ATTACK_STRONG = R(String.raw`\bwe (present|propose|give|describe|introduce|mount|show|demonstrate|develop|obtain|report)\b[^.]{0,60}\b(attacks?|cryptanalysis|key[- ]recovery|forger(y|ies)|collisions?|distinguishers?)\b|\bwe (break|recover|forge|factor)\b|\b(new|improved|practical|first|novel|efficient|generic|polynomial[- ]time|subexponential|full) (attack|cryptanalysis|key[- ]recovery|side[- ]channel attack|forgery|collision attack|distinguisher)`);
const NEWSY_T = R(String.raw`who'?s news|appointments?|hires|funding|raises|\$\d|investment|partnership|partners with|webinar|podcast|interview|newsletter|weekly|roundup|recap|this week|event|conference|summit|award|prize|ceo|launch(es|ed)?|opens|acquires|acquisition|ipo|stock|shares|earnings|market|report finds|benchmark finds|survey finds|announc\w+`);
const CONSTRUCT_T = R(String.raw`protocol|scheme|framework|architecture|accelerator|implementation|design|toolkit|library|\bsystem|for (the )?(internet|iot|5g|v2x|medical|edge|matter|ble|cloud|blockchain)|efficient|faster|smaller|hardened|\bsecure\b|securing|pairing|consensus|authentication|signatures? (with|from|for)|benchmark|\bsok\b|survey|construction|multihash|credential`);
const COMMENT_T = R(String.raw`measur\w*|estimating|website|how to|\bwhy\b|\bwhat\b|lessons|history|thoughts|explain\w*|guide|primer|\?$|review|perspective|opinion|guest post|next phase|outlook|state of`);
const EXPERIMENT = R(String.raw`demonstrat\w*|experiment\w*|reali[sz]\w*|implemented on|on (a|an|the|our) [^.]{0,50}(processor|device|computer|chip|hardware|array)|hardware test|we (run|ran|execute|operate)|first successful|record|world-record`);
const RESULT_AI = R(String.raw`solv(ed|es) (an? |the )?(open|long[- ]standing|decades|famous|unsolved|erd)|\bproved\b|disprov(ed|es)|resolv(ed|es) (an? |the )?(open|long|conjecture|question)|settl(ed|es)|new (lower |upper )?(bound|result|construction)s?|gold[- ]medal|first proof|proofs? of (the |strong )|(AI|model|machine) prov(ed|es)`);

/** Body text minus "motivation" sentences ("quantum computers threaten RSA, so we propose…"), which would otherwise
 *  make every post-quantum engineering paper look like a quantum attack. */
function cleanBody(summary: string): string {
  return summary.split(/(?<=[.!?])\s+/).filter((sn) => !(/quantum|shor|grover/i.test(sn) && MOTIVE.test(sn))).join(' ');
}

export function scoreFrontier(x: { title: string; summary?: string; tags?: string[]; source?: string }): FrontierScore {
  const ti = x.title;
  const body = cleanBody(`${x.summary ?? ''}`);
  const t = `${ti}. ${body}`;
  const tiCap = ti.replace(DEFENSIVE_T, ' ');                       // title without "post-quantum" / "against quantum …"
  const bodyCap = body.replace(/post[- ]quantum|quantum[- ](safe|resistant|secure)/gi, ' ');
  const QCAP = /qubits?|shor'?s?\b|quantum (comput\w*|processor|chip|hardware|algorithm|circuit|advantage|device|annealer)|error[- ]correct\w*|fault[- ]tolerant|surface code|qLDPC|neutral[- ]atom|trapped[- ]ion|superconducting|magic state/i;
  const qcap = QCAP.test(tiCap) || QCAP.test(bodyCap);
  const pkT = T_PK.test(ti), pkB = T_PK.test(body), pk = pkT || pkB;
  const attackT = ATTACK.test(ti.replace(DEFENSIVE_T, ' ')) && !/^(securing|protecting|defending|mitigat)/i.test(ti);
  const construct = CONSTRUCT_T.test(ti), comment = COMMENT_T.test(ti);
  const attack = !comment && (attackT || (!construct && ATTACK_STRONG.test(body)));
  const newsy = NEWSY_T.test(ti);
  const aimath = RX_AIMATH.test(t);
  const res = RESOURCE.test(t);
  const targets: string[] = [];
  if (pk) targets.push('RSA / ECC');
  if (T_PQC.test(t)) targets.push('Post-quantum (PQC)');
  if (T_SYM.test(t)) targets.push('Symmetric / hash');
  if (T_COIN.test(t)) targets.push('Cryptocurrency');
  if (T_PROTO.test(t) && !targets.length) targets.push('Protocols / other crypto');
  if (qcap && !targets.length) targets.push('Quantum capability');
  const notes: string[] = [];

  // ---- Impact: what is at stake if this line of work succeeds
  let impact = 1, impactWhy = 'Peripheral to cryptography and hard maths — kept for context.';
  if ((pkT && (qcap || attack)) || (pkB && ((qcap && res) || attack))) { impact = 5; impactWhy = 'Targets RSA / elliptic-curve / Diffie-Hellman — the public-key crypto behind HTTPS, VPNs, code signing, banking and cryptocurrency wallets.'; }
  else if (T_COIN.test(t) && qcap && (res || attack)) { impact = 5; impactWhy = 'Quantum attack on cryptocurrency signatures (ECDSA / Schnorr), which protect hundreds of billions of dollars.'; }
  else if (T_PQC.test(t) && attack) { impact = 4; impactWhy = 'Attacks or weakens the post-quantum replacements (ML-KEM / ML-DSA / lattices) the world is migrating to.'; }
  else if (T_SYM.test(t) && attack) { impact = 4; impactWhy = 'Targets symmetric ciphers or hash functions (AES, SHA) used in nearly all encryption and integrity checks.'; }
  else if (qcap && T_QEC.test(t)) { impact = 3; impactWhy = 'Error-corrected (logical) qubits are the key enabler of a cryptographically relevant quantum computer (CRQC).'; }
  else if (T_PROTO.test(t) && attack) { impact = 3; impactWhy = 'Attack on deployed cryptographic protocols or products (TLS, signatures, ZK, hardware wallets).'; }
  else if (T_PQC.test(t) || (pk && T_PROTO.test(t))) { impact = 3; impactWhy = 'Post-quantum standards, migration or engineering — decides how fast systems become safe before Q-Day.'; }
  else if (aimath) { impact = 3; impactWhy = 'AI solving or proving hard maths — could accelerate cryptanalysis and science generally.'; }
  else if (qcap) { impact = 2; impactWhy = 'General quantum-computing progress; indirect path to breaking cryptography.'; }
  else if (T_PROTO.test(t) || T_SYM.test(t)) { impact = 2; impactWhy = 'Cryptography work without a direct attack on a core algorithm.'; }
  else if (MATH_BIG.test(t)) { impact = 2; impactWhy = 'Mathematical result; societal impact is indirect or long-term.'; }
  if (newsy && impact > 2) { impact = 2; notes.push('Business / people / event news — impact capped at 2.'); }

  // ---- Proximity: how close to actually breaking something deployed
  let proximity = 1, proxWhy = 'Defensive work, commentary, roadmap, standards or business news — does not move attacks closer.';
  const impl = IMPL.test(t), partial = PARTIAL.test(t);
  if (newsy) { /* stays 1 */ }
  else if (attack && PRACTICAL.test(t) && !partial && !impl && impact >= 4) { proximity = 5; proxWhy = 'Practical break or key recovery demonstrated on real parameters.'; }
  else if (attack && impl && /key[- ]recovery|recover\w* (the )?(full |secret |private )?keys?|extract\w* (the )?(secret |private )?keys?/i.test(t) && !TOY.test(t)) { proximity = 4; proxWhy = 'Secret keys recovered from a real implementation (side channel / fault) — serious for that product, fixable without replacing the algorithm.'; }
  else if (attack && PRACTICAL.test(t) && !partial) { proximity = 4; proxWhy = impl ? 'Practical attack on an implementation (side channel / bug) — real, but fixable without replacing the algorithm.' : 'Practical attack demonstrated on a real system.'; }
  else if (qcap && pk && res) { proximity = 4; proxWhy = 'New resource estimate for breaking real-size keys — moves the qubit / time bar for Q-Day.'; }
  else if (attack && !partial) { proximity = 3; proxWhy = impl ? 'Implementation-level attack technique (side channel / fault) — not a break of the maths.' : 'New cryptanalysis or attack technique, not (yet) a practical break of standard parameters.'; }
  else if (qcap && HWMIL.test(t) && EXPERIMENT.test(t) && !comment) { proximity = 3; proxWhy = 'Hardware milestone (logical qubits, below-threshold error correction, scale record) on the road to a CRQC.'; }
  else if (qcap && (IMPROVED_ALG.test(t) || (pk && /shor/i.test(t)))) { proximity = 3; proxWhy = 'Improved quantum algorithm or circuit that lowers the cost of future attacks.'; }
  else if (aimath && RESULT_AI.test(t) && !comment) { proximity = 3; proxWhy = 'AI produced a new mathematical result or proof — capability shown, not aimed at crypto.'; }
  else if (attack || qcap || (MATH_BIG.test(t) && !T_PROTO.test(t) && !T_PQC.test(t))) { proximity = 2; proxWhy = attack ? 'Partial result (reduced-round, special-case, weak-parameter or theoretical attack).' : qcap ? 'Early-stage quantum research — theory, components or small devices.' : 'Theoretical result; no direct route to breaking systems.'; }
  if (STD_EVENT.test(t) && proximity <= 1) proxWhy = 'Standards / policy milestone: changes the defence timeline, does not break anything.';
  if (TOY.test(t) && proximity > 2) { proximity = 2; notes.push('Capped at 2: toy-sized or annealer demonstration — far from breaking 2048-bit RSA or 256-bit ECC.'); }
  if (HYPE.test(t) && proximity > 2) { proximity = 2; notes.push('Claim pattern often over-hyped (annealer / small-number factoring); treat headline with caution.'); }
  if (/withh(e|o)ld|zero[- ]knowledge proof/i.test(t) && pk && qcap) notes.push('Authors withheld attack details (responsible disclosure).');

  let cat: FrontierCat = 'Other';
  if (pk && qcap && impact >= 4) cat = 'Quantum attack on public-key crypto';
  else if (aimath && !attack && !T_PQC.test(t)) cat = 'AI for maths & proofs';
  else if (attack && (pk || T_PQC.test(t) || T_SYM.test(t) || T_PROTO.test(t))) cat = 'Classical cryptanalysis';
  else if (qcap) cat = 'Quantum hardware & error correction';
  else if (T_PQC.test(t) || T_PROTO.test(t) || T_SYM.test(t)) cat = 'Post-quantum standards & migration';
  else if (aimath) cat = 'AI for maths & proofs';
  else if (MATH_BIG.test(t)) cat = 'Mathematics';
  return { impact, impactWhy, proximity, proxWhy, notes, cat, targets, score: impact * proximity };
}

// ---------------------------------------------------------------- fetching & assembly
export async function frontierSource(s: FrontierSource): Promise<SrcResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await get(s.url, {}, 25000);
    let body = s.prefix ? await readPrefix(res, s.prefix) : await res.text();
    if (s.prefix) body = closeTruncated(body);
    const all = parseFeedItems(body, { name: s.name, sum: 600 }, 120);
    const items = all.filter((x) => frontierRelevant(x, s.gate)).slice(0, s.max ?? 40);
    return { name: s.name, url: s.url, ok: true, items, fetchedAt, scanned: all.length };
  } catch (e: any) { return { name: s.name, url: s.url, ok: false, error: String(e?.message || e), fetchedAt }; }
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function assembleFrontier(results: SrcResult[]): Partial<FeedResult> {
  const M = new Map(FRONTIER_SOURCES.map((s) => [s.name, s]));
  const cutoff = Date.now() - FRONTIER_RETAIN_DAYS * 86400_000;
  const seen = new Map<string, any>();
  const sources: FeedResult['sources'] = [];
  for (const r of results) {
    const meta = M.get(r.name);
    const list = (r.items ?? (r as any).kept ?? []) as any[];
    sources.push({ name: r.name, url: meta?.home ?? r.url, ok: r.ok, count: list.length, error: r.error, fetchedAt: r.fetchedAt, group: meta?.group, scanned: r.scanned } as any);
    for (const x of list) {
      const tm = Date.parse(x.published); if (!isNaN(tm) && tm < cutoff) continue;
      const k = norm(x.title).slice(0, 90);
      const s = scoreFrontier(x);
      const it = { id: x.id, source: x.source, group: meta?.group, title: x.title, link: x.link, published: x.published, firstSeen: x.firstSeen, summary: x.summary, ...s };
      const prev = seen.get(k);
      if (prev) { prev.also = [...new Set([...(prev.also ?? []), x.source])].filter((n) => n !== prev.source); continue; }
      seen.set(k, it);
    }
  }
  const items = [...seen.values()].sort((a, b) => b.score - a.score || b.impact - a.impact || String(b.published).localeCompare(String(a.published))).slice(0, 800);
  const live = sources.filter((s) => s.ok).length;
  if (!live) throw new Error('no Frontier source reachable');
  return { data: { items, dropped: FRONTIER_DROPPED, retainDays: FRONTIER_RETAIN_DAYS, method: 'rules-v3' }, sources };
}
/** Local / dev server: fetch everything now (arXiv queries 3 s apart, per arXiv API etiquette). */
export async function frontierFeed(): Promise<Partial<FeedResult>> {
  const plain = FRONTIER_SOURCES.filter((s) => !s.arxiv), ax = FRONTIER_SOURCES.filter((s) => s.arxiv);
  const res = await Promise.all(plain.map(frontierSource));
  for (const s of ax) { res.push(await frontierSource(s)); await new Promise((r) => setTimeout(r, 3000)); }
  return assembleFrontier(res);
}

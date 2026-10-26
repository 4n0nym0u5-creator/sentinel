export type NSev = 'critical' | 'high' | 'medium' | 'low';
/** Keyword severity used for news items (same rule in the live view and the trend snapshots). */
export function newsSeverity(text: string): { sev: NSev; why: string } {
  if (/zero[- ]day|0-day|actively exploited|under active (attack|exploitation)|exploited in the wild|emergency directive/i.test(text)) return { sev: 'critical', why: 'Mentions zero-day / active exploitation → Critical' };
  if (/ransomware|breach|exploit|backdoor|botnet|wiper|hacked|hackers|stolen|leak|critical vulnerabilit|malware|APT/i.test(text)) return { sev: 'high', why: 'Mentions breach / ransomware / exploit / malware → High' };
  if (/stormcast|podcast|webinar|sponsored|week in review|newsletter/i.test(text)) return { sev: 'low', why: 'Briefing / podcast → Low' };
  return { sev: 'medium', why: 'Security news → Medium' };
}

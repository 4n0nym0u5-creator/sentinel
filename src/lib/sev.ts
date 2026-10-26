import type { Sev } from './types';
export const SEV_ORDER: Sev[] = ['critical', 'high', 'medium', 'low'];
export const SEV_RANK: Record<Sev, number> = { critical: 3, high: 2, medium: 1, low: 0 };
export const SEV_COLOR: Record<Sev, string> = { critical: '#ff2d55', high: '#ff7a1a', medium: '#ffc21a', low: '#3aa0ff' };
export const SEV_LABEL: Record<Sev, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export function cvssSev(score?: number | null): Sev | null { if (score == null) return null; return score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low'; }

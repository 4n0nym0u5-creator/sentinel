export type Sev = 'critical' | 'high' | 'medium' | 'low';
export type EType = 'ransomware' | 'vuln' | 'c2' | 'attack' | 'news' | 'ioc';
export interface FeedSource { name: string; url: string; ok: boolean; error?: string; count?: number; cc?: string | null; region?: string; kind?: string; lang?: string; filtered?: boolean }
export interface FeedResult<T = any> { feed: string; ok: boolean; fetchedAt: string; ttl: number; sources: FeedSource[]; error?: string; data?: T }
export interface FeedState<T = any> {
  id: string; label: string; poll: number;
  status: 'loading' | 'live' | 'stale' | 'offline';
  data?: T; // last GOOD data only (never synthesised)
  fetchedAt?: string; lastAttempt?: number; lastSuccess?: number; nextAt?: number; error?: string; sources: FeedSource[];
}
export interface Ev {
  id: string; type: EType; sev: Sev; time: number; title: string; subtitle: string;
  country?: string | null; source: string; link?: string; sevReason: string; tags?: string[]; raw: any;
}

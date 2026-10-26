export const fmt = (n: number | null | undefined) => (n == null || isNaN(n) ? '—' : n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : n.toLocaleString());
export function ago(t?: number | string | null, now = Date.now()) {
  if (t == null) return '—';
  const ms = now - (typeof t === 'number' ? t : Date.parse(t));
  if (isNaN(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export const dt = (t?: number | string | null) => { if (t == null) return '—'; const d = new Date(t); return isNaN(+d) ? '—' : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); };
export const dUTC = (t?: number | string | null) => { if (t == null) return '—'; const d = new Date(t); return isNaN(+d) ? '—' : d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'; };
export const PORTS: Record<number, string> = { 22: 'SSH', 23: 'Telnet', 80: 'HTTP', 443: 'HTTPS', 445: 'SMB', 3389: 'RDP', 2222: 'SSH-alt', 8080: 'HTTP-alt', 8443: 'HTTPS-alt', 5555: 'ADB', 1433: 'MSSQL', 3306: 'MySQL', 5432: 'Postgres', 6379: 'Redis', 25: 'SMTP', 21: 'FTP', 53: 'DNS', 123: 'NTP', 161: 'SNMP', 5900: 'VNC', 9200: 'Elastic', 27017: 'MongoDB', 81: 'HTTP-alt', 8000: 'HTTP-alt', 8888: 'HTTP-alt', 7547: 'TR-069', 37215: 'Huawei HG', 52869: 'UPnP', 60000: 'Hi-port', 1723: 'PPTP', 5060: 'SIP', 11211: 'Memcached', 502: 'Modbus', 102: 'S7comm', 47808: 'BACnet', 20000: 'DNP3' };

// Stopgap/bootstrap: turn the LOCAL dev collector's D1 rows into SQL that can be loaded into the remote D1,
// re-chunked into <=90 KB statements (D1 SQL length limit is 100 KB).
//   npx wrangler d1 execute sentinel-store --local --persist-to <dir> --json --command "SELECT * FROM blobs ORDER BY k, part" > blobs.json
//   npx wrangler d1 execute sentinel-store --local --persist-to <dir> --json --command "SELECT * FROM tasks" > tasks.json
//   node scripts/d1-local-to-remote-sql.mjs blobs.json tasks.json > push.sql
import { readFileSync } from 'node:fs';
const rows = (f) => JSON.parse(readFileSync(f, 'utf8'))[0].results;
const q = (s) => (s === null || s === undefined ? 'NULL' : typeof s === 'number' ? String(s) : "'" + String(s).replace(/'/g, "''") + "'");
const [bf, tf] = process.argv.slice(2);
const byK = new Map();
for (const r of rows(bf)) { const e = byK.get(r.k) || { v: '', at: r.at }; e.v += r.v; e.at = Math.min(e.at, r.at); byK.set(r.k, e); }
let out = '';
for (const [k, { v, at }] of byK) {
  out += `DELETE FROM blobs WHERE k = ${q(k)};\n`;
  for (let i = 0, p = 0; i < v.length; i += 90000, p++) out += `INSERT INTO blobs (k, part, v, at) VALUES (${q(k)}, ${p}, ${q(v.slice(i, i + 90000))}, ${at});\n`;
}
if (tf) for (const t of rows(tf)) out += `INSERT OR REPLACE INTO tasks (id, next, lease, last, ok, err, ms, runs, fails) VALUES (${[t.id, t.next, 0, t.last, t.ok, t.err, t.ms, t.runs, t.fails].map(q).join(', ')});\n`;
process.stdout.write(out);

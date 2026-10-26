// Usage: node scripts/d1-seed-sql.mjs <store-key> <json-file> > seed.sql
// Emits SQL that loads a JSON blob into the D1 `blobs` table in <=90 KB statements (D1's SQL length limit is 100 KB).
// Used once at deploy time to carry over the NVD backfill state already collected locally (real NVD API data).
import { readFileSync } from 'node:fs';
const [k, file] = process.argv.slice(2);
const v = JSON.stringify(JSON.parse(readFileSync(file, 'utf8')));
const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const PART = 90000, now = Date.now();
let out = `DELETE FROM blobs WHERE k = ${q(k)};\n`;
for (let i = 0, p = 0; i < v.length; i += PART, p++) out += `INSERT INTO blobs (k, part, v, at) VALUES (${q(k)}, ${p}, ${q(v.slice(i, i + PART))}, ${now});\n`;
process.stdout.write(out);

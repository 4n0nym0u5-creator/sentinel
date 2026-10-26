// Node-only persistent store: one JSON file per key under ./data/store (used by the Vite dev/preview server).
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Store } from './history';
export function fsStore(dir = resolve(process.cwd(), 'data/store')): Store {
  mkdirSync(dir, { recursive: true });
  const f = (k: string) => join(dir, k.replace(/[^a-z0-9-]/gi, '_') + '.json');
  return {
    kind: `JSON files in ${dir}`,
    async get(k) { try { return existsSync(f(k)) ? JSON.parse(readFileSync(f(k), 'utf8')) : null; } catch { return null; } },
    async put(k, v) { const p = f(k); writeFileSync(p + '.tmp', JSON.stringify(v)); renameSync(p + '.tmp', p); },
  };
}

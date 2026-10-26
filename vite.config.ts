import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './shared/handler';
import { fsStore } from './shared/fsStore';
import { startNvdBackfill, startRecorder } from './shared/history';

// Local equivalent of the Cloudflare Pages Functions in /functions: serves /api/* in dev AND preview,
// persists history/snapshots to ./data/store, and runs the NVD backfill + snapshot recorder in the background.
function apiProxy(): Plugin {
  const store = fsStore();
  let started = false;
  const start = () => { if (started || process.env.SENTINEL_NO_BACKGROUND) return; started = true; startNvdBackfill(store, process.env); startRecorder(store, process.env); };
  const mw: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    const u = new URL(req.url, 'http://local');
    try {
      const { status, body, ttl } = await handleApi(u.pathname, process.env, u.searchParams.has('force'), store);
      res.statusCode = status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', `public, max-age=${ttl}`);
      res.end(JSON.stringify(body));
    } catch (e: any) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e?.message || e) })); }
  };
  return {
    name: 'cyber-feed-proxy',
    configureServer: (s) => { s.middlewares.use(mw); start(); },
    configurePreviewServer: (s) => { s.middlewares.use(mw); start(); },
  };
}

export default defineConfig({ plugins: [react(), apiProxy()], server: { port: 5173, watch: { ignored: ['**/data/**'] } }, preview: { port: 4173 },
  build: { chunkSizeWarningLimit: 900, rollupOptions: { output: { manualChunks: { charts: ['recharts'], geo: ['d3-geo', 'd3-zoom', 'd3-selection', 'd3-transition', 'topojson-client'] } } } } });

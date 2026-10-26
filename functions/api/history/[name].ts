// Cloudflare Pages Function: /api/history/:stream -> precomputed history payload from D1 (built by the cron collector)
import { serveBlob } from '../../../shared/serve';
export const onRequestGet = async (ctx: { params: { name: string }; env: any }) => serveBlob(ctx.env, 'hist', String(ctx.params.name));

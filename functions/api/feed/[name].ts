// Cloudflare Pages Function: /api/feed/:name -> the collector's latest copy from D1 (see worker/ + shared/collector.ts)
import { serveBlob } from '../../../shared/serve';
export const onRequestGet = async (ctx: { params: { name: string }; env: any }) => serveBlob(ctx.env, 'feed', String(ctx.params.name));

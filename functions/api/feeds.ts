import { handleApi } from '../../shared/handler';
export const onRequestGet = async (ctx: { request: Request; env: Record<string, string> }) => {
  const { status, body } = await handleApi('/api/feeds', ctx.env);
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
};

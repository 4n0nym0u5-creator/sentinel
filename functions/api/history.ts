import { handleApi } from '../../shared/handler';
export const onRequestGet = async (ctx: { request: Request; env: any }) => {
  const { status, body } = await handleApi('/api/history', ctx.env);
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
};

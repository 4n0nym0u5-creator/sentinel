// Cloudflare Pages Function: /api/collector -> status of the cron collector's tasks (read from D1).
export const onRequestGet = async (ctx: { env: any }) => {
  const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' };
  if (!ctx.env.DB) return new Response(JSON.stringify({ ok: false, error: 'D1 binding DB missing' }), { headers: H });
  const { results } = await ctx.env.DB.prepare('SELECT id, next, last, ok, err, ms, runs, fails FROM tasks ORDER BY id').all();
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
  return new Response(JSON.stringify({ ok: true, now: new Date().toISOString(), tasks: results.map((r: any) => ({ ...r, next: iso(r.next), last: iso(r.last) })) }), { headers: H });
};

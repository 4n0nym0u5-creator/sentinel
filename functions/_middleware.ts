// Passcode gate for EVERY route (static assets and /api/*). The passcode exists only in the Pages secret SITE_PASSCODE.
// POST /__auth sets an HttpOnly session cookie (7 days); /__logout clears it.
interface Env { SITE_PASSCODE?: string }
type Ctx = { request: Request; env: Env; next: () => Promise<Response> };
const COOKIE = 'sentinel_auth';
const enc = new TextEncoder();
async function token(pass: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('sentinel-session-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function eq(a: string, b: string) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function page(err = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SENTINEL · Sign in</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(ellipse at top,#0d1a2b,#05080d 70%);color:#d6e2f0}
.card{width:380px;padding:36px;background:rgba(10,18,30,.92);border:1px solid #1c2b3f;border-top:3px solid #00d4ff;box-shadow:0 0 40px rgba(0,212,255,.08)}
.wm{font-weight:800;letter-spacing:.34em;font-size:22px;color:#fff}.wm b{color:#00d4ff}.sub{color:#6f8299;font-size:11px;margin:6px 0 26px;text-transform:uppercase;letter-spacing:.18em;font-family:ui-monospace,Menlo,monospace}
label{font-size:12px;font-weight:600;color:#9fb3c8;letter-spacing:.06em;text-transform:uppercase}input{width:100%;padding:12px;margin:8px 0 16px;background:#060b12;border:1px solid #23354d;color:#e6f0fb;font-size:15px;font-family:ui-monospace,Menlo,monospace}input:focus{outline:1px solid #00d4ff;border-color:#00d4ff}
button{width:100%;padding:12px;background:#00d4ff;color:#03121c;border:0;font-weight:800;font-size:13px;letter-spacing:.14em;cursor:pointer}button:hover{background:#4fe3ff}
.err{color:#ff2d55;font-size:13px;margin-bottom:12px}.ft{margin-top:22px;font-size:11px;color:#56687e}</style></head>
<body><form class="card" method="POST" action="/__auth"><div class="wm"><b>◉</b> SENTINEL</div><div class="sub">Global cyber situation monitor</div>
${err ? '<div class="err">Incorrect passcode. Please try again.</div>' : ''}<label for="p">Passcode</label><input id="p" name="passcode" type="password" autocomplete="current-password" autofocus required>
<button type="submit">SIGN IN</button><div class="ft">Private dashboard · authorised access only.</div></form></body></html>`;
}
const html = (b: string, s = 401) => new Response(b, { status: s, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
export const onRequest = async (ctx: Ctx) => {
  const { request, env } = ctx;
  if (!env.SITE_PASSCODE) return new Response('Gate not configured', { status: 503, headers: { 'cache-control': 'no-store' } });
  const url = new URL(request.url);
  const good = await token(env.SITE_PASSCODE);
  if (url.pathname === '/__auth' && request.method === 'POST') {
    let pass = '';
    try { pass = String((await request.formData()).get('passcode') || ''); } catch { /* bad body */ }
    if (eq(await token(pass), good)) {
      return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store', 'set-cookie': `${COOKIE}=${good}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` } });
    }
    return html(page(true));
  }
  if (url.pathname === '/__logout') return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)sentinel_auth=([a-f0-9]+)/);
  if (m && eq(m[1], good)) { const r = await ctx.next(); const out = new Response(r.body, r); out.headers.set('x-robots-tag', 'noindex, nofollow'); return out; }
  return html(page());
};

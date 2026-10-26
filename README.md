# SENTINEL · Global Cyber Situation Monitor

A dark, situation-room style dashboard that shows a live global picture of cyber-security activity. It uses **real, free, public feeds only**. Nothing is simulated. If a source fails, its panel says **OFFLINE**, and the last good data is kept and marked **STALE**.

Stack: Vite + React 18 + TypeScript + Tailwind. The map uses d3-geo (Natural Earth projection) with d3-zoom, and the charts use Recharts. A small API layer (`shared/`) runs in the Vite dev/preview server locally. When deployed, a Cloudflare cron Worker runs it and stores results in D1, and passcode-gated Pages Functions serve them.

![dashboard](screenshots/dashboard.png)

## Features
- **World map:** countries are heat-shaded by activity, with live markers per country. New items show as ripples and a critical item shows a red pulse. You can zoom and pan, switch layers on and off (heat, markers, ripples, labels), and click a country to open a drill-down: ransomware groups, sectors hit, attack sources, C2 servers, news and every event.
- **Global THREATCON gauge (1–5):** a transparent heuristic. Hover the ⓘ to see every input signal, its weight and its current value. If a feed is offline, its signal is dropped and the remaining weights are renormalised.
- **KPI tiles:** critical events, ransomware victims (with the change against the prior window), KEV additions, critical CVEs, Feodo C2 online, top attacked port, and the ISC Infocon level. Click a tile to filter.
- **Live incident stream:** severity-coloured. New items flash, and there is a "High+ only" toggle.
- **Ransomware panel:** a 30-day trend plus breakdowns by group, sector and country, and the latest claims.
- **Vulnerabilities panel:** the CISA KEV catalogue (due dates and known ransomware use), NVD CVSS ≥ 9 CVEs, and ENISA EUVD exploited/critical entries. Each shows CVSS badges and EPSS exploit-probability bars.
- **Attack infrastructure panel:** DShield top targeted ports and top attacking sources (by AS country), Feodo botnet C2 servers, and the 14-day sensor trend.
- **News and advisories:** 10 RSS sources, auto-tagged (ransomware, zero-day, breach, KEV, nation-state and so on), with the countries mentioned.
- **Bottom ticker:** a scrolling marquee of the highest-severity items.
- **Filters and search:** time window (1h/6h/24h/7d/30d), region, minimum severity, and event type. Click a type to toggle it, or double-click to show only that type. Free-text search covers CVE, vendor, group, IP and country. Press `/` to focus the search box.
- **New critical items:** when one arrives after the first load, the screen flashes red and a toast appears. An optional 3-tone audio alert plays too, but it is **off by default**; use the speaker button to turn it on.
- **Feed health drawer:** status for every feed and sub-source, last fetch time, next poll countdown and errors.
- **Crypto security view:** losses, techniques, chains, top incidents and crypto trends. See [below](#crypto-security-view-crypto).
- **Layout:** fullscreen with the button or `f`, `Esc` closes drawers, and the layout is responsive down to mobile.

Severity colours: **critical** red (pulsing), **high** orange, **medium** amber, **low** blue. Every item's detail panel says *why* it got its severity.

## Trends: "is it getting worse?"
Open the **Trends** tab in the header (or go to `#/trends`). This view answers one question: *are cyber incidents becoming more frequent, or more severe?* Each stream gets its own verdict, and every verdict is backed by a statistical test.

![trends](screenshots/trends-overview.png)

**What's on the page**
- **Verdict cards**, one per stream (Combined, Ransomware, KEV, NVD, DShield, News, C2). Each card shows:
  - **RISING** (red ↗), **FALLING** (green ↘), **STABLE**, or **INSUFFICIENT DATA**;
  - the trend test's p-value and the number of periods it used;
  - a sparkline;
  - the change against the prior period and year on year;
  - a severity verdict.
- **Main chart** for the selected stream. It shows:
  - counts per day, week or month;
  - two moving averages (7/28 days, 4/12 weeks, or 3/12 months);
  - the Sen's-slope trend line;
  - anomaly markers (**+Nσ**).
  
  Partial periods are hatched. Gaps and the "seeding" period are shaded and labelled, never filled in.
- **"Is it getting worse? — the statistics":** a plain-English explanation of what was tested and the result.
- **Severity mix over time:** stacked shares (critical, high, medium, low) with the weighted severity index overlaid.
- **Calendar heatmap:** daily values for the last 12 months.
- **Top movers:** the countries, sectors, groups and vendors that rose or fell most against the prior period. Each mover has an exact Poisson test, and you can click a row to filter by it.
- **History coverage & caveats:** history depth, gap days, NVD backfill progress, and per-stream caveats.

**Controls**
- **Range:** 30d / 90d / 1y / 3y / all.
- **Granularity:** auto, day, week or month. Auto means day for 30d, week for 90d and 1y, and month for 3y and all.
- **Ransomware filters:** region, country, sector and group.
- **KEV / NVD filters:** vendor/product.

**History depth**

| Stream | Source of history | From |
|---|---|---|
| Ransomware claims | ransomware.live full `victims.json`, by discovered date | 2021-01-01 |
| CISA KEV additions | KEV `dateAdded` (critical when a known ransomware campaign uses it) | 2021-11-03 (tests from 2022-04) |
| NVD CVEs | NVD API 2.0 by *published* date and CVSS v3 severity. A resumable backfill is cached on disk. | 2024-01-01 |
| DShield sensor reports | ISC `dailysummary` | 2020-01-01 |
| News volume & severity | **Snapshots recorded by this server.** The feeds have no history. | from first run |
| Feodo C2 online | **Snapshots recorded by this server** | from first run |

### Statistics (`src/lib/stats.ts`, `src/lib/trends.ts`)
- **Buckets** are UTC days, ISO weeks or calendar months. Each bucket is one of:
  - `ok`;
  - `gap`: one or more days have no data;
  - `partial`: the current period, or a period inside the stream's **reporting-lag** window (ransomware 2 d, KEV 1 d, NVD 14 d, DShield 2 d);
  - `seed`: before a dataset became representative.
  
  Only `ok` buckets enter the tests. Nothing is interpolated.
- **Trend test:** Mann–Kendall on the complete buckets, with tie correction and the Hamed–Rao autocorrelation correction, so serial correlation doesn't fake significance. The size of the trend comes from **Sen's slope**. The fitted change runs from the start to the end of the window; when the series started near zero, it is shown relative to the window average instead.
- **Verdict:**
  - **RISING** or **FALLING** needs **p < 0.05** *and* a fitted change of **≥ 5 %**.
  - Anything else is **STABLE**. Noise is never called a trend.
  - Fewer than 8 complete periods gives **INSUFFICIENT DATA**.
- **Severity:** a weighted index (critical 4, high 3, medium 2, low 1) per bucket, using buckets with at least 5 events. Mann–Kendall is applied to the index. A severity verdict also needs a change of at least 2 %. The critical share in the current period is compared with the prior one using a two-proportion z-test.
- **Vs prior period / year on year:** totals over the same-length window (30 d, 90 d or 180 d depending on the range), with a Mann–Whitney U test on the daily values.
- **Movers:** an exact conditional binomial (Poisson rate) test per entity.
- **Anomalies:** a bucket is flagged when it is at least 3σ above its trailing 12-period baseline and has at least 5 events. σ is floored at √mean.
- **Moving averages:** only drawn where at least 80 % of the window is present.

Print the engine's current verdicts from the CLI. This needs the server running:
```bash
npx esbuild scripts/verdicts.ts --bundle --platform=node --format=esm --outfile=/tmp/verdicts.mjs && node /tmp/verdicts.mjs 30d,90d,1y,3y,all
```

### History store
- **Locally** (dev or preview), the Vite plugin keeps a JSON store in `data/store/*.json`. Writes are atomic.
  - `hist-*` holds the last good build of each history, so a feed outage serves stale data rather than nothing.
  - `nvd-backfill` holds NVD backfill state that can resume after a restart.
  - `snapshots` holds news and C2 snapshots, recorded every 30 min and on each live fetch.
- Set `SENTINEL_NO_BACKGROUND=1` to disable the background recorder and the backfill.
- The NVD backfill is polite:
  - one request every 6.5 s without an API key, or 1.2 s with `NVD_API_KEY`;
  - exponential back-off on errors;
  - newest periods are fetched first, and the last 60 days are refreshed every 12 h.

API endpoints:
- `GET /api/history` lists the streams.
- `GET /api/history/:stream` returns the history for one stream. `:stream` is `ransomware`, `kev`, `nvd`, `dshield` or `snapshots`.

**Cloudflare design.** When deployed, nothing heavy runs inside a web request. The cron Worker in `worker/` (`sentinel-collector`) does all upstream fetching, history building and snapshotting (`shared/collector.ts`). It writes ready-to-serve JSON into the **D1** database `sentinel-store`. The Pages Functions only read those rows. See *Deploy to Cloudflare* below.

## Deploy to Cloudflare (Pages + cron Worker + D1), passcode-gated

**Live:** https://sentinel-cyber-monitor.pages.dev (production branch `main`). There is no Git integration; deploys go straight from the CLI.

> **Cron prerequisite:** Cloudflare only accepts Cron Triggers once the account has a workers.dev subdomain. This account now has one (`sentinel-7d0f37.workers.dev`, registered on 27 Oct 2026 through wrangler's interactive prompt). The collector itself keeps `workers_dev = false`, so it has no public URL. On a new account, open *Workers & Pages* in the dashboard once first.
>
> **Header indicator:** "collected Xm ago" shows the collector's last run. Refresh re-reads the latest collected copy. If the collector hasn't run for more than 10 minutes, a banner explains that the data can't be newer until it runs again.

### Architecture
| Piece | What it is | Where |
|---|---|---|
| Static app + API | Pages project `sentinel-cyber-monitor` | `dist/` + `functions/` |
| Passcode gate | Pages middleware on **every** route, including `/api/*` | `functions/_middleware.ts` |
| Collector | Worker `sentinel-collector`, Cron `* * * * *`, no public URL | `worker/` → `shared/collector.ts` |
| Store | D1 `sentinel-store` (`blobs`, `tasks`) | `migrations/0001_init.sql` |

**The collector** runs every minute. It claims the most overdue task in the D1 `tasks` table: one heavy task, or up to two light ones. Each task is leased so two runs can't take the same one, and a failed task backs off exponentially. Fetches are split per source so each run stays inside the free-plan limits of 50 subrequests and a small CPU budget.

| Task | Every |
|---|---|
| `c2` (Feodo), `dshield` (Infocon/summary/top IPs + geo, ≤30 lookups/run with a persisted cache) | 15 min |
| `kev` (also feeds crypto-vulns + KEV history), `nvd`, `euvd`, `news:<source>` ×10, `rw:<current year>` | 30 min |
| `crypto:<source>` ×12, `crypto:hacks` (DeFiLlama), `threatfox` | 1 h |
| `hist:nvd` (only when the backfill changed) | 20 min |
| `nvd:backfill` | every 90 s while windows remain, otherwise 30 min |
| `hist:dshield` | 3 h |
| `cv:<term>` ×6 (NVD crypto keyword searches) | 6 h |
| `rw:<last year>` daily; `rw:2020…` older archives | weekly |

The `c2` and `dshield` tasks also record the trend snapshots, so history builds up without any visitors. Check what the collector is doing at `GET /api/collector` (behind the gate). A feed the collector hasn't fetched yet shows as **offline – "not collected yet"**. A copy older than 3 collection intervals is flagged `stale`, and the UI shows it as STALE.

### First-time setup (from the project root, the folder that contains `functions/`)
```bash
npm install
npx wrangler login
npx wrangler d1 create sentinel-store              # put the id into wrangler.toml AND worker/wrangler.toml
npx wrangler d1 execute sentinel-store --remote --file migrations/0001_init.sql
# optional: carry over a locally collected NVD backfill (saves ~3 h of rate-limited NVD calls)
node scripts/d1-seed-sql.mjs nvd-backfill data/store/nvd-backfill.json > /tmp/seed.sql
npx wrangler d1 execute sentinel-store --remote --file /tmp/seed.sql

npx wrangler pages project create sentinel-cyber-monitor --production-branch main
openssl rand -base64 24 | tr -d '/+=\n' > ~/cyber-monitor-passcode.txt && chmod 600 ~/cyber-monitor-passcode.txt
npx wrangler pages secret put SITE_PASSCODE --project-name sentinel-cyber-monitor < ~/cyber-monitor-passcode.txt
# optional upstream keys (Pages = nothing; collector = everything):
#   npx wrangler secret put NVD_API_KEY      -c worker/wrangler.toml
#   npx wrangler secret put ABUSECH_AUTH_KEY -c worker/wrangler.toml   (turns ThreatFox on)
```

### Deploy / redeploy
```bash
npm run build
npx wrangler pages deploy dist --project-name sentinel-cyber-monitor --branch main   # run from the project root
npx wrangler deploy -c worker/wrangler.toml                                          # the collector
```
Always deploy from the project root, so `functions/` (and the gate) go up with `dist/`. After every deploy, check that both the production URL and the per-deploy URL return **401** without a cookie:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://sentinel-cyber-monitor.pages.dev/
```

### Deploy from GitHub (Actions)
Pushing to `main` on https://github.com/4n0nym0u5-creator/sentinel runs `.github/workflows/deploy.yml`. The workflow:
1. Type-checks and builds the app.
2. Refuses to deploy if the passcode gate is missing.
3. Applies the D1 schema. This is idempotent.
4. Deploys Pages to production from the repo root, including `functions/`.
5. Deploys the collector Worker.
6. Checks that the production site returns 401 without a cookie.

You can also start it by hand from *Actions › Deploy to Cloudflare › Run workflow*.

One-time setup:
1. **Create an API token:** Cloudflare dashboard → *My Profile › API Tokens › Create Token › Custom token*. Give it these permissions, scoped to your account:
   - **Account › Cloudflare Pages › Edit**
   - **Account › Workers Scripts › Edit** (deploys the collector and its cron trigger)
   - **Account › D1 › Edit** (schema step)
   - **Account › Account Settings › Read**
   - *(recommended)* **User › Memberships › Read** and **User › User Details › Read**, so wrangler can resolve the account without warnings
2. **Add repository secrets:** GitHub repo → *Settings › Secrets and variables › Actions › New repository secret*:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID`: your account ID, shown in the dashboard sidebar or by `npx wrangler whoami`
   - Or from a terminal: `gh secret set CLOUDFLARE_API_TOKEN -R 4n0nym0u5-creator/sentinel`, then the same for `CLOUDFLARE_ACCOUNT_ID`.
3. The passcode is **not** a GitHub secret. It lives only in the Pages project (`SITE_PASSCODE`), and the workflow never touches it.

**Alternative: Cloudflare Git integration for Pages.** Create a *new* Pages project via *Workers & Pages › Create › Pages › Connect to Git*. Use build command `npm run build` and output `dist`. Add the D1 binding `DB` → `sentinel-store` and the secret `SITE_PASSCODE`. An existing Direct-Upload project like this one can't be switched to Git, so the URL would change. The Worker still needs `wrangler deploy` (or Workers Builds) for the collector. The Actions route above keeps the current URL.

> The repo is **public**. That's fine for the code, since no secret is committed. But the site's source, API routes and D1 database id are visible. Access is still protected by the passcode gate on every route.

### Passcode, sign-in, logout, rotation
- The passcode exists only as the Pages secret `SITE_PASSCODE` and in `~/cyber-monitor-passcode.txt` (chmod 600) on the deploying Mac. It is not in git, the bundle, `VITE_*` vars or any log.
- Signing in posts to `/__auth`, which sets an HttpOnly, Secure, SameSite=Lax cookie `sentinel_auth` (HMAC of the passcode) that lasts **7 days**.
- **Log out:** open `/__logout`, or use the ⏻ button in the header.
- **Rotate:** write a new value to the file, re-run `pages secret put SITE_PASSCODE …`, then redeploy (`pages deploy …`) so it takes effect. Every existing session is invalidated, because the cookie is derived from the passcode.
- If the secret is missing, the site fails closed with a 503.

### Free plan notes
- Cron: one trigger out of the account's 5. Each run is one invocation: ≤50 subrequests, CPU-limited. Look for `exceededCpu` with `npx wrangler tail sentinel-collector --format pretty`.
- D1: roughly 25–40k rows written a day, against a limit of 100k. KV was avoided because it allows only 1k writes a day.
- Pages Functions: 100k requests a day. The UI polls about 10 endpoints every 1–10 minutes per open tab.

### Local development is unchanged
`npm run dev` and `npm run preview` still use the in-process API (`shared/handler.ts`) with the file store in `data/store/`. To exercise the Cloudflare path locally:
```bash
(cd worker && npx wrangler dev --test-scheduled --persist-to /tmp/sent-local)   # then: curl 'localhost:8787/__scheduled?cron=*+*+*+*+*'
npx wrangler pages dev dist --persist-to /tmp/sent-local --binding SITE_PASSCODE=<test value>
```

## Data sources
| Panel | Source | Poll |
|---|---|---|
| Ransomware victims | ransomware.live open data `data.ransomware.live/victims.json` (last 30 days, streamed) | 5 min |
| Known exploited vulns | CISA KEV JSON | 10 min |
| Critical CVEs | NIST NVD CVE API 2.0 (CVSS v3 CRITICAL, last 30 days) | 15 min |
| EU vulnerabilities | ENISA EUVD API (exploited / critical / latest) | 15 min |
| Exploit probability | FIRST EPSS API (enriches KEV and NVD) | with the above |
| Botnet C2 | abuse.ch Feodo Tracker IP blocklist (JSON) | 10 min |
| IOCs | abuse.ch ThreatFox API (**needs a free Auth-Key**) | 10 min |
| Attack sensors | SANS ISC / DShield: infocon, top sources, top ports, daily summary, and the AS country per IP | 5 min |
| Crypto hacks & intel | DeFiLlama hacks + 12 crypto-security RSS feeds (see the crypto section) | 10 min |
| Crypto vulnerabilities | CISA KEV + NVD keyword search (crypto terms, 120 days) | 60 min |
| News & advisories | BleepingComputer, The Record, The Hacker News, SecurityWeek, Krebs on Security, Dark Reading, SANS ISC Diary, CISA Advisories, UK NCSC, ACSC (cyber.gov.au) | 3 min |

Requests use an honest User-Agent (`CyberSituationMonitor/1.0`) and are cached server-side to stay polite. The app does not scrape behind bot protection.

## How the THREATCON level is computed
It is a weighted 0–100 score. Each signal is normalised to 0–1, and a signal is skipped if its feed is offline.

| Signal | Weight |
|---|---|
| Ransomware claims in the last 24 h compared with the 30-day daily average | 25 |
| KEV additions in 7 days (10 = max) | 20 |
| Critical news in 48 h (6 = max) | 15 |
| Newly exploited CVEs: NVD with EPSS ≥ 0.1, plus EUVD exploited, in 7 days (5 = max) | 15 |
| SANS ISC Infocon | 15 |
| Feodo C2 servers online (20 = max) | 10 |

Bands: ≥80 → 1 SEVERE, ≥60 → 2 HIGH, ≥40 → 3 ELEVATED, ≥20 → 4 GUARDED, otherwise 5 LOW. It is a situational-awareness heuristic, **not** an official alert level.

## Caveats
- Ransomware entries are *claims* on leak sites, not verified breaches. Victim country is as reported by ransomware.live.
- Attack-source locations are the **AS registration country** of the IP, not attribution of the attacker. The map deliberately draws no source→target arcs, because public feeds don't provide real targets.
- The Feodo Tracker list is small these days (often fewer than 10 entries).
- Only the newest part (about 600 KB) of the very large CISA advisories RSS file is read.
- Severity is rule-based (see `src/lib/model.ts`). News severity comes from keywords.
- Times are shown in UTC and the browser's local zone.

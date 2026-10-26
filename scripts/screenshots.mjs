// Usage: npm run preview (in another shell), then: npm run screenshots [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const out = new URL('../screenshots/', import.meta.url).pathname;
const exe = process.env.CHROME_PATH || (await import('node:fs')).existsSync('/usr/bin/google-chrome') ? (process.env.CHROME_PATH || '/usr/bin/google-chrome') : undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(base, { waitUntil: 'networkidle', timeout: 120000 });
// wait until no feed is still in 'loading' state
await page.waitForFunction(() => document.querySelector('[data-loading]')?.getAttribute('data-loading') === '0', null, { timeout: 120000 }).catch(() => console.warn('some feeds still loading'));
await page.waitForTimeout(2500);
await page.screenshot({ path: out + 'dashboard.png' });
await page.screenshot({ path: out + 'dashboard-full.png', fullPage: true });
// country drill-down: click USA path on the map
const us = page.locator('path[data-cc="US"]');
if (await us.count()) await us.first().dispatchEvent('click'); else console.warn('no US path');
await page.waitForTimeout(1200);
await page.screenshot({ path: out + 'country-drilldown-US.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
// detail panel: first critical item in the live stream
const item = page.locator('[data-ev]').first();
await item.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: out + 'detail-panel.png' });
await page.keyboard.press('Escape');
// feed health
await page.getByTitle('Feed health').click();
await page.waitForTimeout(800);
await page.screenshot({ path: out + 'feed-health.png' });
await page.keyboard.press('Escape');
// ---------- Trends view ----------
await page.goto(base.replace(/\/?$/, '/') + '#/trends', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => document.querySelector('[data-trends-loading]')?.getAttribute('data-trends-loading') === '0', null, { timeout: 180000 }).catch(() => console.warn('trends still loading'));
await page.waitForTimeout(2000);
await page.screenshot({ path: out + 'trends-overview.png' });
await page.screenshot({ path: out + 'trends-full.png', fullPage: true });
// 3-year monthly view of KEV (severity mix + seeding band)
await page.getByRole('button', { name: '3y', exact: true }).click();
await page.locator('[data-stream="kev"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'trends-kev-3y.png', fullPage: true });
// filtered cut: ransomware, healthcare sector, 1y weekly
await page.getByRole('button', { name: '1y', exact: true }).click();
await page.locator('[data-stream="ransomware"]').click();
await page.locator('select[title="Victim sector (ransomware)"]').selectOption('Healthcare');
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'trends-ransomware-healthcare.png', fullPage: true });
// NVD stream
await page.locator('select[title="Victim sector (ransomware)"]').selectOption('');
await page.locator('[data-stream="nvd"]').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'trends-nvd.png', fullPage: true });
// ---------- Crypto view ----------
await page.goto(base.replace(/\/?$/, '/') + '#/crypto', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => document.querySelector('[data-crypto-loading]')?.getAttribute('data-crypto-loading') === '0', null, { timeout: 240000 }).catch(() => console.warn('crypto feeds still loading'));
await page.waitForTimeout(2500);
await page.screenshot({ path: out + 'crypto-overview.png' });
await page.screenshot({ path: out + 'crypto-full.png', fullPage: true });
// detail drawer for the biggest incident in the top-10 table
await page.locator('[data-top="0"]').first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: out + 'crypto-detail.png' });
await page.keyboard.press('Escape'); await page.locator('[data-drawer]').evaluate((e) => e.parentElement.click()).catch(() => {});
await page.waitForTimeout(400);
// trend: incidents >= $1M, all history, filtered to private-key compromise
await page.locator('[data-stream="cryptobig"]').click();
await page.getByRole('button', { name: 'all', exact: true }).last().click();
await page.locator('select[title="Attack technique"]').selectOption('Private-key compromise');
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'crypto-trends-privkey.png', fullPage: true });
await browser.close();
console.log('saved to', out);

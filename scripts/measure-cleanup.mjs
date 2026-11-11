/** 测量生产环境空房回收的实际耗时 */
import { chromium } from 'playwright-core';

const BASE = 'https://ddz.646474.xyz';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:10808', '--ignore-certificate-errors'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
await page.goto(BASE, { waitUntil: 'networkidle' });

const auth = await page.evaluate(async (name) => {
  const r = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '计时', avatar: 'bear' }),
  });
  return r.json();
}, `tm${Date.now().toString().slice(-6)}`);
await page.evaluate(([t, u]) => {
  localStorage.setItem('ddz.token', t);
  localStorage.setItem('ddz.user', JSON.stringify(u));
}, [auth.token, auth.user]);

const room = await page.evaluate(async () => {
  const t = localStorage.getItem('ddz.token');
  const r = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body: JSON.stringify({ players: 3, baseScore: 10 }),
  });
  return r.json();
});
const code = room.code;
console.log('房间:', code);

await page.goto(`${BASE}/?r=${code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b');
await page.mouse.click(640, 400);
await page.waitForTimeout(600);

const t0 = Date.now();
await page.locator('.hud__btn').first().click();
console.log('点击离开:', 0, 's');

for (let i = 1; i <= 40; i++) {
  await page.waitForTimeout(1000);
  const status = await page.evaluate(async (c) => (await fetch('/api/rooms/' + c, { cache: 'no-store' })).status, code);
  if (status === 404) {
    console.log(`房间在 ${((Date.now() - t0) / 1000).toFixed(0)} 秒后被回收`);
    break;
  }
  if (i % 5 === 0) console.log(`  ${i}s -> ${status}`);
  if (i === 40) console.log('40 秒仍未回收');
}

await browser.close();

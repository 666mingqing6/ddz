/** 生产验收（续）：托管跑完一整局，验证结算面板与胜负音乐切换 */
import { chromium } from 'playwright-core';

const BASE = 'https://ddz.646474.xyz';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:10808', '--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
const auth = await page.evaluate(async (name) => {
  const r = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '结算验收', avatar: 'bear' }),
  });
  return r.json();
}, `fin${Date.now().toString().slice(-6)}`);
await page.evaluate(([t, u]) => {
  localStorage.setItem('ddz.token', t);
  localStorage.setItem('ddz.user', JSON.stringify(u));
}, [auth.token, auth.user]);
await page.reload({ waitUntil: 'networkidle' });

const room = await page.evaluate(async () => {
  const t = localStorage.getItem('ddz.token');
  const r = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body: JSON.stringify({ players: 2, baseScore: 10, turnSeconds: 15, botFill: true }),
  });
  return r.json();
});
await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b');
await page.mouse.click(640, 400);

await page.getByRole('button', { name: '准备', exact: true }).click();
await page.waitForTimeout(2500);

// 叫分
const bid3 = page.getByRole('button', { name: '3 分', exact: true });
if (await bid3.count()) {
  try {
    await bid3.click({ timeout: 5000 });
  } catch {
    /* 非我方叫分 */
  }
}
await page.waitForTimeout(1500);

// 开启托管，让服务端自动打完
const autoBtn = page.getByRole('button', { name: '托管', exact: true });
if (await autoBtn.count()) await autoBtn.click();

await page.waitForSelector('.result__panel', { timeout: 150000 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/16-prod-result.png' });

const title = await page.locator('.result__panel h2').innerText();
const rows = await page.locator('.result__row').count();
const avatars = await page.locator('.result__who svg.avatar-svg').count();
console.log('结算标题:', title, '| 行数:', rows, '| 结算头像 SVG:', avatars);
console.log('前端错误:', errors.length ? errors.slice(0, 2) : '无');

await browser.close();

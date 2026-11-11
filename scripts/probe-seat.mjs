/** 创建→进入→离开，输出房间号，便于随后查 D1 判断座位是否释放 */
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
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '座位', avatar: 'fox' }),
  });
  return r.json();
}, `seat${Date.now().toString().slice(-6)}`);
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
console.log('CODE=' + room.code);

await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b');
await page.mouse.click(640, 400);
await page.waitForTimeout(800);
await page.locator('.hud__btn').first().click();
await page.waitForTimeout(2500);

// 直接从页面上下文读取房间状态（no-store 绕过缓存）
const st = await page.evaluate(async (c) => {
  const r = await fetch('/api/rooms/' + c + '/state', { cache: 'no-store' });
  return { status: r.status, body: await r.text() };
}, room.code);
console.log('2.5s 后状态:', st.status, st.body);

await page.waitForTimeout(8000);
const st2 = await page.evaluate(async (c) => {
  const r = await fetch('/api/rooms/' + c, { cache: 'no-store' });
  return r.status;
}, room.code);
console.log('10.5s 后接口:', st2);

await browser.close();

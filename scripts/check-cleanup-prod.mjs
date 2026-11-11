/** 生产环境验证：空房自动回收（默认 5s 宽限） */
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
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '回收验收', avatar: 'pig' }),
  });
  return r.json();
}, `cln${Date.now().toString().slice(-6)}`);
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
console.log('房间号:', room.code);

const lobbyHas = () =>
  page.evaluate(async (code) => {
    const r = await fetch('/api/rooms');
    const j = await r.json();
    return j.rooms.some((x) => x.code === code);
  }, room.code);
const info = () =>
  page.evaluate(async (code) => {
    const r = await fetch('/api/rooms/' + code);
    return r.status;
  }, room.code);

console.log('创建后在大厅:', await lobbyHas());

// 进入房间再离开
await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b', { timeout: 15000 });
await page.mouse.click(640, 400);
await page.waitForTimeout(800);

// 点击返回按钮离开
await page.locator('.hud__btn').first().click();
await page.waitForTimeout(1200);
console.log('离开后 URL:', page.url().includes('?r=') ? '仍在房间' : '已回到大厅');

await page.waitForTimeout(9000);
console.log('9 秒后接口状态:', await info(), '| 仍在大厅:', await lobbyHas());

await browser.close();

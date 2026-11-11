/** 生产验证：对局中刷新页面能否回到原座位并恢复手牌 */
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
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '重连验收', avatar: 'rabbit' }),
  });
  return r.json();
}, `rc${Date.now().toString().slice(-6)}`);
await page.evaluate(([t, u]) => {
  localStorage.setItem('ddz.token', t);
  localStorage.setItem('ddz.user', JSON.stringify(u));
}, [auth.token, auth.user]);

const room = await page.evaluate(async () => {
  const t = localStorage.getItem('ddz.token');
  const r = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body: JSON.stringify({ players: 3, baseScore: 10, turnSeconds: 25, botFill: true }),
  });
  return r.json();
});

await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b');
await page.mouse.click(640, 400);
await page.getByRole('button', { name: '准备', exact: true }).click();
await page.waitForTimeout(3000);

const bid3 = page.getByRole('button', { name: '3 分', exact: true });
if (await bid3.count()) {
  try {
    await bid3.click({ timeout: 4000 });
  } catch {
    /* ignore */
  }
}
await page.waitForTimeout(2000);

const before = await page.evaluate(async (c) => {
  const r = await fetch('/api/rooms/' + c + '/state', { cache: 'no-store' });
  const j = await r.json();
  return j.state;
}, room.code);
console.log('刷新前:', JSON.stringify({ phase: before.phase, humans: before.humans, online: before.onlineHumans }));

const cardsBefore = await page.locator('.hand .card').count();
console.log('刷新前手牌:', cardsBefore);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b', { timeout: 15000 });
await page.waitForTimeout(1500);

const cardsAfter = await page.locator('.hand .card').count();
console.log('刷新后手牌:', cardsAfter);

const after = await page.evaluate(async (c) => {
  const r = await fetch('/api/rooms/' + c + '/state', { cache: 'no-store' });
  const j = await r.json();
  return j.state;
}, room.code);
console.log('刷新后:', JSON.stringify({ phase: after.phase, humans: after.humans, online: after.onlineHumans }));

const sameSeat = before.seats[0].userId === after.seats[0].userId && after.seats[0].online === true;
console.log('座位归属一致:', sameSeat, '| 手牌变化(对局推进中):', cardsBefore, '->', cardsAfter);
console.log(sameSeat ? '重连恢复正常 ✅' : '重连异常 ❌');

// 收尾：另建一个等待中的房间验证回收
const room2 = await page.evaluate(async () => {
  const t = localStorage.getItem('ddz.token');
  const r = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t },
    body: JSON.stringify({ players: 3, baseScore: 10 }),
  });
  return r.json();
});
await page.goto(BASE + '/?r=' + room2.code, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b');
await page.mouse.click(640, 400);
await page.waitForTimeout(800);
await page.locator('.hud__btn').first().click();
await page.waitForTimeout(9000);
const gone = await page.evaluate(async (c) => (await fetch('/api/rooms/' + c, { cache: 'no-store' })).status, room2.code);
console.log('等待中的房间离开 9 秒后:', gone, gone === 404 ? '（已回收 ✅）' : '（未回收 ❌）');

await browser.close();

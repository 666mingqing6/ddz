/** 追踪客户端 WebSocket 生命周期，判断离开房间时是否真的关闭连接 */
import { chromium } from 'playwright-core';

const BASE = 'https://ddz.646474.xyz';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:10808', '--ignore-certificate-errors'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true });

await page.addInitScript(() => {
  window.__ws = [];
  const Orig = window.WebSocket;
  const Wrapped = function (...args) {
    const ws = new Orig(...args);
    window.__ws.push(ws);
    ws.addEventListener('close', () => (ws.__closed = true));
    return ws;
  };
  Wrapped.prototype = Orig.prototype;
  Object.assign(Wrapped, Orig);
  window.WebSocket = Wrapped;
});

await page.goto(BASE, { waitUntil: 'networkidle' });
const auth = await page.evaluate(async (name) => {
  const r = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '追踪', avatar: 'dog' }),
  });
  return r.json();
}, `ws${Date.now().toString().slice(-6)}`);
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
await page.waitForTimeout(500);

const before = await page.evaluate(() => window.__ws.map((w) => w.readyState));
console.log('离开前 WS 状态(0/1/2/3):', before);

await page.locator('.hud__btn').first().click();
await page.waitForTimeout(2000);

const after = await page.evaluate(() => window.__ws.map((w) => ({ rs: w.readyState, closed: !!w.__closed })));
console.log('离开后 WS 状态:', JSON.stringify(after));
console.log('URL:', page.url());

const state = await page.evaluate(async (c) => {
  const r = await fetch('/api/rooms/' + c + '/state', { cache: 'no-store' });
  return r.json();
}, room.code);
console.log('DO 状态:', JSON.stringify(state.state).slice(0, 260));

await browser.close();

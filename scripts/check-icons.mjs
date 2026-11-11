/**
 * 校验：1) 图标/头像为 SVG 2) 音乐开关不再启动合成 BGM（避免双音轨）
 */
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8787';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

// 记录所有 setInterval 的间隔，用于识别合成 BGM（480ms）
await page.addInitScript(() => {
  const orig = window.setInterval;
  window.__intervals = [];
  window.setInterval = function (fn, ms, ...rest) {
    window.__intervals.push(ms);
    return orig.call(this, fn, ms, ...rest);
  };
});

await page.goto(BASE, { waitUntil: 'networkidle' });

const auth = await fetch(BASE + '/api/auth/guest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nickname: '图标测试', avatar: 'fox' }),
}).then((x) => x.json());
await page.evaluate(([t, u]) => {
  localStorage.setItem('ddz.token', t);
  localStorage.setItem('ddz.user', JSON.stringify(u));
}, [auth.token, auth.user]);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 1) emoji 检查：统计正文中的 emoji 字符
const emojiCount = await page.evaluate(() => {
  const text = document.body.innerText;
  const m = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  return m ? m.length : 0;
});
console.log('页面 emoji 数量:', emojiCount);
console.log('SVG 图标数量:', await page.locator('svg.icon').count());
console.log('SVG 头像数量:', await page.locator('svg.avatar-svg').count());

// 2) 切换音乐开关，确认没有启动 480ms 的合成 BGM 定时器
const before = await page.evaluate(() => window.__intervals.slice());
await page.locator('.hud__btn').nth(1).click();
await page.waitForTimeout(800);
const after = await page.evaluate(() => window.__intervals.slice());
const added = after.slice(before.length);
console.log('点击音乐开关后新增定时器:', JSON.stringify(added));
console.log('是否启动合成BGM(480ms):', added.includes(480) ? '是（异常）' : '否（正常）');

// 3) 牌桌内图标
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
await page.waitForTimeout(800);
console.log('牌桌 SVG 图标:', await page.locator('svg.icon').count(), ' 头像:', await page.locator('svg.avatar-svg').count());
await page.screenshot({ path: 'shots/13-icons-table.png' });

await page.getByRole('button', { name: '准备', exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/14-icons-playing.png' });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/15-icons-lobby.png' });

await browser.close();

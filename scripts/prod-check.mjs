/**
 * 生产环境验收：真实浏览器 + 代理 + 自定义域，验证静态资源、注册、建房、WS 实时对局、配乐加载。
 */
import { chromium } from 'playwright-core';

const BASE = process.env.PROD_BASE ?? 'https://ddz.646474.xyz';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROXY = 'http://127.0.0.1:10808';

let fail = 0;
const ok = (c, label, extra = '') => {
  if (c) console.log('✓', label);
  else {
    fail++;
    console.error('✗', label, extra);
  }
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', `--proxy-server=${PROXY}`, '--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const media = [];
page.on('request', (r) => {
  if (r.url().includes('meting-api')) media.push(r.url());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
ok((await page.title()).includes('斗地主'), '线上首页可访问', await page.title());

const stamp = Date.now().toString().slice(-6);
const auth = await page.evaluate(async (name) => {
  const r = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: name, password: 'test123456', nickname: '线上验收', avatar: '🦊' }),
  });
  return r.json();
}, `prod${stamp}`);
ok(!!auth.token, '线上注册成功', JSON.stringify(auth).slice(0, 200));

await page.evaluate(
  ([t, u]) => {
    localStorage.setItem('ddz.token', t);
    localStorage.setItem('ddz.user', JSON.stringify(u));
  },
  [auth.token, auth.user],
);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
ok((await page.locator('.profile-card').count()) > 0, '进入大厅');

const room = await page.evaluate(async () => {
  const t = localStorage.getItem('ddz.token');
  const r = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body: JSON.stringify({ players: 3, baseScore: 10, turnSeconds: 25, botFill: true }),
  });
  return r.json();
});
ok(!!room.code, '线上建房成功', JSON.stringify(room).slice(0, 160));

await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b', { timeout: 15000 });
ok(true, 'WebSocket 连接并同步牌局');
ok((await page.locator('.hand .card').count()) === 0, '等待阶段无手牌');

await page.mouse.click(700, 400); // 解锁音频
await page.waitForTimeout(2500);
ok(media.length > 0, '配乐请求已发出（Meting API）', `count=${media.length}`);

await page.getByRole('button', { name: '准备', exact: true }).click();
await page.waitForTimeout(3000);
const bidding = (await page.locator('text=不叫').count()) > 0 || (await page.locator('text=分').count()) > 0;
ok(bidding, '开局进入叫分阶段');
await page.screenshot({ path: 'shots/10-prod-bidding.png' });

const bid3 = page.getByRole('button', { name: '3 分', exact: true });
if (await bid3.count()) await bid3.click();
await page.waitForSelector('.hand .card', { timeout: 15000 });
const cardCount = await page.locator('.hand .card').count();
ok(cardCount >= 17, '地主拿到底牌', `cards=${cardCount}`);
await page.screenshot({ path: 'shots/11-prod-playing.png' });

// 提示 → 出牌
const hint = page.getByRole('button', { name: '提示', exact: true });
if (await hint.isEnabled()) {
  await hint.click();
  await page.waitForTimeout(600);
  const selected = await page.locator('.hand .card.is-selected').count();
  ok(selected > 0, '提示自动选牌', `selected=${selected}`);
  const playBtn = page.getByRole('button', { name: '出牌', exact: true });
  if (await playBtn.isEnabled()) {
    await playBtn.click();
    await page.waitForTimeout(1500);
    ok((await page.locator('.play-area__cards').count()) > 0, '出牌成功并同步到牌桌');
    await page.screenshot({ path: 'shots/12-prod-played.png' });
  }
}

ok(errors.length === 0, '无前端运行时错误', errors.join(' | ').slice(0, 300));

await page.waitForTimeout(500);
await browser.close();
console.log(fail === 0 ? '\n生产验收全部通过 ✅' : `\n生产验收失败 ${fail} 项 ❌`);
process.exit(fail === 0 ? 0 : 1);

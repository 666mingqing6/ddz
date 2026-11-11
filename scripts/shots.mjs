import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'shots';

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });

async function shootLogin() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/01-login.png` });
  await page.close();
}

async function shootFlow() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const stamp = Date.now().toString().slice(-6);
  const auth = await post('/api/auth/register', {
    username: `shot${stamp}`,
    password: 'test123456',
    nickname: '青衫客',
    avatar: '🦊',
  });
  if (!auth.token) throw new Error('register failed: ' + JSON.stringify(auth));

  await page.evaluate(
    ([t, u]) => {
      localStorage.setItem('ddz.token', t);
      localStorage.setItem('ddz.user', JSON.stringify(u));
    },
    [auth.token, auth.user],
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/02-lobby.png` });

  const room = await post('/api/rooms', { players: 3, baseScore: 10, turnSeconds: 25, botFill: true }, auth.token);
  await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/03-table-waiting.png` });

  // 准备 → 自动开局（空位补机器人）
  await page.getByRole('button', { name: '准备', exact: true }).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/04-bidding.png` });

  // 叫 3 分 → 进入出牌
  const bid3 = page.getByRole('button', { name: '3 分', exact: true });
  if (await bid3.count()) {
    await bid3.click();
    await page.waitForTimeout(2200);
  }
  await page.screenshot({ path: `${OUT}/05-playing.png` });

  // 选中几张牌展示交互态
  const cards = page.locator('.hand .card');
  const n = await cards.count();
  for (let i = 0; i < Math.min(2, n); i++) await cards.nth(i).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/06-selected.png` });

  // 移动端
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.evaluate(
    ([t, u]) => {
      localStorage.setItem('ddz.token', t);
      localStorage.setItem('ddz.user', JSON.stringify(u));
    },
    [auth.token, auth.user],
  );
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(1200);
  await mobile.screenshot({ path: `${OUT}/07-mobile-lobby.png` });
  await mobile.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(1800);
  await mobile.screenshot({ path: `${OUT}/08-mobile-table.png` });

  // 控制台错误检查
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForTimeout(500);
  console.log('page errors:', errors.length ? errors : 'none');
  console.log('room:', room.code);
  await page.close();
  await mobile.close();
}

await shootLogin();
await shootFlow();
await browser.close();
console.log('done');

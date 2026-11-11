import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8787';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

const media = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('meting-api') || u.includes('music.163.com')) media.push(u);
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERR', m.text().slice(0, 200));
});

await page.goto(BASE, { waitUntil: 'networkidle' });

const auth = await fetch(BASE + '/api/auth/guest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nickname: '音乐测试', avatar: '🐼' }),
}).then((x) => x.json());
await page.evaluate(
  ([t, u]) => {
    localStorage.setItem('ddz.token', t);
    localStorage.setItem('ddz.user', JSON.stringify(u));
  },
  [auth.token, auth.user],
);
await page.reload({ waitUntil: 'networkidle' });

// 用户手势解锁音频
await page.mouse.click(600, 400);
await page.waitForTimeout(4500);

console.log('媒体请求数:', media.length);
for (const u of media.slice(0, 6)) console.log('  ', decodeURIComponent(u).slice(0, 120));

// 读取音频元素状态（Audio 未挂载 DOM，通过 monkey patch 记录）
const state = await page.evaluate(() => {
  const el = document.querySelector('audio');
  return el ? { src: el.src, paused: el.paused, volume: el.volume, readyState: el.readyState } : null;
});
console.log('DOM audio:', state);

await page.screenshot({ path: 'shots/09-music-lobby.png' });
await browser.close();

import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8787';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const ids = [2163889758, 2163888604, 2163888606, 2163889757];
  const out = [];
  for (const id of ids) {
    const a = new Audio(`https://meting-api.646474.xyz/api?server=netease&type=url&id=${id}`);
    a.volume = 0;
    const r = await new Promise((res) => {
      const done = (v) => res(v);
      a.addEventListener('playing', () => done('playing'));
      a.addEventListener('error', () => done('error:' + (a.error ? a.error.code : '?')));
      a.play().catch((e) => done('reject:' + e.name));
      setTimeout(() => done('timeout:readyState=' + a.readyState), 9000);
    });
    out.push({ id, r, duration: Math.round(a.duration || 0), src: (a.currentSrc || '').slice(0, 80) });
    a.pause();
  }
  return out;
});

console.log(JSON.stringify(result, null, 2));
await browser.close();

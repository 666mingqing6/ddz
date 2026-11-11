/**
 * 校验：1) 单张王可出 2) 语音播报文案 3) 对局中可发快捷语
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

await page.addInitScript(() => {
  window.__spoken = [];
  const fake = {
    speaking: false,
    pending: false,
    paused: false,
    speak(u) {
      window.__spoken.push(u.text);
    },
    cancel() {},
    pause() {},
    resume() {},
    getVoices() {
      return [{ name: 'Test', lang: 'zh-CN', default: true, localService: true, voiceURI: 'test' }];
    },
    addEventListener() {},
    removeEventListener() {},
    onvoiceschanged: null,
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake });
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));

await page.goto(BASE, { waitUntil: 'networkidle' });
const auth = await fetch(BASE + '/api/auth/guest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ nickname: '语音测试', avatar: 'frog' }),
}).then((x) => x.json());
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
    body: JSON.stringify({ players: 2, baseScore: 10, turnSeconds: 25, botFill: true }),
  });
  return r.json();
});
await page.goto(`${BASE}/?r=${room.code}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.hud__room b');
await page.mouse.click(640, 400);

// 等待阶段也应有快捷语入口
console.log('等待阶段 chat-fab 数量:', await page.locator('.chat-fab').count());

await page.getByRole('button', { name: '准备', exact: true }).click();
await page.waitForTimeout(2600);

// 叫分播报
console.log('叫分后播报:', await page.evaluate(() => window.__spoken.slice()));

const bid3 = page.getByRole('button', { name: '3 分', exact: true });
if (await bid3.count()) {
  try {
    await bid3.click({ timeout: 4000 });
  } catch {
    /* 非我方 */
  }
}
await page.waitForTimeout(1800);

// 对局中快捷语
const fabDuringPlay = await page.locator('.chat-fab').count();
console.log('对局中 chat-fab 数量:', fabDuringPlay);
await page.locator('.chat-fab').click();
await page.waitForTimeout(400);
const popVisible = await page.locator('.chat-pop').count();
console.log('快捷语面板打开:', popVisible > 0);
await page.locator('.chat-pop > button').first().click();
await page.waitForTimeout(1200);
console.log('发快捷语后播报:', await page.evaluate(() => window.__spoken.slice(-2)));
console.log('气泡数量:', await page.locator('.bubble').count());

// 出牌播报：等轮到自己，用提示选牌再出
for (let i = 0; i < 40; i++) {
  const playBtn = page.getByRole('button', { name: '出牌', exact: true });
  if (await playBtn.count()) {
    const enabled = await playBtn.isEnabled();
    if (enabled) break;
    const hint = page.getByRole('button', { name: '提示', exact: true });
    if (await hint.count()) {
      const hintEnabled = await hint.isEnabled();
      if (hintEnabled) {
        await hint.click();
        await page.waitForTimeout(500);
        if (await playBtn.isEnabled()) break;
      }
    }
  }
  await page.waitForTimeout(700);
}
const playBtn = page.getByRole('button', { name: '出牌', exact: true });
if (await playBtn.count()) {
  if (await playBtn.isEnabled()) {
    await page.evaluate(() => (window.__spoken = []));
    await playBtn.click();
    await page.waitForTimeout(1600);
    console.log('出牌播报:', await page.evaluate(() => window.__spoken.slice()));
    const comboLabel = await page.locator('.play-area__label').first().innerText().catch(() => '');
    console.log('牌桌显示牌型:', comboLabel);
  } else {
    console.log('未等到可出牌时机（机器人回合）');
  }
}

await page.screenshot({ path: 'shots/17-voice-chat.png' });
await browser.close();

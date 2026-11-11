/**
 * 空房自动回收验证
 * 前置：.dev.vars 中 EMPTY_GRACE_SECONDS=2 / EMPTY_TTL_SECONDS=4
 */
import { WebSocket } from 'undici';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace('http', 'ws');
let fail = 0;
const ok = (c, label, extra = '') => {
  if (c) console.log('✓', label);
  else {
    fail++;
    console.error('✗', label, extra);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const roomInfo = (code) => fetch(`${BASE}/api/rooms/${code}`).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const inLobby = async (code) => (await fetch(`${BASE}/api/rooms`).then((r) => r.json())).rooms.some((r) => r.code === code);

async function connect(code, token) {
  const ws = new WebSocket(`${WS_BASE}/ws?room=${code}&token=${token}&avatar=panda`);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('ws timeout')), 8000);
    ws.onopen = () => {
      clearTimeout(t);
      res();
    };
    ws.onerror = () => {
      clearTimeout(t);
      rej(new Error('ws error'));
    };
  });
  return ws;
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  const reg = await post('/api/auth/register', { username: `clean${stamp}`, password: 'test123456', nickname: '清理测试', avatar: 'dog' });
  ok(!!reg.data.token, '注册账号');
  const token = reg.data.token;

  // 场景一：创建后立刻离开（无真人）
  const a = await post('/api/rooms', { players: 3, baseScore: 10 }, token);
  const codeA = a.data.code;
  ok(!!codeA, '创建房间 A', JSON.stringify(a.data));
  ok(await inLobby(codeA), '房间 A 出现在大厅');

  const wsA = await connect(codeA, token);
  await sleep(400);
  wsA.send(JSON.stringify({ t: 'leave' }));
  await sleep(400);
  try {
    wsA.close();
  } catch {
    /* ignore */
  }

  // 宽限期 2s，留 4s 观察
  await sleep(4500);
  const infoA = await roomInfo(codeA);
  ok(infoA.status === 404, '无人房间被回收（接口 404）', `status=${infoA.status}`);
  ok(!(await inLobby(codeA)), '无人房间从大厅消失');

  // 场景二：创建后从未进入（仅 /init 占位）
  const b = await post('/api/rooms', { players: 2, baseScore: 10 }, token);
  const codeB = b.data.code;
  ok(!!codeB, '创建房间 B');
  ok(await inLobby(codeB), '房间 B 出现在大厅');
  await sleep(6500); // TTL 4s + 余量
  const infoB = await roomInfo(codeB);
  ok(infoB.status === 404, '从未进入的房间被回收', `status=${infoB.status}`);

  // 场景三：有在线玩家时不得回收
  const c = await post('/api/rooms', { players: 3, baseScore: 10 }, token);
  const codeC = c.data.code;
  const wsC = await connect(codeC, token);
  await sleep(6500);
  const infoC = await roomInfo(codeC);
  ok(infoC.status === 200, '有玩家在线时房间保留', `status=${infoC.status}`);
  ok(await inLobby(codeC), '在线房间仍在大厅');

  wsC.close();
  await sleep(4500);
  const infoC2 = await roomInfo(codeC);
  ok(infoC2.status === 404, '玩家离开后房间被回收', `status=${infoC2.status}`);

  console.log(fail === 0 ? '\n空房回收全部通过 ✅' : `\n失败 ${fail} 项 ❌`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

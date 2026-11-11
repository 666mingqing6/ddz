/**
 * 端到端联调：注册 → 建房 → 双人 WebSocket 入座 → 叫分 → 出牌 → 结算 → 战绩落库
 * 用法: node scripts/e2e.mjs [baseUrl]
 */
import { WebSocket } from 'undici';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace('http', 'ws');

const log = (...a) => console.log('[e2e]', ...a);
let failures = 0;
function check(cond, label, extra = '') {
  if (cond) log('✓', label);
  else {
    failures++;
    console.error('✗', label, extra);
  }
}

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

class Client {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.state = null;
    this.hand = [];
    this.seat = -1;
    this.errors = [];
    this.events = [];
    this.done = false;
    this.ws = null;
  }

  connect(room, avatar = '🐯') {
    const url = `${WS_BASE}/ws?room=${room}&token=${this.token}&avatar=${encodeURIComponent(avatar)}`;
    this.ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name} ws timeout`)), 10000);
      this.ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      this.ws.onerror = (e) => {
        clearTimeout(t);
        reject(new Error(`${this.name} ws error ${e?.message ?? ''}`));
      };
      this.ws.onmessage = (ev) => this.onMessage(ev.data);
    });
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === 'state') {
      this.state = msg.state;
      this.hand = msg.hand;
      this.seat = msg.seat;
      this.events.push(...msg.events);
      this.tick();
    } else if (msg.t === 'error') {
      this.errors.push(msg.message);
    } else if (msg.t === 'hint') {
      this.lastHint = msg.cards;
    }
  }

  tick() {
    const s = this.state;
    if (!s || this.seat < 0) return;
    if (s.phase === 'settled') {
      this.done = true;
      return;
    }
    if (s.turn !== this.seat) return;
    if (s.phase === 'bidding') {
      const maxBid = Math.max(0, ...s.players.map((p) => p.bid ?? 0));
      this.send({ t: 'bid', score: maxBid < 3 ? 3 : 0 });
    } else if (s.phase === 'playing') {
      const prev = s.lastPlay && s.lastPlay.seat !== this.seat ? s.lastPlay : null;
      if (prev) {
        this.send({ t: 'pass' });
      } else {
        const lowest = this.hand[this.hand.length - 1];
        if (lowest) this.send({ t: 'play', cards: [lowest.id] });
      }
    }
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeout = 15000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return true;
    await sleep(120);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  log('base =', BASE);

  // 1. 注册
  const a = await post('/api/auth/register', { username: `e2e_a${stamp}`, password: 'test123456', nickname: '测试甲', avatar: '🐯' });
  check(a.status === 200 && a.data.token, '注册用户 A', JSON.stringify(a.data));
  const b = await post('/api/auth/register', { username: `e2e_b${stamp}`, password: 'test123456', nickname: '测试乙', avatar: '🐼' });
  check(b.status === 200 && b.data.token, '注册用户 B');

  const dup = await post('/api/auth/register', { username: `e2e_a${stamp}`, password: 'test123456', nickname: 'x' });
  check(dup.status === 409, '重复用户名被拒绝');

  const badLogin = await post('/api/auth/login', { username: `e2e_a${stamp}`, password: 'wrongpass' });
  check(badLogin.status === 401, '错误密码被拒绝');

  const login = await post('/api/auth/login', { username: `e2e_a${stamp}`, password: 'test123456' });
  check(login.status === 200 && login.data.token, '正确密码可登录');

  // 2. 建房
  const created = await post('/api/rooms', { players: 3, baseScore: 10, turnSeconds: 15, botFill: true }, a.data.token);
  check(created.status === 200 && /^[A-Z0-9]{5}$/.test(created.data.code ?? ''), '创建房间', JSON.stringify(created.data));
  const code = created.data.code;

  const info = await fetch(`${BASE}/api/rooms/${code}`).then((r) => r.json());
  check(info.ok && info.room.capacity === 3, '房间信息可查询');

  const list = await fetch(`${BASE}/api/rooms`).then((r) => r.json());
  check(list.ok && list.rooms.some((r) => r.code === code), '房间出现在大厅列表');

  const noAuth = await post('/api/rooms', { players: 3 });
  check(noAuth.status === 401, '未登录无法建房');

  // 3. WebSocket 入座
  const ca = new Client('A', a.data.token);
  const cb = new Client('B', b.data.token);
  await ca.connect(code, '🐯');
  await waitFor(() => ca.state, 10000, 'A state');
  check(ca.seat === 0, '房主占据 0 号座位', `seat=${ca.seat}`);

  await cb.connect(code, '🐼');
  await waitFor(() => cb.state, 10000, 'B state');
  check(cb.seat === 1, 'B 进入 1 号座位', `seat=${cb.seat}`);

  // 4. 非法操作被服务端拦截
  cb.send({ t: 'play', cards: ['NOPE'] });
  await sleep(400);
  check(cb.errors.length > 0, '非法出牌被服务端拒绝', JSON.stringify(cb.errors));

  // 5. 准备并开局（第三席由机器人补足）
  ca.send({ t: 'ready', ready: true });
  cb.send({ t: 'ready', ready: true });
  await waitFor(() => ca.state?.phase === 'bidding' || ca.state?.phase === 'playing', 15000, 'game start');
  check(true, '双方准备后自动开局');
  check(ca.state.players.some((p) => p.isBot), '空位由机器人补足');

  // 6. 出牌越权校验：非当前回合玩家出牌
  await waitFor(() => ca.state?.turn !== undefined, 5000, 'turn');
  const notTurn = [ca, cb].find((c) => c.state && c.state.turn !== c.seat);
  if (notTurn) {
    notTurn.errors = [];
    notTurn.send({ t: 'play', cards: [notTurn.hand[0]?.id] });
    await sleep(400);
    check(notTurn.errors.length > 0, '非回合玩家出牌被拒绝', JSON.stringify(notTurn.errors));
  }

  // 7. 等待整局结束
  await waitFor(() => ca.state?.phase === 'settled', 120000, 'settle');
  check(ca.state.phase === 'settled', '牌局正常结算');
  const result = ca.state.result;
  check(!!result, '结算数据存在');
  if (result) {
    const sum = result.deltas.reduce((x, y) => x + y, 0);
    check(sum === 0, '分数守恒（零和）', `sum=${sum}`);
    check(result.multiplier >= 1, '倍数合理', `x${result.multiplier}`);
    check(result.deltas.some((d) => d !== 0), '存在得分变化');
    log('结算:', JSON.stringify({ winner: result.winnerRole, mult: result.multiplier, deltas: result.deltas }));
  }

  // 8. 战绩与金币落库
  await sleep(1200);
  const me = await fetch(`${BASE}/api/me`, { headers: { authorization: `Bearer ${a.data.token}` } }).then((r) => r.json());
  check(me.ok && (me.user.wins + me.user.losses) >= 1, '战绩已写入 D1', JSON.stringify(me.user));

  const hist = await fetch(`${BASE}/api/history`, { headers: { authorization: `Bearer ${a.data.token}` } }).then((r) => r.json());
  check(hist.ok && hist.matches.length >= 1, '对局历史可查询');

  // 9. 断线重连：B 重连后仍是原座位且能看到牌局
  cb.close();
  await sleep(500);
  const cb2 = new Client('B2', b.data.token);
  await cb2.connect(code, '🐼');
  await waitFor(() => cb2.state, 10000, 'reconnect state');
  check(cb2.seat === 1, '重连后回到原座位', `seat=${cb2.seat}`);

  ca.close();
  cb2.close();
  await sleep(300);

  console.log('\n=========================================');
  console.log(failures === 0 ? '全部通过 ✅' : `失败 ${failures} 项 ❌`);
  console.log('=========================================');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[e2e] FATAL', e);
  process.exit(1);
});

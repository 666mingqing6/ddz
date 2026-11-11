/**
 * GameRoom —— 一个房间对应一个 Durable Object。
 * 职责：权威牌局状态机、WebSocket 广播、超时托管、断线重连、战绩落库。
 * 所有出牌都在服务端用同一份规则引擎校验，客户端无法伪造牌型。
 */
import type { Env } from './env';
import type { Card } from '../shared/cards';
import { createDeck, shuffle, sortCards, takeCards } from '../shared/cards';
import type { Combo } from '../shared/rules';
import { canBeat, detectCombo, isBomb } from '../shared/rules';
import { suggestPlay } from '../shared/hints';
import { autoAction } from '../shared/ai';
import type {
  ClientMessage,
  GameEvent,
  Phase,
  PlayRecord,
  PlayerView,
  RoomSettings,
  RoundResult,
  ServerMessage,
  TableView,
} from '../shared/types';
import { DEFAULT_SETTINGS, VARIANTS } from '../shared/types';

interface SeatData {
  userId: string | null;
  name: string;
  avatar: string;
  isBot: boolean;
  ready: boolean;
  hand: Card[];
  role: 'landlord' | 'farmer' | null;
  bid: number | null;
  score: number;
  auto: boolean;
  passed: boolean;
  online: boolean;
  plays: number;
  lastSeen: number;
}

interface RoomData {
  code: string;
  hostSeat: number;
  settings: RoomSettings;
  phase: Phase;
  seats: SeatData[];
  turn: number;
  landlordSeat: number | null;
  bottom: Card[];
  bottomRevealed: boolean;
  multiplier: number;
  lastPlay: { seat: number; cards: Card[]; combo: Combo } | null;
  passCount: number;
  history: PlayRecord[];
  round: number;
  log: string[];
  result: RoundResult | null;
  deadline: number;
  bidCount: number;
  highestBid: number;
  highestBidSeat: number | null;
  createdAt: number;
  updatedAt: number;
}

interface Attachment {
  uid: string;
  name: string;
  avatar: string;
  seat: number;
  spectator: boolean;
}

const BOT_NAMES = ['小美', '阿福', '老K', '豆豆', '阿呆', '花姐', '大龙', '小七'];
const BOT_AVATARS = ['🐯', '🐼', '🦊', '🐵', '🐶', '🐷', '🐸', '🐰'];

function newSeat(): SeatData {
  return {
    userId: null,
    name: '',
    avatar: '',
    isBot: false,
    ready: false,
    hand: [],
    role: null,
    bid: null,
    score: 0,
    auto: false,
    passed: false,
    online: false,
    plays: 0,
    lastSeen: 0,
  };
}

function clean(text: string, max = 16): string {
  return String(text ?? '').replace(/[\u0000-\u001f<>]/g, '').slice(0, max);
}

function safeDecode(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class GameRoom {
  private state: DurableObjectState;
  private env: Env;
  private room: RoomData | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<RoomData>('room')) ?? null;
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async persist(): Promise<void> {
    if (!this.room) return;
    this.room.updatedAt = Date.now();
    await this.state.storage.put('room', this.room);
  }

  // ---------------------------------------------------------------- HTTP

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get('Upgrade');
    if (upgrade && upgrade.toLowerCase() === 'websocket') {
      return this.enqueue(() => this.handleSocket(request, url));
    }
    if (url.pathname === '/init') {
      return this.enqueue(async () => {
        await this.load();
        const uid = request.headers.get('x-user-id') ?? '';
        const name = clean(safeDecode(request.headers.get('x-user-name'), '房主'), 12);
        const avatar = clean(safeDecode(request.headers.get('x-user-avatar'), '🐯'), 4);
        const code = request.headers.get('x-room-code') ?? url.searchParams.get('room') ?? 'ROOM';
        if (!this.room) {
          const players = Number(url.searchParams.get('players') ?? 3);
          const base = Number(url.searchParams.get('base') ?? 10);
          const turn = Number(url.searchParams.get('turn') ?? 25);
          this.room = this.createRoom(code, {
            ...DEFAULT_SETTINGS,
            players: VARIANTS[players] ? players : 3,
            baseScore: [5, 10, 20, 50].includes(base) ? base : 10,
            turnSeconds: [15, 25, 40].includes(turn) ? turn : 25,
            botFill: url.searchParams.get('bot') !== '0',
          });
          if (uid) {
            this.room.seats[0] = {
              ...newSeat(),
              userId: uid,
              name,
              avatar,
              online: false,
              ready: false,
            };
            this.room.hostSeat = 0;
          }
          this.pushLog('房间已创建，等待玩家加入');
          await this.persist();
          await this.syncLobby();
        }
        return Response.json({ ok: true, code: this.room.code });
      });
    }
    if (url.pathname === '/info') {
      await this.load();
      return Response.json({ code: this.room?.code ?? '', phase: this.room?.phase ?? 'waiting' });
    }
    return new Response('not found', { status: 404 });
  }

  private async load(): Promise<void> {
    if (!this.room) this.room = (await this.state.storage.get<RoomData>('room')) ?? null;
  }

  private async handleSocket(request: Request, url: URL): Promise<Response> {
    await this.load();
    const uid = request.headers.get('x-user-id') ?? '';
    const name = clean(safeDecode(request.headers.get('x-user-name'), '玩家'), 12);
    const avatar = clean(safeDecode(request.headers.get('x-user-avatar'), '🐯'), 4);
    if (!uid) return new Response('unauthorized', { status: 401 });

    if (!this.room) {
      const players = Number(url.searchParams.get('players') ?? 3);
      const base = Number(url.searchParams.get('base') ?? 10);
      this.room = this.createRoom(url.searchParams.get('room') ?? 'ROOM', {
        ...DEFAULT_SETTINGS,
        players: VARIANTS[players] ? players : 3,
        baseScore: [5, 10, 20, 50].includes(base) ? base : 10,
      });
    }

    let seat = this.room.seats.findIndex((s) => s.userId === uid);
    let spectator = false;

    if (seat < 0) {
      if (this.room.phase === 'waiting' || this.room.phase === 'settled') {
        seat = this.room.seats.findIndex((s) => !s.userId && !s.isBot);
        if (seat < 0 && this.room.phase === 'settled') {
          // 已结算且满员：允许等待下一局（占位由离开者让出）
          seat = this.room.seats.findIndex((s) => s.isBot);
        }
      }
      if (seat >= 0) {
        this.room.seats[seat] = {
          ...newSeat(),
          userId: uid,
          name,
          avatar,
          online: true,
          lastSeen: Date.now(),
          ready: false,
        };
      } else {
        if (!this.room.settings.allowSpectator) {
          return new Response('room full', { status: 409 });
        }
        spectator = true;
      }
    } else {
      const s = this.room.seats[seat];
      s.online = true;
      s.lastSeen = Date.now();
      s.name = name;
      s.avatar = avatar;
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    const att: Attachment = { uid, name, avatar, seat, spectator };
    server.serializeAttachment(att);

    const events: GameEvent[] = [];
    if (!spectator && seat >= 0) {
      events.push({ t: 'system', text: `${name} 进入了房间` });
    }
    await this.persist();
    await this.syncLobby();
    this.broadcast(events);
    this.sendTo(uid, this.stateMessage(seat, []));

    if (this.room.phase === 'waiting') await this.tryAutoStart();
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------------------------------------------------------------- 房间初始化

  private createRoom(code: string, settings: RoomSettings): RoomData {
    const seats = Array.from({ length: settings.players }, () => newSeat());
    return {
      code,
      hostSeat: 0,
      settings,
      phase: 'waiting',
      seats,
      turn: 0,
      landlordSeat: null,
      bottom: [],
      bottomRevealed: false,
      multiplier: 1,
      lastPlay: null,
      passCount: 0,
      history: [],
      round: 0,
      log: [],
      result: null,
      deadline: 0,
      bidCount: 0,
      highestBid: 0,
      highestBidSeat: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private pushLog(text: string): void {
    if (!this.room) return;
    this.room.log.push(text);
    if (this.room.log.length > 60) this.room.log.splice(0, this.room.log.length - 60);
  }

  private async syncLobby(): Promise<void> {
    if (!this.room) return;
    const occupied = this.room.seats.filter((s) => s.userId || s.isBot).length;
    try {
      await this.env.DB.prepare(
        `INSERT INTO rooms (code, host_id, host_name, capacity, players, status, base_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET players=excluded.players, status=excluded.status,
           capacity=excluded.capacity, base_score=excluded.base_score, host_name=excluded.host_name, updated_at=excluded.updated_at`,
      )
        .bind(
          this.room.code,
          this.room.seats[this.room.hostSeat]?.userId ?? null,
          this.room.seats[this.room.hostSeat]?.name ?? '',
          this.room.settings.players,
          occupied,
          this.room.phase === 'waiting' || this.room.phase === 'settled' ? 'waiting' : 'playing',
          this.room.settings.baseScore,
          this.room.createdAt,
          Date.now(),
        )
        .run();
    } catch {
      // D1 不可用时不影响牌局
    }
  }

  // ---------------------------------------------------------------- 状态视图

  private buildPlayers(): PlayerView[] {
    const r = this.room!;
    return r.seats.map((s, seat) => ({
      seat,
      userId: s.userId,
      name: s.name || `座位 ${seat + 1}`,
      avatar: s.avatar || '🪑',
      isBot: s.isBot,
      ready: s.ready,
      online: s.online || s.isBot,
      handCount: s.hand.length,
      role: s.role,
      bid: s.bid,
      score: s.score,
      auto: s.auto,
      passed: s.passed,
      seatState: s.userId || s.isBot ? 'occupied' : 'empty',
    }));
  }

  private buildView(): TableView {
    const r = this.room!;
    return {
      roomCode: r.code,
      hostSeat: r.hostSeat,
      settings: r.settings,
      variant: VARIANTS[r.settings.players] ?? VARIANTS[3],
      players: this.buildPlayers(),
      phase: r.phase,
      turn: r.turn,
      landlordSeat: r.landlordSeat,
      bottom: r.bottomRevealed ? r.bottom : [],
      bottomRevealed: r.bottomRevealed,
      multiplier: r.multiplier,
      lastPlay: r.lastPlay,
      history: r.history.slice(-30),
      deadline: r.deadline,
      turnSeconds: r.settings.turnSeconds,
      round: r.round,
      log: r.log.slice(-30),
      result: r.result,
      serverTime: Date.now(),
    };
  }

  private stateMessage(seat: number, events: GameEvent[]): ServerMessage {
    const hand = seat >= 0 && this.room ? this.room.seats[seat]?.hand ?? [] : [];
    return { t: 'state', state: this.buildView(), hand: sortCards(hand), seat, events };
  }

  private broadcast(events: GameEvent[] = []): void {
    const sockets = this.state.getWebSockets();
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      try {
        ws.send(JSON.stringify(this.stateMessage(att.seat, events)));
      } catch {
        // 连接已断开
      }
    }
  }

  private sendTo(uid: string, msg: ServerMessage): void {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.uid === uid) {
        try {
          ws.send(JSON.stringify(msg));
        } catch {
          /* ignore */
        }
      }
    }
  }

  private fail(ws: WebSocket, message: string): void {
    try {
      ws.send(JSON.stringify({ t: 'error', message } satisfies ServerMessage));
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- WebSocket 生命周期

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.enqueue(async () => {
      await this.load();
      if (!this.room) return;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMessage;
      } catch {
        return;
      }
      if (msg.t === 'ping') {
        try {
          ws.send(JSON.stringify({ t: 'pong' } satisfies ServerMessage));
        } catch {
          /* ignore */
        }
        return;
      }
      if (att.spectator) {
        if (msg.t === 'chat') {
          this.broadcast([{ t: 'chat', seat: -1, name: att.name, text: clean(msg.text, 40) }]);
        } else {
          this.fail(ws, '观战模式无法操作牌局');
        }
        return;
      }
      const seat = att.seat;
      const seatData = this.room.seats[seat];
      if (!seatData) return;
      seatData.online = true;
      seatData.lastSeen = Date.now();

      switch (msg.t) {
        case 'ready':
          await this.onReady(seat, !!msg.ready);
          break;
        case 'start':
          await this.onStart(seat);
          break;
        case 'bid':
          await this.onBid(seat, Number(msg.score));
          break;
        case 'play':
          await this.onPlay(seat, Array.isArray(msg.cards) ? msg.cards : []);
          break;
        case 'pass':
          await this.onPass(seat);
          break;
        case 'hint': {
          const hand = seatData.hand;
          const prev = this.room.lastPlay && this.room.lastPlay.seat !== seat ? this.room.lastPlay : null;
          const cards = suggestPlay(hand, prev ? prev.combo : null);
          this.sendTo(att.uid, { t: 'hint', cards: cards ? cards.map((c) => c.id) : null });
          break;
        }
        case 'chat': {
          const text = clean(msg.text, 40);
          if (text) this.broadcast([{ t: 'chat', seat, name: seatData.name, text }]);
          break;
        }
        case 'auto':
          seatData.auto = !!msg.on;
          this.broadcast([{ t: 'auto', seat, on: seatData.auto }]);
          if (seatData.auto) await this.maybeAutoAct();
          break;
        case 'settings':
          await this.onSettings(seat, msg.patch ?? {});
          break;
        case 'addBot':
          await this.onAddBot(seat);
          break;
        case 'kick':
          await this.onKick(seat, Number(msg.seat));
          break;
        case 'leave':
          await this.onLeave(seat);
          break;
        default:
          break;
      }
      await this.persist();
      await this.schedule();
    });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.enqueue(async () => {
      await this.load();
      if (!this.room) return;
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att || att.spectator) return;
      const seat = this.room.seats[att.seat];
      if (!seat) return;
      seat.online = false;
      seat.lastSeen = Date.now();
      // 等待中的房间：立即释放座位
      if (this.room.phase === 'waiting') {
        seat.userId = null;
        seat.name = '';
        seat.avatar = '';
        seat.ready = false;
        seat.hand = [];
        if (this.room.hostSeat === att.seat) {
          const next = this.room.seats.findIndex((s) => s.userId);
          this.room.hostSeat = next >= 0 ? next : 0;
        }
      } else {
        seat.auto = true;
        this.pushLog(`${seat.name} 掉线，进入托管`);
      }
      this.broadcast();
      await this.persist();
      await this.syncLobby();
      await this.schedule();
    });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    await this.enqueue(async () => {
      await this.load();
      if (!this.room) return;
      const r = this.room;
      if (r.phase !== 'bidding' && r.phase !== 'playing') return;
      if (Date.now() < r.deadline - 100) {
        await this.schedule();
        return;
      }
      const seat = r.seats[r.turn];
      if (!seat) return;
      if (r.phase === 'bidding') {
        this.pushLog(`${seat.name} 超时未叫分`);
        await this.applyBid(r.turn, 0);
      } else {
        const prev = r.lastPlay && r.lastPlay.seat !== r.turn ? r.lastPlay : null;
        const ctx = {
          mySeat: r.turn,
          landlordSeat: r.landlordSeat,
          handCounts: r.seats.map((s) => s.hand.length),
          lastPlaySeat: prev?.seat ?? null,
        };
        const act = autoAction(seat.hand, prev ? { combo: prev.combo, seat: prev.seat } : null, ctx);
        if (act.type === 'play') await this.applyPlay(r.turn, act.cards);
        else await this.applyPass(r.turn);
      }
      await this.persist();
      await this.schedule();
      this.broadcast();
    });
  }

  private async schedule(): Promise<void> {
    const r = this.room;
    if (!r) return;
    if (r.phase !== 'bidding' && r.phase !== 'playing') {
      r.deadline = 0;
      await this.state.storage.deleteAlarm();
      return;
    }
    const seat = r.seats[r.turn];
    const quick = !seat || seat.isBot || seat.auto || !seat.online;
    const delay = quick ? 1100 : r.settings.turnSeconds * 1000;
    r.deadline = Date.now() + delay;
    await this.state.storage.setAlarm(Date.now() + delay + 120);
  }

  private async maybeAutoAct(): Promise<void> {
    const r = this.room;
    if (!r) return;
    if (r.phase !== 'playing' && r.phase !== 'bidding') return;
    const seat = r.seats[r.turn];
    if (!seat || !seat.auto) return;
    // 由 alarm 统一处理，这里仅缩短等待
    await this.state.storage.setAlarm(Date.now() + 300);
  }

  // ---------------------------------------------------------------- 开局

  private async onReady(seat: number, ready: boolean): Promise<void> {
    const r = this.room!;
    if (r.phase !== 'waiting' && r.phase !== 'settled') return;
    r.seats[seat].ready = ready;
    this.broadcast([{ t: 'ready', seat, ready }]);
    await this.tryAutoStart();
  }

  private async onStart(seat: number): Promise<void> {
    const r = this.room!;
    if (seat !== r.hostSeat) throw new Error('只有房主可以开始');
    if (r.phase !== 'waiting' && r.phase !== 'settled') return;
    await this.startRound(true);
  }

  private async tryAutoStart(): Promise<void> {
    const r = this.room!;
    if (r.phase !== 'waiting' && r.phase !== 'settled') return;
    const humans = r.seats.filter((s) => s.userId && !s.isBot);
    const readyAll = humans.length > 0 && humans.every((s) => s.ready);
    const filled = r.seats.every((s) => s.userId || s.isBot);
    if (readyAll && (filled || r.settings.botFill)) {
      await this.startRound(false);
    }
  }

  private async startRound(force: boolean): Promise<void> {
    const r = this.room!;
    if (r.phase === 'playing' || r.phase === 'bidding') return;

    // 机器人补位
    if (r.settings.botFill) {
      let botIdx = 0;
      for (let i = 0; i < r.seats.length; i++) {
        const s = r.seats[i];
        if (!s.userId && !s.isBot) {
          const used = new Set(r.seats.filter((x) => x.isBot).map((x) => x.name));
          let nm = BOT_NAMES[botIdx % BOT_NAMES.length];
          while (used.has(nm)) {
            botIdx++;
            nm = BOT_NAMES[botIdx % BOT_NAMES.length];
          }
          r.seats[i] = {
            ...newSeat(),
            name: nm,
            avatar: BOT_AVATARS[botIdx % BOT_AVATARS.length],
            isBot: true,
            ready: true,
            online: true,
          };
          botIdx++;
        }
      }
    }

    if (!force) {
      const humans = r.seats.filter((s) => s.userId && !s.isBot);
      if (!humans.length || !humans.every((s) => s.ready)) return;
    }
    if (!r.seats.every((s) => s.userId || s.isBot)) {
      this.pushLog('人数不足，无法开局');
      this.broadcast();
      return;
    }

    const v = VARIANTS[r.settings.players] ?? VARIANTS[3];
    const deck = shuffle(createDeck(v.decks));
    r.seats.forEach((s, i) => {
      s.hand = sortCards(deck.slice(i * v.handSize, (i + 1) * v.handSize));
      s.role = null;
      s.bid = null;
      s.passed = false;
      s.plays = 0;
      s.ready = false;
      s.auto = s.isBot ? true : false;
    });
    r.bottom = sortCards(deck.slice(v.players * v.handSize, v.players * v.handSize + v.bottom));
    r.bottomRevealed = false;
    r.landlordSeat = null;
    r.lastPlay = null;
    r.passCount = 0;
    r.history = [];
    r.result = null;
    r.multiplier = 1;
    r.bidCount = 0;
    r.highestBid = 0;
    r.highestBidSeat = null;
    r.round += 1;
    r.phase = 'bidding';
    r.turn = Math.floor(Math.random() * r.seats.length);
    r.log = [];
    this.pushLog(`第 ${r.round} 局开始，${r.seats[r.turn].name} 先叫分`);
    await this.persist();
    await this.syncLobby();
    this.broadcast([{ t: 'deal' }]);
    await this.schedule();
  }

  // ---------------------------------------------------------------- 叫分

  private async onBid(seat: number, score: number): Promise<void> {
    const r = this.room!;
    if (r.phase !== 'bidding') return;
    if (r.turn !== seat) {
      this.pushLog('还没轮到你叫分');
      this.broadcast();
      return;
    }
    if (![0, 1, 2, 3].includes(score)) return;
    if (score > 0 && score <= r.highestBid) {
      this.pushLog(`叫分必须高于 ${r.highestBid} 分`);
      this.broadcast();
      return;
    }
    await this.applyBid(seat, score);
    await this.persist();
    await this.schedule();
    this.broadcast();
  }

  private async applyBid(seat: number, score: number): Promise<void> {
    const r = this.room!;
    const s = r.seats[seat];
    s.bid = score;
    r.bidCount += 1;
    if (score > r.highestBid) {
      r.highestBid = score;
      r.highestBidSeat = seat;
    }
    this.pushLog(score === 0 ? `${s.name} 不叫` : `${s.name} 叫 ${score} 分`);
    const events: GameEvent[] = [{ t: 'bid', seat, score }];

    if (score === 3 || r.bidCount >= r.seats.length) {
      if (r.highestBidSeat === null) {
        this.pushLog('无人叫地主，重新发牌');
        r.phase = 'waiting';
        this.broadcast([...events, { t: 'system', text: '无人叫地主，重新发牌' }]);
        await this.startRound(true);
        return;
      }
      const landlord = r.highestBidSeat;
      r.landlordSeat = landlord;
      r.multiplier = Math.max(1, r.highestBid);
      r.seats.forEach((p, i) => {
        p.role = i === landlord ? 'landlord' : 'farmer';
        p.passed = false;
      });
      r.seats[landlord].hand = sortCards([...r.seats[landlord].hand, ...r.bottom]);
      r.bottomRevealed = true;
      r.phase = 'playing';
      r.turn = landlord;
      r.lastPlay = null;
      r.passCount = 0;
      this.pushLog(`${r.seats[landlord].name} 成为地主（${r.highestBid} 分）`);
      this.broadcast([...events, { t: 'system', text: `${r.seats[landlord].name} 成为地主` }]);
      await this.schedule();
      return;
    }

    r.turn = (seat + 1) % r.seats.length;
    this.broadcast(events);
    await this.schedule();
  }

  // ---------------------------------------------------------------- 出牌

  private async onPlay(seat: number, ids: string[]): Promise<void> {
    const r = this.room!;
    if (r.phase !== 'playing') {
      this.fail2(seat, '当前不能出牌');
      return;
    }
    if (r.turn !== seat) {
      this.fail2(seat, '还没轮到你出牌');
      return;
    }
    const s = r.seats[seat];
    const taken = takeCards(s.hand, ids);
    if (!taken) {
      this.fail2(seat, '手牌中没有这些牌');
      return;
    }
    const combo = detectCombo(taken.picked);
    if (!combo) {
      this.fail2(seat, '牌型不合法');
      return;
    }
    const prev = r.lastPlay && r.lastPlay.seat !== seat ? r.lastPlay : null;
    if (prev && !canBeat(prev.combo, combo)) {
      this.fail2(seat, '管不上上家的牌');
      return;
    }
    await this.applyPlay(seat, taken.picked);
    await this.persist();
    await this.schedule();
    this.broadcast();
  }

  private fail2(seat: number, message: string): void {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att && att.seat === seat) {
        this.fail(ws, message);
      }
    }
  }

  private async applyPlay(seat: number, cards: Card[]): Promise<void> {
    const r = this.room!;
    const s = r.seats[seat];
    const taken = takeCards(s.hand, cards.map((c) => c.id));
    if (!taken) return;
    const combo = detectCombo(taken.picked);
    if (!combo) return;
    s.hand = taken.rest;
    s.plays += 1;
    s.passed = false;
    r.lastPlay = { seat, cards: taken.picked, combo };
    r.passCount = 0;
    r.seats.forEach((p) => (p.passed = false));
    r.history.push({ seat, cards: taken.picked, combo, action: 'play' });
    if (r.history.length > 60) r.history.splice(0, r.history.length - 60);

    let bomb = false;
    if (isBomb(combo)) {
      r.multiplier *= 2;
      bomb = true;
      this.pushLog(`${s.name} 放了个${combo.type === 'rocket' ? '王炸' : '炸弹'}！倍数 ×2`);
    }
    this.pushLog(`${s.name} 出牌`);

    if (s.hand.length === 0) {
      this.broadcast([{ t: 'play', seat, cards: taken.picked, combo, bomb }]);
      await this.settle(seat);
      return;
    }
    r.turn = (seat + 1) % r.seats.length;
    this.broadcast([{ t: 'play', seat, cards: taken.picked, combo, bomb }]);
    await this.schedule();
  }

  private async onPass(seat: number): Promise<void> {
    const r = this.room!;
    if (r.phase !== 'playing' || r.turn !== seat) return;
    if (!r.lastPlay || r.lastPlay.seat === seat) {
      this.fail2(seat, '你是本轮首家，必须出牌');
      return;
    }
    await this.applyPass(seat);
    await this.persist();
    await this.schedule();
    this.broadcast();
  }

  private async applyPass(seat: number): Promise<void> {
    const r = this.room!;
    const s = r.seats[seat];
    s.passed = true;
    r.passCount += 1;
    this.pushLog(`${s.name} 不出`);
    const active = r.seats.filter((x) => x.hand.length > 0).length;
    const events: GameEvent[] = [{ t: 'pass', seat }];
    if (r.passCount >= active - 1) {
      const lead = r.lastPlay?.seat ?? (seat + 1) % r.seats.length;
      r.lastPlay = null;
      r.passCount = 0;
      r.seats.forEach((p) => (p.passed = false));
      r.turn = lead;
      this.pushLog('新一轮，自由出牌');
    } else {
      r.turn = (seat + 1) % r.seats.length;
    }
    this.broadcast(events);
    await this.schedule();
  }

  // ---------------------------------------------------------------- 结算

  private async settle(winnerSeat: number): Promise<void> {
    const r = this.room!;
    const landlordSeat = r.landlordSeat!;
    const landlordWon = winnerSeat === landlordSeat;
    const farmers = r.seats.filter((_, i) => i !== landlordSeat);
    const spring = landlordWon
      ? farmers.every((f) => f.plays === 0)
      : r.seats[landlordSeat].plays <= 1;
    if (spring) r.multiplier *= 2;

    const base = r.settings.baseScore;
    const unit = base * r.multiplier;
    const deltas = r.seats.map((s, i) => {
      if (i === landlordSeat) return (landlordWon ? 1 : -1) * unit * (r.seats.length - 1);
      return (landlordWon ? -1 : 1) * unit;
    });
    r.seats.forEach((s, i) => (s.score += deltas[i]));

    const handCards: Record<number, Card[]> = {};
    r.seats.forEach((s, i) => (handCards[i] = sortCards(s.hand)));

    const result: RoundResult = {
      winnerSeat,
      winnerRole: landlordWon ? 'landlord' : 'farmer',
      landlordSeat,
      baseScore: base,
      multiplier: r.multiplier,
      spring,
      deltas,
      scores: r.seats.map((s) => s.score),
      bombCount: 0,
      handCards,
    };
    r.result = result;
    r.phase = 'settled';
    r.deadline = 0;
    this.pushLog(landlordWon ? '地主获胜' : '农民获胜');
    this.broadcast([{ t: 'settle', result }]);
    await this.state.storage.deleteAlarm();

    // 战绩落库（失败不影响牌局）
    try {
      const payload = {
        room: r.code,
        seats: r.seats.map((s, i) => ({
          seat: i,
          userId: s.userId,
          name: s.name,
          role: s.role,
          delta: deltas[i],
        })),
      };
      await this.env.DB.prepare(
        `INSERT INTO matches (room_code, round, landlord_id, winner_role, base_score, multiplier, spring, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          r.code,
          r.round,
          r.seats[landlordSeat].userId,
          result.winnerRole,
          base,
          r.multiplier,
          spring ? 1 : 0,
          JSON.stringify(payload),
          Date.now(),
        )
        .run();

      const stmts = r.seats
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !!s.userId)
        .map(({ s, i }) => {
          const win = deltas[i] > 0;
          return this.env.DB.prepare(
            `UPDATE users SET coins = MAX(0, coins + ?), wins = wins + ?, losses = losses + ? WHERE id = ?`,
          ).bind(deltas[i], win ? 1 : 0, win ? 0 : 1, s.userId);
        });
      if (stmts.length) await this.env.DB.batch(stmts);
    } catch {
      // ignore
    }

    r.seats.forEach((s) => {
      s.ready = s.isBot;
      s.auto = false;
    });
    await this.persist();
    await this.syncLobby();
  }

  // ---------------------------------------------------------------- 房间管理

  private async onSettings(seat: number, patch: Partial<RoomSettings>): Promise<void> {
    const r = this.room!;
    if (seat !== r.hostSeat) {
      this.fail2(seat, '只有房主可以修改设置');
      return;
    }
    if (r.phase === 'playing' || r.phase === 'bidding') {
      this.fail2(seat, '牌局进行中无法修改');
      return;
    }
    const next: RoomSettings = { ...r.settings };
    if (patch.players && VARIANTS[patch.players]) next.players = patch.players;
    if (patch.baseScore && [5, 10, 20, 50].includes(patch.baseScore)) next.baseScore = patch.baseScore;
    if (patch.turnSeconds && [15, 25, 40].includes(patch.turnSeconds)) next.turnSeconds = patch.turnSeconds;
    if (typeof patch.botFill === 'boolean') next.botFill = patch.botFill;
    if (typeof patch.allowSpectator === 'boolean') next.allowSpectator = patch.allowSpectator;

    if (next.players !== r.seats.length) {
      if (next.players < r.seats.length) {
        const removed = r.seats.slice(next.players);
        if (removed.some((s) => s.userId && !s.isBot)) {
          this.fail2(seat, '该座位有玩家，无法减少人数');
          return;
        }
        r.seats = r.seats.slice(0, next.players);
      } else {
        while (r.seats.length < next.players) r.seats.push(newSeat());
      }
      if (r.hostSeat >= r.seats.length) r.hostSeat = 0;
    }
    r.settings = next;
    this.pushLog(`房主调整了房间设置（${next.players} 人 / 底分 ${next.baseScore}）`);
    this.broadcast([{ t: 'system', text: '房间设置已更新' }]);
    await this.syncLobby();
  }

  private async onAddBot(seat: number): Promise<void> {
    const r = this.room!;
    if (seat !== r.hostSeat) return;
    if (r.phase === 'playing' || r.phase === 'bidding') return;
    const idx = r.seats.findIndex((s) => !s.userId && !s.isBot);
    if (idx < 0) return;
    const used = new Set(r.seats.filter((x) => x.isBot).map((x) => x.name));
    let k = 0;
    let nm = BOT_NAMES[k];
    while (used.has(nm)) nm = BOT_NAMES[++k % BOT_NAMES.length];
    r.seats[idx] = { ...newSeat(), name: nm, avatar: BOT_AVATARS[k % BOT_AVATARS.length], isBot: true, ready: true, online: true };
    this.broadcast([{ t: 'system', text: `${nm} 加入房间` }]);
    await this.syncLobby();
    await this.tryAutoStart();
  }

  private async onKick(seat: number, target: number): Promise<void> {
    const r = this.room!;
    if (seat !== r.hostSeat || target === seat) return;
    if (r.phase === 'playing' || r.phase === 'bidding') return;
    const t = r.seats[target];
    if (!t) return;
    const uid = t.userId;
    r.seats[target] = newSeat();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att && uid && att.uid === uid) {
        try {
          ws.send(JSON.stringify({ t: 'closed', reason: '你已被房主移出房间' } satisfies ServerMessage));
          ws.close(4001, 'kicked');
        } catch {
          /* ignore */
        }
      }
    }
    this.broadcast([{ t: 'system', text: '一名玩家被移出房间' }]);
    await this.syncLobby();
  }

  private async onLeave(seat: number): Promise<void> {
    const r = this.room!;
    const s = r.seats[seat];
    if (!s) return;
    const uid = s.userId;
    if (r.phase === 'playing' || r.phase === 'bidding') {
      s.auto = true;
      s.online = false;
      this.pushLog(`${s.name} 离开，由系统托管`);
      this.broadcast();
      return;
    }
    r.seats[seat] = newSeat();
    if (r.hostSeat === seat) {
      const next = r.seats.findIndex((x) => x.userId);
      r.hostSeat = next >= 0 ? next : 0;
    }
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att && uid && att.uid === uid) {
        try {
          ws.send(JSON.stringify({ t: 'closed', reason: '已离开房间' } satisfies ServerMessage));
          ws.close(4002, 'left');
        } catch {
          /* ignore */
        }
      }
    }
    this.broadcast([{ t: 'system', text: '一名玩家离开了房间' }]);
    await this.syncLobby();
  }
}

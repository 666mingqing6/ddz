/** 客户端 / 服务端共享协议与状态类型 */
import type { Card } from './cards';
import type { Combo } from './rules';

export type Phase = 'waiting' | 'dealing' | 'bidding' | 'playing' | 'settled';

export interface VariantConfig {
  players: number;
  decks: number;
  handSize: number;
  bottom: number;
}

export const VARIANTS: Record<number, VariantConfig> = {
  2: { players: 2, decks: 1, handSize: 17, bottom: 20 },
  3: { players: 3, decks: 1, handSize: 17, bottom: 3 },
  4: { players: 4, decks: 2, handSize: 25, bottom: 8 },
};

export interface RoomSettings {
  players: number;
  baseScore: number;
  turnSeconds: number;
  botFill: boolean;
  allowSpectator: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  players: 3,
  baseScore: 10,
  turnSeconds: 25,
  botFill: true,
  allowSpectator: true,
};

export interface PlayerView {
  seat: number;
  userId: string | null;
  name: string;
  avatar: string;
  isBot: boolean;
  ready: boolean;
  online: boolean;
  handCount: number;
  role: 'landlord' | 'farmer' | null;
  bid: number | null;
  score: number;
  auto: boolean;
  passed: boolean;
  seatState: 'empty' | 'occupied' | 'left';
}

export interface PlayRecord {
  seat: number;
  cards: Card[];
  combo: Combo | null;
  action: 'play' | 'pass' | 'bid';
  bid?: number;
}

export interface RoundResult {
  winnerSeat: number;
  winnerRole: 'landlord' | 'farmer';
  landlordSeat: number;
  baseScore: number;
  multiplier: number;
  spring: boolean;
  deltas: number[];
  scores: number[];
  bombCount: number;
  handCards: Record<number, Card[]>;
}

export interface TableView {
  roomCode: string;
  hostSeat: number;
  settings: RoomSettings;
  variant: VariantConfig;
  players: PlayerView[];
  phase: Phase;
  turn: number;
  landlordSeat: number | null;
  bottom: Card[];
  bottomRevealed: boolean;
  multiplier: number;
  lastPlay: { seat: number; cards: Card[]; combo: Combo } | null;
  history: PlayRecord[];
  deadline: number;
  turnSeconds: number;
  round: number;
  log: string[];
  result: RoundResult | null;
  serverTime: number;
}

export type GameEvent =
  | { t: 'deal' }
  | { t: 'bid'; seat: number; score: number }
  | { t: 'play'; seat: number; cards: Card[]; combo: Combo; bomb: boolean }
  | { t: 'pass'; seat: number }
  | { t: 'turn'; seat: number; deadline: number }
  | { t: 'settle'; result: RoundResult }
  | { t: 'chat'; seat: number; name: string; text: string }
  | { t: 'system'; text: string }
  | { t: 'auto'; seat: number; on: boolean }
  | { t: 'ready'; seat: number; ready: boolean };

export type ClientMessage =
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'bid'; score: number }
  | { t: 'play'; cards: string[] }
  | { t: 'pass' }
  | { t: 'hint' }
  | { t: 'chat'; text: string }
  | { t: 'auto'; on: boolean }
  | { t: 'settings'; patch: Partial<RoomSettings> }
  | { t: 'addBot'; seat?: number }
  | { t: 'kick'; seat: number }
  | { t: 'leave' }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'state'; state: TableView; hand: Card[]; seat: number; events: GameEvent[] }
  | { t: 'error'; message: string }
  | { t: 'hint'; cards: string[] | null }
  | { t: 'pong' }
  | { t: 'closed'; reason: string };

export const QUICK_CHATS = [
  '快点啊，等到花儿都谢了',
  '你是 MM 还是 GG',
  '不要走，决战到天亮',
  '你的牌打得也太好了吧',
  '大家不要走，再来一局',
  '我等到花儿都谢了',
  '炸死你',
  '不好意思，手滑了',
];

export interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  coins: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: number;
}

export interface RoomSummary {
  code: string;
  hostName: string;
  players: number;
  capacity: number;
  status: 'waiting' | 'playing';
  baseScore: number;
  updatedAt: number;
}

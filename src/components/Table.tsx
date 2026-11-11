import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../shared/cards';
import { createDeck, RANK_LABEL, sortCards } from '../../shared/cards';
import { canBeat, describeCombo, detectCombo } from '../../shared/rules';
import { findBeats } from '../../shared/hints';
import type { GameEvent, TableView, UserProfile } from '../../shared/types';
import { QUICK_CHATS } from '../../shared/types';
import { CardView } from './Card';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { sfx, unlockAudio, audioSettings, setAudioSettings } from '../audio/sfx';
import { music } from '../audio/music';
import type { GameSession } from '../game/useGame';

interface Props {
  session: GameSession;
  user: UserProfile;
  onLeave: () => void;
}

type Pos = 'top' | 'left' | 'right';

function seatPos(rel: number, n: number): Pos {
  if (n === 2) return 'top';
  if (n === 3) return rel === 1 ? 'right' : 'left';
  if (rel === 1) return 'right';
  if (rel === 2) return 'top';
  return 'left';
}

interface ChatItem {
  id: number;
  seat: number;
  name: string;
  text: string;
}

export function Table({ session, user, onLeave }: Props) {
  const { state, hand, seat, connected, error, events, eventSeq, clockOffset, send, clearError } = session;

  const [selected, setSelected] = useState<string[]>([]);
  const [hintIndex, setHintIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showCounter, setShowCounter] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > 760));
  const [resultOpen, setResultOpen] = useState(false);
  const [dealAnim, setDealAnim] = useState(0);
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [musicOn, setMusicOn] = useState(() => audioSettings().bgm);
  const chatSeq = useRef(0);

  // 首次手势解锁音频
  useEffect(() => {
    const onFirst = () => {
      unlockAudio();
      music.unlock();
      window.removeEventListener('pointerdown', onFirst);
    };
    window.addEventListener('pointerdown', onFirst);
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  // 场景配乐
  useEffect(() => {
    if (!state) return;
    if (state.phase === 'bidding' || state.phase === 'playing') music.setMode('game');
    else music.setMode('lobby');
  }, [state?.phase]);

  // 紧张度：倍数高或手牌见底时切「激烈」
  useEffect(() => {
    if (!state) return;
    const myCount = state.players[seat]?.handCount ?? 99;
    music.setTension(state.multiplier >= 3 || myCount <= 5);
  }, [state?.multiplier, state?.players, seat]);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const me = state?.players[seat];
  const isMyTurn = !!state && state.turn === seat && (state.phase === 'playing' || state.phase === 'bidding');
  const prev = state?.lastPlay && state.lastPlay.seat !== seat ? state.lastPlay : null;

  // 计时器
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  // 事件驱动音效与动画
  useEffect(() => {
    if (!events.length) return;
    const triggerShake = () => {
      setShake(false);
      window.setTimeout(() => setShake(true), 16);
      window.setTimeout(() => setShake(false), 620);
    };
    for (const ev of events) {
      switch (ev.t) {
        case 'deal':
          setDealAnim((n) => n + 1);
          sfx.deal();
          break;
        case 'bid':
          sfx.bid(ev.score);
          break;
        case 'play':
          if (ev.combo.type === 'rocket') {
            sfx.rocket();
            triggerShake();
            setFlash('王炸');
          } else if (ev.combo.type === 'bomb') {
            sfx.bomb();
            triggerShake();
            setFlash('炸弹');
          } else {
            sfx.play();
          }
          break;
        case 'pass':
          sfx.pass();
          break;
        case 'turn':
          if (ev.seat === seat) sfx.turn();
          break;
        case 'chat':
          chatSeq.current += 1;
          setChats((list) => [...list.slice(-3), { id: chatSeq.current, seat: ev.seat, name: ev.name, text: ev.text }]);
          break;
        case 'settle':
          setResultOpen(true);
          music.setMode((ev.result.deltas[seat] ?? 0) >= 0 ? 'win' : 'lose', true);
          if ((ev.result.deltas[seat] ?? 0) >= 0) sfx.win();
          else sfx.lose();
          break;
        default:
          break;
      }
    }
  }, [eventSeq, events, seat]);

  // 聊天气泡自动消失
  useEffect(() => {
    if (!chats.length) return;
    const t = window.setTimeout(() => setChats((list) => list.slice(1)), 4200);
    return () => window.clearTimeout(t);
  }, [chats]);

  // 闪光层
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(t);
  }, [flash]);

  // 错误提示
  useEffect(() => {
    if (!error) return;
    setToast(error);
    clearError();
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  // 轮次变化时清空选择
  useEffect(() => {
    setSelected([]);
    setHintIndex(0);
  }, [state?.turn, state?.phase, state?.round]);

  useEffect(() => {
    if (state?.phase === 'playing' || state?.phase === 'bidding') setResultOpen(false);
  }, [state?.phase, state?.round]);

  const selectedCards = useMemo(() => hand.filter((c) => selected.includes(c.id)), [hand, selected]);
  const combo = useMemo(() => (selectedCards.length ? detectCombo(selectedCards) : null), [selectedCards]);
  const canPlayNow = !!combo && canBeat(prev?.combo ?? null, combo);

  const toggle = useCallback(
    (card: Card) => {
      unlockAudio();
      if (!isMyTurn) return;
      sfx.select();
      setSelected((list) => (list.includes(card.id) ? list.filter((id) => id !== card.id) : [...list, card.id]));
    },
    [isMyTurn],
  );

  const doPlay = useCallback(() => {
    if (!selectedCards.length) return;
    if (!combo) {
      setToast('牌型不合法');
      return;
    }
    if (!canPlayNow) {
      setToast('管不上上家的牌');
      return;
    }
    send({ t: 'play', cards: selectedCards.map((c) => c.id) });
    setSelected([]);
  }, [selectedCards, combo, canPlayNow, send]);

  const doHint = useCallback(() => {
    unlockAudio();
    const beats = findBeats(hand, prev?.combo ?? null);
    if (!beats.length) {
      setToast(prev ? '没有能管上的牌' : '无牌可出');
      return;
    }
    const pick = beats[hintIndex % beats.length];
    setHintIndex((n) => n + 1);
    setSelected(pick.map((c) => c.id));
    sfx.select();
  }, [hand, prev, hintIndex]);

  const doPass = useCallback(() => {
    if (!prev) {
      setToast('你是本轮首家，必须出牌');
      return;
    }
    send({ t: 'pass' });
    setSelected([]);
  }, [prev, send]);

  const say = useCallback(
    (text: string) => {
      send({ t: 'chat', text });
      setChatOpen(false);
    },
    [send],
  );

  // 记牌器：未出现的牌（必须在任何提前 return 之前调用）
  const counter = useMemo(() => {
    const decks = state?.variant.decks ?? 1;
    const total = new Map<number, number>();
    for (let r = 3; r <= 15; r++) total.set(r, 4 * decks);
    total.set(16, decks);
    total.set(17, decks);
    const seen = new Set<string>();
    for (const c of hand) seen.add(c.id);
    for (const rec of state?.history ?? []) for (const c of rec.cards) seen.add(c.id);
    const fullDeck = createDeck(decks);
    for (const id of seen) {
      const card = fullDeck.find((c) => c.id === id);
      if (card) total.set(card.rank, Math.max(0, (total.get(card.rank) ?? 0) - 1));
    }
    return total;
  }, [hand, state?.history, state?.variant.decks]);

  if (!state || !me) {
    return (
      <div className="loading-screen">
        <div className="loading-cards">
          <CardView faceDown small style={{ transform: 'rotate(-12deg) translateX(8px)' }} />
          <CardView faceDown small style={{ transform: 'translateY(-6px)' }} />
          <CardView faceDown small style={{ transform: 'rotate(12deg) translateX(-8px)' }} />
        </div>
        <p>{connected ? '正在同步牌桌…' : '正在连接服务器…'}</p>
      </div>
    );
  }

  const remain = Math.max(0, Math.ceil((state.deadline - (now + clockOffset)) / 1000));
  const timerPct = state.deadline ? Math.min(100, (remain / state.turnSeconds) * 100) : 0;
  const myResult = state.result ? state.result.deltas[seat] ?? 0 : 0;

  const others = state.players
    .map((p, i) => ({ p, i, rel: (i - seat + state.players.length) % state.players.length }))
    .filter((x) => x.rel !== 0);

  // 手牌自适应：按屏宽与牌数计算重叠量，保证不溢出
  const cardW = vw < 420 ? 42 : vw < 760 ? 48 : vw < 1200 ? 58 : 68;
  const cardH = Math.round(cardW * 1.4);
  const avail = Math.min(vw, 1200) - 28;
  const handGap = hand.length > 1 ? Math.min(-6, (avail - cardW) / (hand.length - 1) - cardW) : 0;

  return (
    <div className={`table-screen ${shake ? 'is-shaking' : ''}`}>
      <div className="table-screen__bg" />
      <div className="table-screen__rim" />
      <div className="table-screen__emblem">斗</div>
      <div className="table-screen__glow" />

      {/* 顶部信息条 */}
      <header className="hud">
        <button className="hud__btn" onClick={onLeave} title="退出房间">
          <Icon name="back" size={18} />
        </button>
        <div className="hud__room" title="点击复制房间号" onClick={() => {
          void navigator.clipboard?.writeText(state.roomCode);
          setToast('房间号已复制');
        }}>
          <span className="hud__label">房间</span>
          <b>{state.roomCode}</b>
        </div>
        <div className="hud__pill">
          <span>底分</span>
          <b>{state.settings.baseScore}</b>
        </div>
        <div className="hud__pill hud__pill--gold">
          <span>倍数</span>
          <b>×{state.multiplier}</b>
        </div>
        <div className="hud__pill hud__pill--round">
          <span>第</span>
          <b>{Math.max(1, state.round)}</b>
          <span>局</span>
        </div>
        <div className="hud__spacer" />
        <button
          className={`hud__btn ${musicOn ? 'is-on' : ''}`}
          title={musicOn ? '关闭音乐' : '开启音乐'}
          onClick={() => {
            const next = setAudioSettings({ bgm: !musicOn });
            setMusicOn(next.bgm);
            music.setEnabled(next.bgm);
          }}
        >
          <Icon name={musicOn ? 'music' : 'musicOff'} size={18} />
        </button>
        <button className={`hud__btn ${showCounter ? 'is-on' : ''}`} onClick={() => setShowCounter((v) => !v)} title="记牌器">
          <Icon name="counter" size={18} />
        </button>
        <div className={`hud__conn ${connected ? 'is-on' : ''}`} title={connected ? '已连接' : '重连中'} />
      </header>

      {/* 底牌 */}
      <div className="bottom-cards">
        <span className="bottom-cards__label">底牌</span>
        <div className="bottom-cards__row">
          {state.variant.bottom > 0 &&
            Array.from({ length: state.variant.bottom }).map((_, i) =>
              state.bottomRevealed && state.bottom[i] ? (
                <CardView key={i} card={state.bottom[i]} mini />
              ) : (
                <CardView key={i} faceDown mini />
              ),
            )}
        </div>
      </div>

      {/* 其他玩家 */}
      {others.map(({ p, i, rel }) => {
        const pos = seatPos(rel, state.players.length);
        const active = state.turn === i && (state.phase === 'playing' || state.phase === 'bidding');
        const bubble = chats.find((c) => c.seat === i);
        return (
          <div key={i} className={`seat seat--${pos} ${active ? 'is-turn' : ''} ${p.role === 'landlord' ? 'is-landlord' : ''} ${!p.online ? 'is-offline' : ''}`}>
            <div className="seat__avatar">
              {p.seatState === 'empty' ? (
                <span className="seat__empty">
                  <Icon name="users" size={26} />
                </span>
              ) : (
                <Avatar id={p.avatar} size={46} />
              )}
              {p.role && <span className={`seat__role seat__role--${p.role}`}>{p.role === 'landlord' ? '地主' : '农民'}</span>}
              {p.auto && <span className="seat__auto">托管</span>}
              {active && <span className="seat__ring" style={{ ['--pct' as string]: `${timerPct}%` }} />}
            </div>
            <div className="seat__meta">
              <span className="seat__name">{p.name}</span>
              <span className="seat__count">剩 {p.handCount} 张</span>
            </div>
            <div className="seat__cards">
              {Array.from({ length: Math.min(6, Math.ceil(p.handCount / 4)) }).map((_, k) => (
                <CardView key={k} faceDown mini style={{ marginLeft: k ? -26 : 0 }} />
              ))}
            </div>
            {p.passed && <div className="seat__pass">不出</div>}
            {p.bid !== null && state.phase === 'bidding' && (
              <div className="seat__bid">{p.bid === 0 ? '不叫' : `${p.bid} 分`}</div>
            )}
            {bubble && <div className="bubble bubble--seat">{bubble.text}</div>}
          </div>
        );
      })}

      {/* 中央状态 */}
      <div className="table-status">
        {state.phase === 'waiting' && (
          <>
            <i className="table-status__dot" />
            {me.ready ? '已准备，等待其他玩家…' : '点击「准备」开始牌局'}
          </>
        )}
        {state.phase === 'bidding' && (
          <>
            <i className="table-status__dot" />
            {state.turn === seat ? '轮到你叫分' : `等待 ${state.players[state.turn]?.name ?? ''} 叫分`}
            {state.deadline > 0 && <b className="table-status__timer">{remain}s</b>}
          </>
        )}
        {state.phase === 'playing' && (
          <>
            <i className="table-status__dot" />
            {state.turn === seat ? '轮到你了' : `${state.players[state.turn]?.name ?? ''} 正在思考`}
            {state.deadline > 0 && <b className="table-status__timer">{remain}s</b>}
          </>
        )}
        {state.phase === 'settled' && <><i className="table-status__dot" />本局结束，等待下一局</>}
      </div>

      {/* 出牌区 */}
      <div className={`play-area ${state.lastPlay ? `play-area--${state.lastPlay.seat === seat ? 'me' : seatPos((state.lastPlay.seat - seat + state.players.length) % state.players.length, state.players.length)}` : ''}`}>
        {state.lastPlay && (
          <div className="play-area__cards" key={`${state.lastPlay.seat}-${state.lastPlay.cards.map((c) => c.id).join('')}`}>
            {sortCards(state.lastPlay.cards).map((c, i) => (
              <CardView key={c.id} card={c} small style={{ animationDelay: `${i * 35}ms`, marginLeft: i ? -18 : 0 }} />
            ))}
            <span className="play-area__label">{describeCombo(state.lastPlay.combo)}</span>
          </div>
        )}
      </div>

      {/* 记牌器 */}
      {showCounter && (
        <aside className="counter">
          <div className="counter__title">记牌器</div>
          <div className="counter__grid">
            {[17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((r) => {
              const left = counter.get(r) ?? 0;
              return (
                <div key={r} className={`counter__cell ${left === 0 ? 'is-zero' : ''} ${r >= 16 ? 'is-joker' : ''}`}>
                  <span className="counter__rank">{r >= 16 ? (r === 17 ? '大' : '小') : RANK_LABEL[r]}</span>
                  <span className="counter__num">{left}</span>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* 我的座位 */}
      <div className={`me ${state.turn === seat && state.phase === 'playing' ? 'is-turn' : ''}`}>
        <div className="me__avatar">
          <Avatar id={me.avatar} size={34} />
          {me.role && <span className={`seat__role seat__role--${me.role}`}>{me.role === 'landlord' ? '地主' : '农民'}</span>}
          <span className="me__name">{me.name}</span>
          <span className="me__coins">
            <Icon name="coin" size={12} />
            {user.coins}
          </span>
        </div>

        <div className={`hand ${dealAnim ? 'is-dealt' : ''}`} key={`hand-${state.round}-${dealAnim}`} style={{ ['--cw' as string]: `${cardW}px`, ['--ch' as string]: `${cardH}px` }}>
          {hand.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              selected={selected.includes(c.id)}
              onClick={() => toggle(c)}
              style={{ animationDelay: `${i * 22}ms`, zIndex: i, marginLeft: i ? handGap : 0 }}
            />
          ))}
        </div>

        {/* 操作区 */}
        <div className="actions">
          {state.phase === 'bidding' && isMyTurn && (
            <div className="actions__bids">
              <button className="btn btn--ghost" onClick={() => send({ t: 'bid', score: 0 })}>不叫</button>
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  className="btn btn--gold"
                  disabled={s <= (Math.max(0, ...state.players.map((p) => p.bid ?? 0)))}
                  onClick={() => send({ t: 'bid', score: s })}
                >
                  {s} 分
                </button>
              ))}
            </div>
          )}

          {state.phase === 'playing' && (
            <div className="actions__play">
              <button className="btn btn--ghost" onClick={() => send({ t: 'auto', on: !me.auto })}>
                {me.auto ? '取消托管' : '托管'}
              </button>
              <button className="btn btn--ghost" onClick={doHint} disabled={!isMyTurn}>
                提示
              </button>
              <button className="btn btn--ghost" onClick={doPass} disabled={!isMyTurn || !prev}>
                不出
              </button>
              <button className={`btn btn--primary ${canPlayNow && isMyTurn ? 'is-ready' : ''}`} onClick={doPlay} disabled={!isMyTurn || !selected.length}>
                出牌
              </button>
            </div>
          )}

          {(state.phase === 'waiting' || state.phase === 'settled') && (
            <div className="actions__wait">
              <button className="btn btn--ghost" onClick={() => setChatOpen((v) => !v)}>
                <Icon name="chat" size={16} />
                快捷语
              </button>
              <button className="btn btn--primary" onClick={() => send({ t: 'ready', ready: !me.ready })}>
                {me.ready ? '取消准备' : '准备'}
              </button>
              {state.hostSeat === seat && (
                <button className="btn btn--gold" onClick={() => send({ t: 'start' })}>开始游戏</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 我的快捷语 */}
      {chatOpen && (
        <div className="chat-pop">
          {QUICK_CHATS.map((t) => (
            <button key={t} onClick={() => say(t)}>{t}</button>
          ))}
        </div>
      )}

      {chats.filter((c) => c.seat === seat).map((c) => (
        <div key={c.id} className="bubble bubble--me">{c.text}</div>
      ))}

      {flash && <div className="flash-bomb">{flash}</div>}
      {toast && <div className="toast">{toast}</div>}

      {/* 结算 */}
      {resultOpen && state.result && (
        <div className="result">
          <div className={`result__panel ${myResult >= 0 ? 'is-win' : 'is-lose'}`}>
            <div className="result__glow" />
            <h2>{myResult > 0 ? '胜利' : myResult < 0 ? '失败' : '平局'}</h2>
            <p className="result__sub">
              {state.result.winnerRole === 'landlord' ? '地主' : '农民'}获胜 · 倍数 ×{state.result.multiplier}
              {state.result.spring ? ' · 春天' : ''}
            </p>
            <div className="result__score">
              <span>本局</span>
              <b className={myResult >= 0 ? 'up' : 'down'}>{myResult > 0 ? `+${myResult}` : myResult}</b>
            </div>
            <div className="result__table">
              {state.result.deltas.map((d, i) => (
                <div key={i} className="result__row">
                  <span className="result__who">
                    <Avatar id={state.players[i]?.avatar} size={20} />
                    {state.players[i]?.name}
                  </span>
                  <b className={d >= 0 ? 'up' : 'down'}>{d > 0 ? `+${d}` : d}</b>
                </div>
              ))}
            </div>
            <div className="result__btns">
              <button className="btn btn--ghost" onClick={() => { setResultOpen(false); onLeave(); }}>离开</button>
              <button className="btn btn--primary" onClick={() => { setResultOpen(false); send({ t: 'ready', ready: true }); }}>
                再来一局
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

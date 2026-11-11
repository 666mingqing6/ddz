import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../shared/cards';
import type { ClientMessage, GameEvent, ServerMessage, TableView } from '../../shared/types';
import { wsUrl } from '../api';

export interface GameSession {
  state: TableView | null;
  hand: Card[];
  seat: number;
  connected: boolean;
  error: string | null;
  events: GameEvent[];
  eventSeq: number;
  hintCards: string[] | null;
  clockOffset: number;
  send: (msg: ClientMessage) => void;
  clearError: () => void;
}

export function useGame(room: string, avatar: string, onClosed?: (reason: string) => void): GameSession {
  const [state, setState] = useState<TableView | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [seat, setSeat] = useState(-1);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [eventSeq, setEventSeq] = useState(0);
  const [hintCards, setHintCards] = useState<string[] | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  /**
   * 单一 effect 管理连接生命周期。
   * 关键：卸载/换房时置 disposed=true，旧连接的 onclose 不再触发重连，
   * 否则离开房间后会被旧闭包重新连回去（房间永远不空）。
   */
  useEffect(() => {
    if (!room) {
      setState(null);
      setHand([]);
      setSeat(-1);
      setConnected(false);
      return;
    }

    let disposed = false;
    let retry = 0;
    let failures = 0;
    let timer: number | null = null;
    let ping: number | null = null;
    let ws: WebSocket | null = null;

    const open = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(wsUrl(room, avatar));
      } catch {
        timer = window.setTimeout(open, 2000);
        return;
      }
      const socket = ws;
      wsRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        retry = 0;
        failures = 0;
        setConnected(true);
        while (queueRef.current.length) {
          const msg = queueRef.current.shift()!;
          socket.send(JSON.stringify(msg));
        }
      };

      socket.onmessage = (ev) => {
        if (disposed) return;
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'state') {
          setState(msg.state);
          setHand(msg.hand);
          setSeat(msg.seat);
          setClockOffset(msg.state.serverTime - Date.now());
          if (msg.events.length) {
            setEvents(msg.events);
            setEventSeq((n) => n + 1);
          }
        } else if (msg.t === 'error') {
          setError(msg.message);
        } else if (msg.t === 'hint') {
          setHintCards(msg.cards);
        } else if (msg.t === 'closed') {
          disposed = true;
          setConnected(false);
          onClosedRef.current?.(msg.reason);
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnected(false);
        failures += 1;
        // 房间可能已被回收：连续失败到阈值就停止重连，避免无限轮询
        if (failures > 6) {
          disposed = true;
          onClosedRef.current?.('房间已关闭或已过期');
          return;
        }
        retry = Math.min(retry + 1, 6);
        timer = window.setTimeout(open, Math.min(500 * 2 ** retry, 8000));
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      };
    };

    open();
    ping = window.setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping' }));
    }, 25000);

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      if (ping) window.clearInterval(ping);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
      setConnected(false);
    };
  }, [room, avatar]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else queueRef.current.push(msg);
  }, []);

  return useMemo(
    () => ({
      state,
      hand,
      seat,
      connected,
      error,
      events,
      eventSeq,
      hintCards,
      clockOffset,
      send,
      clearError: () => setError(null),
    }),
    [state, hand, seat, connected, error, events, eventSeq, hintCards, clockOffset, send],
  );
}

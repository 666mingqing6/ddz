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
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const queueRef = useRef<ClientMessage[]>([]);
  const timerRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!room) return;
    try {
      const ws = new WebSocket(wsUrl(room, avatar));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
        while (queueRef.current.length) {
          const msg = queueRef.current.shift()!;
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onmessage = (ev) => {
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
          closedRef.current = true;
          onClosed?.(msg.reason);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closedRef.current) return;
        retryRef.current = Math.min(retryRef.current + 1, 6);
        const delay = Math.min(500 * 2 ** retryRef.current, 8000);
        timerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      timerRef.current = window.setTimeout(connect, 2000);
    }
  }, [room, avatar, onClosed]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    const ping = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping' }));
    }, 25000);
    return () => {
      window.clearInterval(ping);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../app/AuthContext";
import { buildCrmWebSocketUrl } from "./crmWebSocketUrl";
import type { CrmRealtimeMessage } from "./crmRealtimeTypes";

type Listener = (msg: CrmRealtimeMessage) => void;

type CrmRealtimeContextValue = {
  /** Подписка на события от сервера (включая собственные мутации — фильтруйте по actor_id при необходимости). */
  subscribe: (fn: Listener) => () => void;
  connected: boolean;
  lastError: string | null;
};

const CrmRealtimeContext = createContext<CrmRealtimeContextValue | null>(null);

const RECONNECT_MS = 4000;

export function CrmRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { state: auth } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    if (!auth.userId) {
      setConnected(false);
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const url = buildCrmWebSocketUrl();
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          setConnected(true);
          setLastError(null);
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as CrmRealtimeMessage;
            if (!msg?.type) return;
            listenersRef.current.forEach((fn) => {
              try {
                fn(msg);
              } catch {
                /* ignore listener errors */
              }
            });
          } catch {
            /* ignore malformed */
          }
        };

        ws.onerror = () => {
          if (!cancelled) setLastError("Ошибка WebSocket");
        };

        ws.onclose = () => {
          if (cancelled) return;
          setConnected(false);
          wsRef.current = null;
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_MS);
        };
      } catch (e: unknown) {
        setLastError(e instanceof Error ? e.message : "WebSocket");
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_MS);
      }
    };

    // В StrictMode (dev) эффект монтируется/размонтируется дважды.
    // Отложенный старт даёт cleanup отменить "пробный" коннект без шума в консоли.
    connectTimerRef.current = setTimeout(connect, 0);

    return () => {
      cancelled = true;
      if (connectTimerRef.current) {
        clearTimeout(connectTimerRef.current);
        connectTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [auth.userId]);

  const value = useMemo<CrmRealtimeContextValue>(
    () => ({ subscribe, connected, lastError }),
    [subscribe, connected, lastError]
  );

  return <CrmRealtimeContext.Provider value={value}>{children}</CrmRealtimeContext.Provider>;
}

export function useCrmRealtime() {
  const ctx = useContext(CrmRealtimeContext);
  if (!ctx) throw new Error("CrmRealtimeProvider is missing");
  return ctx;
}

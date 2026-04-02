import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../app/AuthContext";
import { api } from "../../lib/api";
import { useCrmRealtime } from "../../realtime/CrmRealtimeContext";
import type { DashboardPayload } from "./types";

type UseDashboardDataResult = {
  data: DashboardPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useDashboardData(): UseDashboardDataResult {
  const { state: auth } = useAuth();
  const { subscribe } = useCrmRealtime();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<DashboardPayload>("/reports/dashboard/");
      setData(r.data);
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(typeof detail === "string" ? detail : "Не удалось загрузить дашборд");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe((msg) => {
      const t = msg.type;
      if (
        !t.startsWith("order") &&
        !t.startsWith("client") &&
        !t.startsWith("product") &&
        t !== "stock_movement"
      ) {
        return;
      }
      const aid = msg.payload.actor_id;
      if (typeof aid === "number" && aid === auth.userId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void refresh();
      }, 600);
    });
  }, [subscribe, auth.userId, refresh]);

  return { data, loading, error, refresh };
}

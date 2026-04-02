import {
  Alert,
  Box,
  Card,
  CardContent,
  Skeleton,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../../lib/api";
import type { ReportsUrlState } from "../reportsUrlParams";

type FinRow = {
  order_number: string;
  received_date: string;
  status: string | null;
  master: string | null;
  revenue: string | null;
  cost: string | null;
  profit: string | null;
};

function parseMoney(s: string | null | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

type Props = { applied: ReportsUrlState };

export function FinanceReportTab({ applied }: Props) {
  const [rows, setRows] = useState<FinRow[]>([]);
  const [totals, setTotals] = useState<{ revenue: string; cost: string; profit: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ results: FinRow[]; totals: { revenue: string; cost: string; profit: string } }>(
        "/reports/finance/",
        {
          params: { from: applied.from, to: applied.to },
        }
      );
      setRows(r.data.results ?? []);
      setTotals(r.data.totals ?? null);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Не удалось загрузить финансовый отчёт");
      setRows([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const rev = totals?.revenue ? parseMoney(totals.revenue) : 0;
    const cost = totals?.cost ? parseMoney(totals.cost) : 0;
    const profit = totals?.profit ? parseMoney(totals.profit) : 0;
    const margin = rev > 0 ? Math.round((profit / rev) * 1000) / 10 : 0;
    return { rev, cost, profit, margin };
  }, [totals]);

  const lineData = useMemo(() => {
    const map = new Map<string, { m: string; revenue: number }>();
    for (const r of rows) {
      const d = String(r.received_date).slice(0, 7);
      const prev = map.get(d) ?? { m: d, revenue: 0 };
      prev.revenue += parseMoney(r.revenue);
      map.set(d, prev);
    }
    const keys = [...map.keys()].sort();
    return keys.map((k) => ({ date: k, revenue: map.get(k)!.revenue }));
  }, [rows]);

  const cols = useMemo<GridColDef<FinRow>[]>(
    () => [
      { field: "order_number", headerName: "№", width: 110 },
      { field: "received_date", headerName: "Дата", width: 120 },
      { field: "status", headerName: "Статус", width: 140 },
      { field: "master", headerName: "Мастер", width: 160 },
      { field: "revenue", headerName: "Выручка", width: 100 },
      { field: "cost", headerName: "Себестоимость", width: 120 },
      { field: "profit", headerName: "Прибыль", width: 100 },
    ],
    []
  );

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={88} />)
        ) : (
          <>
            <Kpi title="Доходы" value={`${kpis.rev.toLocaleString("ru-RU")} ₽`} />
            <Kpi title="Расходы (себестоимость)" value={`${kpis.cost.toLocaleString("ru-RU")} ₽`} />
            <Kpi title="Прибыль" value={`${kpis.profit.toLocaleString("ru-RU")} ₽`} />
            <Kpi title="Рентабельность" value={`${kpis.margin} %`} />
          </>
        )}
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Динамика выручки по месяцам
          </Typography>
          {loading ? (
            <Skeleton variant="rounded" height={280} />
          ) : lineData.length === 0 ? (
            <Typography color="text.secondary">Нет данных</Typography>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Выручка" stroke="#2e7d32" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1">Детализация по заказам</Typography>
      <div style={{ height: 400, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.order_number}
          loading={loading}
          disableRowSelectionOnClick
          density="compact"
        />
      </div>
    </Box>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h6">{value}</Typography>
      </CardContent>
    </Card>
  );
}

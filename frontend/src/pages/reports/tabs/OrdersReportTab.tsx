import {
  Alert,
  Box,
  Card,
  CardContent,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { mpBrand } from "../../../app/theme";
import { api } from "../../../lib/api";
import { PIE_COLORS } from "../../dashboard/chartUtils";
import type { ReportsUrlState } from "../reportsUrlParams";
import { roleShowsFinance } from "../reportsRoles";
import type { Role } from "../../../lib/auth";

type Row = {
  order_number: string;
  received_date: string;
  client: string;
  phone: string;
  device: string;
  status: string | null;
  status_code: string | null;
  issue_description?: string;
  master: string | null;
  preliminary_cost: string | null;
  final_cost: string | null;
};

function parseMoney(s: string | null | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

type Props = {
  applied: ReportsUrlState;
  role: Role | null;
};

export function OrdersReportTab({ applied, role }: Props) {
  const showFinance = roleShowsFinance(role);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ results: Row[] }>("/reports/orders/", {
        params: {
          from: applied.from,
          to: applied.to,
          ...(applied.status ? { status: applied.status } : {}),
          ...(applied.master ? { master: applied.master } : {}),
        },
      });
      let list = (r.data.results ?? []) as Row[];
      if (applied.device_type.trim()) {
        const d = applied.device_type.trim().toLowerCase();
        list = list.filter((x) => x.device.toLowerCase().includes(d));
      }
      setRows(list);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Не удалось загрузить отчёт");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((r) => r.status_code === "completed").length;
    const inWork = rows.filter((r) => r.status_code && r.status_code !== "completed").length;
    let revenue = 0;
    let checks = 0;
    let checksN = 0;
    for (const r of rows) {
      const v = parseMoney(r.final_cost);
      if (v > 0) {
        revenue += v;
        checks += v;
        checksN += 1;
      }
    }
    const avgCheck = checksN ? checks / checksN : 0;
    return { total, completed, inWork, revenue, avgCheck };
  }, [rows]);

  const lineData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = String(r.received_date).slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    const keys = [...map.keys()].sort();
    return keys.map((k) => ({ date: k.slice(5), orders: map.get(k) ?? 0 }));
  }, [rows]);

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const name = r.status ?? "—";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [rows]);

  const masterRows = useMemo(() => {
    const m = new Map<string, { name: string; orders: number; completed: number; revenue: number }>();
    for (const r of rows) {
      const name = r.master || "—";
      if (!m.has(name)) m.set(name, { name, orders: 0, completed: 0, revenue: 0 });
      const row = m.get(name)!;
      row.orders += 1;
      if (r.status_code === "completed") {
        row.completed += 1;
        row.revenue += parseMoney(r.final_cost);
      }
    }
    return [...m.values()].sort((a, b) => b.orders - a.orders);
  }, [rows]);

  const gridCols = useMemo<GridColDef<Row>[]>(() => {
    const base: GridColDef<Row>[] = [
      { field: "order_number", headerName: "№", width: 110 },
      { field: "received_date", headerName: "Дата", width: 120 },
      { field: "client", headerName: "Клиент", flex: 1, minWidth: 140 },
      { field: "device", headerName: "Устройство", width: 120 },
      { field: "status", headerName: "Статус", width: 140 },
    ];
    if (showFinance) {
      base.push(
        {
          field: "preliminary_cost",
          headerName: "Предв.",
          width: 100,
          valueGetter: (_v, r) => r.preliminary_cost ?? "—",
        },
        { field: "final_cost", headerName: "Итог", width: 100, valueGetter: (_v, r) => r.final_cost ?? "—" }
      );
    }
    base.push({ field: "master", headerName: "Мастер", width: 140 });
    return base;
  }, [showFinance]);

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box className="report-print-root" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
          gap: 1.5,
        }}
      >
        {loading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} variant="rounded" height={88} />)
        ) : (
          <>
            <KpiCard title="Количество заказов" value={fmt(kpis.total)} />
            <KpiCard title="Завершено" value={fmt(kpis.completed)} />
            <KpiCard title="В работе" value={fmt(kpis.inWork)} />
            {showFinance ? (
              <>
                <KpiCard title="Выручка" value={`${fmt(kpis.revenue)} ₽`} />
                <KpiCard title="Средний чек" value={`${fmt(kpis.avgCheck)} ₽`} />
              </>
            ) : (
              <>
                <KpiCard title="Выручка" value="—" subtitle="Доступно администратору" />
                <KpiCard title="Средний чек" value="—" subtitle="Доступно администратору" />
              </>
            )}
          </>
        )}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Динамика заказов по дням
            </Typography>
            {loading ? (
              <Skeleton variant="rounded" height={260} />
            ) : lineData.length === 0 ? (
              <Typography color="text.secondary">Нет данных</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="orders" name="Заказов" stroke={mpBrand.blue.main} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Распределение по статусам
            </Typography>
            {loading ? (
              <Skeleton variant="rounded" height={260} />
            ) : pieData.length === 0 ? (
              <Typography color="text.secondary">Нет данных</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Эффективность мастеров
          </Typography>
          {loading ? (
            <Skeleton variant="rounded" height={200} />
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Мастер</TableCell>
                  <TableCell align="right">Заказов</TableCell>
                  <TableCell align="right">Завершено</TableCell>
                  {showFinance ? <TableCell align="right">Выручка</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {masterRows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right">{r.orders}</TableCell>
                    <TableCell align="right">{r.completed}</TableCell>
                    {showFinance ? <TableCell align="right">{fmt(r.revenue)} ₽</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1">Детализация заказов</Typography>
      <div style={{ height: 420, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={gridCols}
          getRowId={(r) => `${r.order_number}-${r.received_date}`}
          loading={loading}
          disableRowSelectionOnClick
          density="compact"
        />
      </div>
    </Box>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5,
        "&:last-child": { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h6">{value}</Typography>
        {subtitle ? (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

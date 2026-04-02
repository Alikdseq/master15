import { Alert, Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../../../lib/api";
import { PIE_COLORS } from "../../dashboard/chartUtils";
import type { ReportsUrlState } from "../reportsUrlParams";
import type { Role } from "../../../lib/auth";

type ClientApi = {
  id: number;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  orders_count?: number;
  created_at?: string;
};

type Props = { applied: ReportsUrlState; role: Role | null };

function maskPhone(p: string, show: boolean) {
  if (show) return p;
  const d = p.replace(/\D/g, "");
  if (d.length < 4) return "••••";
  return `••• ${d.slice(-4)}`;
}

export function ClientsReportTab({ applied, role }: Props) {
  const showPhone = role === "admin";
  const [rows, setRows] = useState<ClientApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tags = applied.client_tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const params: Record<string, unknown> = {
        created_from: applied.from,
        created_to: applied.to,
        page_size: 500,
      };
      if (tags.length) params.tag = tags;
      const r = await api.get("/clients/", { params });
      setRows((r.data.results ?? []) as ClientApi[]);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Не удалось загрузить клиентов");
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
    const from = new Date(applied.from);
    const to = new Date(applied.to);
    to.setHours(23, 59, 59, 999);
    let newInPeriod = 0;
    let active = 0;
    for (const c of rows) {
      if (c.created_at) {
        const cd = new Date(c.created_at);
        if (cd >= from && cd <= to) newInPeriod += 1;
      }
      if ((c.orders_count ?? 0) > 0) active += 1;
    }
    return { total, newInPeriod, active, returning: Math.max(0, active - newInPeriod) };
  }, [rows, applied.from, applied.to]);

  const tagPie = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const c of rows) {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      if (tags.length === 0) cnt.set("Без тега", (cnt.get("Без тега") ?? 0) + 1);
      else for (const t of tags) cnt.set(t, (cnt.get(t) ?? 0) + 1);
    }
    return [...cnt.entries()].map(([name, value]) => ({ name, value }));
  }, [rows]);

  const topByOrders = useMemo(() => {
    return [...rows].sort((a, b) => (b.orders_count ?? 0) - (a.orders_count ?? 0)).slice(0, 10);
  }, [rows]);

  const cols = useMemo<GridColDef<ClientApi>[]>(
    () => [
      { field: "name", headerName: "Клиент", flex: 1, minWidth: 160 },
      {
        field: "phone",
        headerName: "Телефон",
        width: 140,
        valueGetter: (_v, r) => maskPhone(r.phone, showPhone),
      },
      { field: "orders_count", headerName: "Заказов", width: 100, type: "number" },
    ],
    [showPhone]
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
          [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={80} />)
        ) : (
          <>
            <Kpi title="В базе (по фильтру)" value={String(kpis.total)} />
            <Kpi title="Новые за период" value={String(kpis.newInPeriod)} />
            <Kpi title="С заказами" value={String(kpis.active)} />
            <Kpi title="Повторные (оценка)" value={String(kpis.returning)} />
          </>
        )}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Теги
            </Typography>
            {loading ? (
              <Skeleton height={220} />
            ) : tagPie.length === 0 ? (
              <Typography color="text.secondary">Нет данных</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={tagPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {tagPie.map((_, i) => (
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

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Топ-10 по числу заказов
            </Typography>
            {loading ? (
              <Skeleton height={220} />
            ) : (
              <TableMini rows={topByOrders} showPhone={showPhone} />
            )}
          </CardContent>
        </Card>
      </Box>

      <Typography variant="subtitle1">Список клиентов</Typography>
      <div style={{ height: 380, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.id}
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

function TableMini({ rows, showPhone }: { rows: ClientApi[]; showPhone: boolean }) {
  return (
    <Box component="table" sx={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td style={{ padding: "4px 0" }}>{c.name}</td>
            <td style={{ padding: "4px 0", textAlign: "right", color: "text.secondary" }}>
              {maskPhone(c.phone, showPhone)}
            </td>
            <td style={{ padding: "4px 0", textAlign: "right" }}>{c.orders_count ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

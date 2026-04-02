import { Alert, Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { mpBrand } from "../../../app/theme";
import { api } from "../../../lib/api";
import type { ReportsUrlState } from "../reportsUrlParams";

type OrderRow = {
  id: number;
  issue_description: string;
  device_type: string;
};

type Props = { applied: ReportsUrlState };

export function ServicesReportTab({ applied }: Props) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/orders/", {
        params: {
          received_date_from: applied.from,
          received_date_to: applied.to,
          page_size: 500,
        },
      });
      setOrders((r.data.results ?? []) as OrderRow[]);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Не удалось загрузить заказы");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  const byIssue = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      const key = (o.issue_description || "—").trim().slice(0, 120) || "—";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    const arr = [...m.entries()].map(([name, count]) => ({ name, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, 15);
  }, [orders]);

  const barData = useMemo(() => byIssue.slice(0, 10).map((x) => ({ name: x.name.slice(0, 24), count: x.count })), [byIssue]);

  const total = orders.length || 1;

  const tableRows = useMemo(
    () =>
      byIssue.map((x, i) => ({
        id: i,
        service: x.name,
        count: x.count,
        share: `${Math.round((x.count / total) * 1000) / 10}%`,
      })),
    [byIssue, total]
  );

  const cols = useMemo<GridColDef<(typeof tableRows)[0]>[]>(
    () => [
      { field: "service", headerName: "Неисправность / описание", flex: 1, minWidth: 220 },
      { field: "count", headerName: "Заказов", width: 100, type: "number" },
      { field: "share", headerName: "Доля", width: 90 },
    ],
    []
  );

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Популярные неисправности (топ-10)
          </Typography>
          {loading ? (
            <Skeleton variant="rounded" height={300} />
          ) : barData.length === 0 ? (
            <Typography color="text.secondary">Нет данных за период</Typography>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Заказов" fill={mpBrand.blue.main} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1">Детализация</Typography>
      <div style={{ height: 400, width: "100%" }}>
        <DataGrid
          rows={tableRows}
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

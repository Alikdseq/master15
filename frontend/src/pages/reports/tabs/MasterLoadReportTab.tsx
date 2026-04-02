import { Alert, Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
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
import { mpBrand } from "../../../app/theme";
import { api } from "../../../lib/api";
import type { DashboardPayload } from "../../dashboard/types";
import type { Role } from "../../../lib/auth";

type Props = { role: Role | null };

export function MasterLoadReportTab({ role }: Props) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<DashboardPayload>("/reports/dashboard/");
      setData(r.data);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Не удалось загрузить данные");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activity = data?.activity ?? [];
  const line = data?.charts?.orders_line;

  const masterScope = role === "master";
  const loadBlock = data?.master_load;

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {masterScope && loadBlock ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
          <Kpi title="Активных заказов" value={String(loadBlock.active ?? "—")} />
          <Kpi title="Ожидание запчастей" value={String(loadBlock.waiting_parts ?? "—")} />
          <Kpi title="Ср. дней ремонта" value={String(loadBlock.avg_repair_days ?? "—")} />
        </Box>
      ) : null}

      {!masterScope && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Завершено за неделю (по мастерам)
            </Typography>
            {loading ? (
              <Skeleton height={200} />
            ) : activity.length === 0 ? (
              <Typography color="text.secondary">Нет данных</Typography>
            ) : (
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left">Мастер</th>
                    <th align="right">Завершено</th>
                    <th align="right">Ср. дней</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((a, i) => (
                    <tr key={i}>
                      <td style={{ padding: "6px 0" }}>{a.name}</td>
                      <td align="right">{a.completed}</td>
                      <td align="right">{a.avg_days ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Динамика заказов (14 дней)
          </Typography>
          {loading ? (
            <Skeleton variant="rounded" height={260} />
          ) : line && line.labels?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={line.labels.map((lb, i) => ({ lb, v: line.values[i] ?? 0 }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="lb" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="v" name="Заказов" stroke={mpBrand.blue.main} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Typography color="text.secondary">Нет данных</Typography>
          )}
        </CardContent>
      </Card>
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

import { Box, Card, CardContent, Skeleton, Typography } from "@mui/material";
import { memo } from "react";
import type { DashboardPayload, UserRole } from "./types";
import { isAdminStats, isManagerStats, isMasterStats } from "./types";

type Props = {
  role: UserRole;
  stats: DashboardPayload["stats"] | undefined;
  loading: boolean;
};

type KpiItem = { title: string; value: string; subtitle?: string; warning?: boolean };

function buildItems(role: UserRole, stats: DashboardPayload["stats"] | undefined): KpiItem[] {
  if (!stats) return [];
  if (role === "admin" && isAdminStats(stats, role)) {
    return [
      { title: "Заказов сегодня", value: String(stats.orders_today) },
      { title: "Заказов за неделю", value: String(stats.orders_week) },
      { title: "Заказов за месяц", value: String(stats.orders_month) },
      { title: "Выручка за месяц", value: stats.revenue_month ? `${stats.revenue_month} ₽` : "—" },
      {
        title: "Среднее время выполнения",
        value: stats.avg_completion_hours != null ? `${stats.avg_completion_hours} ч` : "—",
        subtitle: "завершённые за 30 дней",
      },
      {
        title: "Товаров ниже минимума",
        value: String(stats.low_stock_count),
        subtitle: "требуют заказа",
        warning: stats.low_stock_count > 0,
      },
    ];
  }
  if (role === "manager" && isManagerStats(stats, role)) {
    return [
      { title: "Новые заказы сегодня", value: String(stats.orders_today) },
      { title: "Ожидают согласования", value: String(stats.pending_negotiation) },
      { title: "Готовы к выдаче", value: String(stats.ready_pickup) },
      {
        title: "Товаров ниже порога",
        value: String(stats.low_stock_count),
        warning: stats.low_stock_count > 0,
      },
    ];
  }
  if (role === "master" && isMasterStats(stats, role)) {
    return [
      { title: "В ремонте сейчас", value: String(stats.in_repair) },
      { title: "Ожидание запчастей", value: String(stats.waiting_parts) },
      { title: "Завершено за неделю", value: String(stats.completed_week) },
      {
        title: "Среднее время ремонта",
        value: stats.avg_repair_days != null ? `${stats.avg_repair_days} дн.` : "—",
        subtitle: "за 30 дней",
      },
      { title: "Активных заказов", value: String(stats.active_orders) },
    ];
  }
  return [];
}

export const KpiCards = memo(function KpiCards({ role, stats, loading }: Props) {
  const items = buildItems(role, stats);

  const gridCols = { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" };

  if (loading) {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: 2,
          mb: 3,
        }}
      >
        {Array.from({ length: role === "manager" ? 4 : role === "master" ? 5 : 6 }).map((_, i) => (
          <Card key={i} variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Skeleton width="60%" />
              <Skeleton sx={{ mt: 1 }} height={40} />
              <Skeleton width="40%" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  if (!items.length) return null;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: gridCols, gap: 2, mb: 3 }}>
      {items.map((k) => (
        <Box key={k.title}>
          <Card
            variant="outlined"
            sx={{
              borderRadius: 3,
              height: "100%",
              borderColor: k.warning ? "warning.light" : "divider",
            }}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
                {k.title}
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  mt: 1,
                  fontWeight: 800,
                  color: k.warning ? "warning.dark" : "text.primary",
                  lineHeight: 1.2,
                }}
              >
                {k.value}
              </Typography>
              {k.subtitle ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  {k.subtitle}
                </Typography>
              ) : (
                <Box sx={{ minHeight: 20 }} />
              )}
            </CardContent>
          </Card>
        </Box>
      ))}
    </Box>
  );
});

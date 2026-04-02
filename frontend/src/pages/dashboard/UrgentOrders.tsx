import { Box, Button, Card, CardContent, Chip, Skeleton, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SpeedIcon from "@mui/icons-material/Speed";
import { memo } from "react";
import { Link as RouterLink } from "react-router-dom";
import type { OrderCard, UserRole } from "./types";

type Props = {
  role: UserRole;
  urgentOrders: OrderCard[] | undefined;
  negotiationOrders: OrderCard[] | null | undefined;
  readyOrders: OrderCard[] | null | undefined;
  masterLoad: { active: number; waiting_parts: number; avg_repair_days: number | null } | null | undefined;
  loading: boolean;
};

function OrderUrgentRow({ o }: { o: OrderCard }) {
  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        borderRadius: 2,
        bgcolor: "warning.50",
        borderLeft: "4px solid",
        borderLeftColor: "warning.main",
      }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box component={RouterLink} to={`/orders/${o.id}`} sx={{ textDecoration: "none", color: "inherit" }}>
            <Typography variant="body2" fontWeight={700}>
              {o.order_number} · {o.client_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {o.device_type} · {o.status_name} · {o.days_in_status} дн. в статусе
            </Typography>
          </Box>
          <Chip size="small" label={`${o.status_name ?? ""} ${o.days_in_status} дн.`} />
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
          <Button component={RouterLink} to={`/orders/${o.id}`} size="small" variant="outlined">
            Открыть заказ
          </Button>
          {o.client_phone ? (
            <Button component="a" href={`tel:${o.client_phone}`} size="small" variant="outlined">
              Связаться
            </Button>
          ) : null}
        </Box>
      </CardContent>
    </Card>
  );
}

export const UrgentOrders = memo(function UrgentOrders({
  role,
  urgentOrders,
  negotiationOrders,
  readyOrders,
  masterLoad,
  loading,
}: Props) {
  if (role === "master") {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <SpeedIcon color="primary" fontSize="small" />
            Моя загрузка
          </Typography>
          {loading ? (
            <Skeleton height={120} />
          ) : (
            <>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2">Активных заказов</Typography>
                  <Chip label={masterLoad?.active ?? 0} size="small" />
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2">Ожидают запчасти</Typography>
                  <Chip label={masterLoad?.waiting_parts ?? 0} size="small" color="warning" variant="outlined" />
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2">Среднее время ремонта</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {masterLoad?.avg_repair_days != null ? `${masterLoad.avg_repair_days} дн.` : "—"}
                  </Typography>
                </Box>
              </Box>
              <Button component={RouterLink} to="/orders?master=me" sx={{ mt: 2 }} variant="outlined" size="small" fullWidth>
                Перейти к моим заказам
              </Button>
              {urgentOrders?.length ? (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" color="warning.dark" sx={{ mb: 1 }}>
                    Долго в статусе (внимание)
                  </Typography>
                  {urgentOrders.map((o) => (
                    <OrderUrgentRow key={o.id} o={o} />
                  ))}
                </Box>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (role === "manager") {
    return (
      <Box sx={{ mb: 3 }}>
        <Card variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <NotificationsIcon color="primary" fontSize="small" />
              Согласование (ожидают звонка)
            </Typography>
            {loading ? (
              <Skeleton height={100} />
            ) : !negotiationOrders?.length ? (
              <Typography color="text.secondary">Нет заказов в согласовании</Typography>
            ) : (
              negotiationOrders.map((o) => (
                <Box
                  key={o.id}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    py: 1.5,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-of-type": { borderBottom: "none" },
                  }}
                >
                  <Box component={RouterLink} to={`/orders/${o.id}`} sx={{ textDecoration: "none", color: "inherit" }}>
                    <Typography variant="body2" fontWeight={600}>
                      {o.order_number}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {o.client_name} · {o.device_type}
                    </Typography>
                  </Box>
                  {o.client_phone ? (
                    <Button component="a" href={`tel:${o.client_phone}`} size="small" variant="contained">
                      Позвонить
                    </Button>
                  ) : (
                    <Button component={RouterLink} to={`/orders/${o.id}`} size="small" variant="outlined">
                      Открыть
                    </Button>
                  )}
                </Box>
              ))
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
              Готовы к выдаче
            </Typography>
            {loading ? (
              <Skeleton height={100} />
            ) : !readyOrders?.length ? (
              <Typography color="text.secondary">Нет заказов в статусе «Готов»</Typography>
            ) : (
              readyOrders.map((o) => (
                <Box
                  key={o.id}
                  component={RouterLink}
                  to={`/orders/${o.id}`}
                  sx={{
                    display: "block",
                    py: 1.5,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    textDecoration: "none",
                    color: "inherit",
                    "&:last-of-type": { borderBottom: "none" },
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {o.order_number} · {o.client_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {o.device_type}
                  </Typography>
                </Box>
              ))
            )}
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <WarningAmberIcon color="warning" fontSize="small" />
              Срочные заказы (долго в статусе)
            </Typography>
            {loading ? (
              <Skeleton height={100} />
            ) : !urgentOrders?.length ? (
              <Typography color="text.secondary">Нет заказов, требующих внимания по срокам</Typography>
            ) : (
              urgentOrders.map((o) => <OrderUrgentRow key={o.id} o={o} />)
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  // admin
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberIcon color="warning" fontSize="small" />
          Срочные заказы
        </Typography>
        {loading ? (
          <Skeleton height={160} />
        ) : !urgentOrders?.length ? (
          <Typography color="text.secondary">Нет заказов, требующих внимания по срокам</Typography>
        ) : (
          urgentOrders.map((o) => <OrderUrgentRow key={o.id} o={o} />)
        )}
      </CardContent>
    </Card>
  );
});

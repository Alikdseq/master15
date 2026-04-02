import { Box, Button, Card, CardContent, Chip, Skeleton, Typography } from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { memo } from "react";
import { Link as RouterLink } from "react-router-dom";
import type { LowStockRow, OrderCard, UserRole } from "./types";
import { StatusBadge } from "../../ui/StatusBadge";

type Props = {
  role: UserRole;
  lowStock: LowStockRow[] | null | undefined;
  masterOrders: OrderCard[] | null | undefined;
  loading: boolean;
};

export const LowStockOrMasterOrders = memo(function LowStockOrMasterOrders({
  role,
  lowStock,
  masterOrders,
  loading,
}: Props) {
  if (role === "master") {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AssignmentIcon color="primary" fontSize="small" />
              Мои заказы
            </Typography>
            <Chip size="small" label="в работе" variant="outlined" />
          </Box>
          {loading ? (
            <Skeleton variant="rectangular" height={220} />
          ) : !masterOrders?.length ? (
            <Typography color="text.secondary">Нет назначенных заказов</Typography>
          ) : (
            <>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {masterOrders.map((o) => (
                  <Box
                    key={o.id}
                    component={RouterLink}
                    to={`/orders/${o.id}`}
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 2,
                      py: 1.5,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                      textDecoration: "none",
                      color: "inherit",
                      "&:last-of-type": { borderBottom: "none" },
                    }}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight={700}>
                        {o.order_number}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {o.client_name} · {o.device_type}
                      </Typography>
                    </Box>
                    <StatusBadge label={o.status_name ?? "—"} code={o.status_code} />
                  </Box>
                ))}
              </Box>
              <Button component={RouterLink} to="/orders?master=me" sx={{ mt: 2 }} variant="outlined" size="small" fullWidth>
                Все мои заказы
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Inventory2Icon color="primary" fontSize="small" />
            Товары ниже порога
          </Typography>
          <Typography variant="caption" color="warning.main" fontWeight={600}>
            срочно заказать
          </Typography>
        </Box>
        {loading ? (
          <Skeleton variant="rectangular" height={220} />
        ) : !lowStock?.length ? (
          <Typography color="text.secondary">Нет товаров ниже минимального остатка</Typography>
        ) : (
          <>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {lowStock.map((p) => (
                <Box
                  key={p.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                    py: 1.5,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-of-type": { borderBottom: "none" },
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      арт. {p.sku}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="error" fontWeight={600}>
                    {p.current_stock} / min {p.min_stock}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Button component={RouterLink} to="/inventory" sx={{ mt: 2 }} variant="outlined" size="small" fullWidth>
              Перейти на склад
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
});

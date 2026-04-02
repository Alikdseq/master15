import { Alert, Box, Button, Paper, Snackbar, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import type { ForbiddenRedirectState } from "../app/RequireRole";
import { PageHeader } from "../ui/PageHeader";
import { ChartsSection } from "./dashboard/ChartsSection";
import { KpiCards } from "./dashboard/KpiCards";
import { LowStockOrMasterOrders } from "./dashboard/LowStockOrMasterOrders";
import { QuickActions } from "./dashboard/QuickActions";
import { StaffActivity } from "./dashboard/StaffActivity";
import { TopServices } from "./dashboard/TopServices";
import { UrgentOrders } from "./dashboard/UrgentOrders";
import { useDashboardData } from "./dashboard/useDashboardData";
import type { UserRole } from "./dashboard/types";

export function DashboardPage() {
  const { state: auth } = useAuth();
  const { data, loading, error, refresh } = useDashboardData();
  const location = useLocation();
  const navigate = useNavigate();
  const [forbiddenToast, setForbiddenToast] = useState<string | null>(null);

  useEffect(() => {
    const st = location.state as ForbiddenRedirectState | null;
    if (st?.accessDenied) {
      setForbiddenToast(st.accessDenied);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const role = (data?.role ?? auth.role) as UserRole | null;
  if (!role) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="warning">Не удалось определить роль пользователя</Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>
      <Snackbar
        open={Boolean(forbiddenToast)}
        autoHideDuration={6000}
        onClose={() => setForbiddenToast(null)}
        message={forbiddenToast ?? ""}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
      <PageHeader
        title="Мастер Принт · Дашборд"
        subtitle="Контроль заказов, склада и загрузки мастеров"
        rightSlot={
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => void refresh()}
            disabled={loading}
            variant="outlined"
            aria-label="Обновить данные дашборда"
          >
            Обновить
          </Button>
        }
      />

      {error ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void refresh()}>
              Повторить
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      <KpiCards role={role} stats={data?.stats} loading={loading} />

      <ChartsSection charts={data?.charts} loading={loading} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
          gap: 2,
          mb: 2,
        }}
      >
        <TopServices items={data?.top_services} loading={loading} />
        <LowStockOrMasterOrders
          role={role}
          lowStock={data?.low_stock}
          masterOrders={data?.master_orders}
          loading={loading}
        />
      </Box>

      <UrgentOrders
        role={role}
        urgentOrders={data?.urgent_orders}
        negotiationOrders={data?.negotiation_orders}
        readyOrders={data?.ready_orders}
        masterLoad={data?.master_load}
        loading={loading}
      />

      {role === "admin" ? <StaffActivity items={data?.activity} loading={loading} /> : null}

      <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 0.5 }}>
        Быстрые действия
      </Typography>
      <QuickActions role={role} />

      {data?.updated_at ? (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, textAlign: "center" }}>
          Данные обновлены: {new Date(data.updated_at).toLocaleString("ru-RU")}
        </Typography>
      ) : null}
    </Paper>
  );
}

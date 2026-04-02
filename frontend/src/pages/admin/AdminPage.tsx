import {
  Alert,
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { AlertColor } from "@mui/material/Alert";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../ui/PageHeader";
import { ADMIN_TAB_IDS, parseAdminTab, type AdminTabId } from "./adminTabs";
import { BackupTab } from "./tabs/BackupTab";
import { LogsTab } from "./tabs/LogsTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { StatusesTab } from "./tabs/StatusesTab";
import { StockTab } from "./tabs/StockTab";
import { TemplatesTab } from "./tabs/TemplatesTab";
import type { NotifyFn } from "./tabs/UsersTab";
import { UsersTab } from "./tabs/UsersTab";

const TAB_LABELS: Record<AdminTabId, string> = {
  users: "Пользователи",
  settings: "Настройки системы",
  templates: "Шаблоны уведомлений",
  statuses: "Статусы заказов",
  stock: "Пороги и склад",
  backup: "Резервное копирование",
  logs: "Логирование",
};

export function AdminPage() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAdminTab(searchParams.get("tab"));

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: AlertColor }>({
    open: false,
    message: "",
    severity: "info",
  });

  const onNotify: NotifyFn = useCallback((message, severity = "info") => {
    setSnack({ open: true, message, severity });
  }, []);

  const tabParam = searchParams.get("tab");
  useEffect(() => {
    if (!tabParam) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", "users");
          return next;
        },
        { replace: true }
      );
    }
  }, [setSearchParams, tabParam]);

  const setTab = useCallback(
    (id: AdminTabId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", id);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const tabContent = useMemo(() => {
    switch (tab) {
      case "users":
        return <UsersTab onNotify={onNotify} />;
      case "settings":
        return <SettingsTab onNotify={onNotify} />;
      case "templates":
        return <TemplatesTab onNotify={onNotify} />;
      case "statuses":
        return <StatusesTab onNotify={onNotify} />;
      case "stock":
        return <StockTab onNotify={onNotify} />;
      case "backup":
        return <BackupTab onNotify={onNotify} />;
      case "logs":
        return <LogsTab onNotify={onNotify} />;
      default:
        return null;
    }
  }, [onNotify, tab]);

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

      <PageHeader
        title="Администрирование"
        subtitle="Системные настройки, пользователи, склад и журнал действий"
        rightSlot={<Chip size="small" color="warning" label="Только для администратора" variant="outlined" />}
      />

      {narrow ? (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="admin-tab-select-label">Раздел</InputLabel>
          <Select
            labelId="admin-tab-select-label"
            label="Раздел"
            value={tab}
            onChange={(e) => setTab(e.target.value as AdminTabId)}
          >
            {ADMIN_TAB_IDS.map((id) => (
              <MenuItem key={id} value={id}>
                {TAB_LABELS[id]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : (
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as AdminTabId)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {ADMIN_TAB_IDS.map((id) => (
            <Tab key={id} value={id} label={TAB_LABELS[id]} />
          ))}
        </Tabs>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Прямая ссылка на раздел:{" "}
        <Box component="span" sx={{ fontFamily: "monospace" }}>
          /admin?tab={tab}
        </Box>
      </Typography>

      <Box sx={{ minHeight: 320 }}>{tabContent}</Box>
    </Paper>
  );
}

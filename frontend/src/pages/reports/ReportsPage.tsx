import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PrintIcon from "@mui/icons-material/Print";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { api } from "../../lib/api";
import { PageHeader } from "../../ui/PageHeader";
import { downloadReportXlsx } from "./reportExport";
import {
  computePeriodFromPreset,
  monthBounds,
  parseReportsUrlParams,
  toReportsSearchParams,
  type ReportsUrlState,
} from "./reportsUrlParams";
import { defaultTabForRole, tabLabel, visibleReportTabs, type ReportsTabKey } from "./reportsRoles";
import { ClientsReportTab } from "./tabs/ClientsReportTab";
import { FinanceReportTab } from "./tabs/FinanceReportTab";
import { MasterLoadReportTab } from "./tabs/MasterLoadReportTab";
import { OrdersReportTab } from "./tabs/OrdersReportTab";
import { ServicesReportTab } from "./tabs/ServicesReportTab";
import { StockReportTab } from "./tabs/StockReportTab";

type MasterOpt = { id: number; name: string };

export function ReportsPage() {
  const { state: auth } = useAuth();
  const role = auth.role;
  const vis = useMemo(() => visibleReportTabs(role), [role]);
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = useMemo(() => parseReportsUrlParams(searchParams, role), [searchParams, role]);

  const [pending, setPending] = useState<ReportsUrlState>(applied);
  const [masters, setMasters] = useState<MasterOpt[]>([]);
  const [snack, setSnack] = useState<string | null>(null);

  useEffect(() => {
    setPending(applied);
  }, [applied]);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await api.get("/orders/masters/");
        if (ok) setMasters((r.data as MasterOpt[]) ?? []);
      } catch {
        if (ok) setMasters([]);
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  const pushState = useCallback(
    (next: ReportsUrlState) => {
      setPending(next);
      setSearchParams(toReportsSearchParams(next), { replace: true });
    },
    [setSearchParams]
  );

  const onTab = (_: unknown, key: ReportsTabKey) => {
    if (!vis.includes(key)) return;
    pushState({ ...pending, tab: key });
  };

  const onPresetChange = (preset: string) => {
    if (preset === "custom") {
      pushState({ ...pending, preset });
      return;
    }
    const range = computePeriodFromPreset(preset);
    pushState({ ...pending, preset, from: range.from, to: range.to });
  };

  const onReset = () => {
    const m = monthBounds();
    const next: ReportsUrlState = {
      tab: defaultTabForRole(role),
      from: m.from,
      to: m.to,
      preset: "month",
      status: "",
      master: "",
      device_type: "",
      stock_sub: "current",
      client_tags: "",
      finance_group: "month",
    };
    pushState(next);
  };

  const onApply = () => {
    pushState(pending);
  };

  const handleExport = async () => {
    const p = applied;
    try {
      switch (p.tab) {
        case "orders":
          await downloadReportXlsx("/reports/orders.xlsx", {
            from: p.from,
            to: p.to,
            status: p.status || undefined,
            master: p.master || undefined,
          });
          setSnack("Файл скачивается");
          break;
        case "finance":
          await downloadReportXlsx("/reports/finance.xlsx", { from: p.from, to: p.to });
          setSnack("Файл скачивается");
          break;
        case "stock":
          if (p.stock_sub === "movements") {
            await downloadReportXlsx("/reports/stock-movements.xlsx", { from: p.from, to: p.to });
            setSnack("Файл скачивается");
          } else {
            setSnack("Для этого подраздела экспорт — через движения или заказы");
          }
          break;
        default:
          setSnack("Экспорт для этой вкладки в разработке (используйте таблицу и печать)");
      }
    } catch {
      setSnack("Не удалось скачать файл");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const stockSubChange = (sub: ReportsUrlState["stock_sub"]) => {
    pushState({ ...applied, stock_sub: sub });
  };

  return (
    <Paper
      className="reports-page"
      sx={{
        p: { xs: 2, md: 3 },
        "@media print": {
          boxShadow: "none",
          "& .no-print": { display: "none !important" },
        },
      }}
    >
      <PageHeader
        title="Отчёты"
        subtitle="Аналитика по заказам, финансам, складу и клиентам"
        rightSlot={
          <Stack direction="row" spacing={1} className="no-print" flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={() => void handleExport()}
              size="small"
            >
              Экспорт
            </Button>
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} size="small">
              Печать
            </Button>
          </Stack>
        }
      />

      <Box className="no-print" sx={{ mb: 2 }}>
        <Tabs value={applied.tab} onChange={onTab} variant="scrollable" scrollButtons="auto">
          {vis.map((k) => (
            <Tab key={k} value={k} label={tabLabel(k)} />
          ))}
        </Tabs>
      </Box>

      <Stack spacing={2} className="no-print">
        <Typography variant="subtitle2" color="text.secondary">
          Параметры
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap" useFlexGap>
          <TextField
            label="С даты"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={pending.from}
            onChange={(e) => setPending((s) => ({ ...s, from: e.target.value, preset: "custom" }))}
          />
          <TextField
            label="По дату"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={pending.to}
            onChange={(e) => setPending((s) => ({ ...s, to: e.target.value, preset: "custom" }))}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Быстрый период</InputLabel>
            <Select
              label="Быстрый период"
              value={pending.preset}
              onChange={(e) => onPresetChange(e.target.value)}
            >
              <MenuItem value="today">Сегодня</MenuItem>
              <MenuItem value="week">Эта неделя</MenuItem>
              <MenuItem value="month">Этот месяц</MenuItem>
              <MenuItem value="quarter">Этот квартал</MenuItem>
              <MenuItem value="custom">Произвольный</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" onClick={onApply}>
            Сформировать
          </Button>
          <Button variant="outlined" onClick={onReset}>
            Сбросить
          </Button>
        </Stack>

        {applied.tab === "orders" ? (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap" useFlexGap>
            <TextField
              label="Код статуса (опционально)"
              size="small"
              value={pending.status}
              onChange={(e) => setPending((s) => ({ ...s, status: e.target.value }))}
              sx={{ minWidth: 200 }}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Мастер</InputLabel>
              <Select
                label="Мастер"
                value={pending.master}
                onChange={(e) => setPending((s) => ({ ...s, master: e.target.value }))}
              >
                <MenuItem value="">Все</MenuItem>
                {masters.map((m) => (
                  <MenuItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Тип устройства (фильтр)"
              size="small"
              value={pending.device_type}
              onChange={(e) => setPending((s) => ({ ...s, device_type: e.target.value }))}
              sx={{ minWidth: 200 }}
            />
          </Stack>
        ) : null}

        {applied.tab === "clients" ? (
          <TextField
            label="Теги (через запятую)"
            size="small"
            value={pending.client_tags}
            onChange={(e) => setPending((s) => ({ ...s, client_tags: e.target.value }))}
            sx={{ maxWidth: 480 }}
          />
        ) : null}
      </Stack>

      <Box sx={{ mt: 3 }}>
        {applied.tab === "orders" ? <OrdersReportTab applied={applied} role={role} /> : null}
        {applied.tab === "finance" ? <FinanceReportTab applied={applied} /> : null}
        {applied.tab === "stock" ? <StockReportTab applied={applied} onSubChange={stockSubChange} /> : null}
        {applied.tab === "clients" ? <ClientsReportTab applied={applied} role={role} /> : null}
        {applied.tab === "services" ? <ServicesReportTab applied={applied} /> : null}
        {applied.tab === "masters" ? <MasterLoadReportTab role={role} /> : null}
      </Box>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack ?? ""} />
    </Paper>
  );
}

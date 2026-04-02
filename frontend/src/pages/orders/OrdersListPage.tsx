import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../../lib/api";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { useAuth } from "../../app/AuthContext";
import { useCrmRealtime } from "../../realtime/CrmRealtimeContext";
import { PageHeader } from "../../ui/PageHeader";
import { StatusBadge } from "../../ui/StatusBadge";
import { CreateOrderDialog } from "./components/CreateOrderDialog";
import { OrderFilters, type OrderFiltersState } from "./components/OrderFilters";
import { InventoryProductAutocomplete, type InventoryProductOption } from "./components/InventoryProductAutocomplete";
import { parseOrdersUrlParams, toOrdersSearchParams, type OrdersListQuery } from "./ordersUrlParams";

type OrderRow = {
  id: number;
  order_number: string;
  received_date: string;
  service_type?: string;
  device_type: string;
  device_model?: string;
  issue_description?: string;
  preliminary_cost?: string | null;
  final_cost?: string | null;
  total_amount?: string | null;
  status?: { name: string; code: string };
  client: number | { id: number; name?: string; phone?: string };
  assigned_master?: number | { id: number; name?: string; email?: string };
};

function issuePreview(text?: string) {
  if (!text) return "—";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

type StatusOptionsPayload = {
  statuses: Array<{ code: string; name: string; is_final?: boolean }>;
  transitions: Array<{ from: string; to: string }>;
};

function statusSelectOptionsForRow(
  row: OrderRow,
  payload: StatusOptionsPayload | null,
  role: "admin" | "manager" | "master" | null
) {
  if (!payload) return [];
  const current = row.status?.code ?? "";
  const statuses = payload.statuses ?? [];
  if (role === "admin") return statuses;
  const allowed = new Set<string>();
  for (const t of payload.transitions ?? []) {
    if (t.from === current) allowed.add(t.to);
  }
  allowed.add(current);
  return statuses.filter((s) => allowed.has(s.code));
}

export function OrdersListPage() {
  const { state: auth } = useAuth();
  const { subscribe } = useCrmRealtime();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<OrdersListQuery>(() => parseOrdersUrlParams(searchParams));
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("create") === "1");
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masters, setMasters] = useState<Array<{ id: number; name: string }>>([]);
  const [snack, setSnack] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<StatusOptionsPayload | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [readyTarget, setReadyTarget] = useState<{ id: number; order_number: string } | null>(null);
  const [readyListCost, setReadyListCost] = useState("");
  const [readyListError, setReadyListError] = useState<string | null>(null);
  const [readyMaterialsDraft, setReadyMaterialsDraft] = useState<
    Array<{ product: InventoryProductOption | null; quantity: string }>
  >([]);
  const [readyMaterialsLoading, setReadyMaterialsLoading] = useState(false);

  const beginReadyFromList = useCallback(async (row: OrderRow) => {
    setReadyTarget({ id: row.id, order_number: row.order_number });
    setReadyListCost(
      row.preliminary_cost != null && row.preliminary_cost !== "" ? String(row.preliminary_cost) : ""
    );
    setReadyListError(null);
    setReadyMaterialsLoading(true);
    setReadyMaterialsDraft([{ product: null, quantity: "" }]);
    try {
      const r = await api.get(`/orders/${row.id}/used-products/`);
      const results = (r.data?.results ?? []) as Array<{
        product?: number;
        product_name?: string;
        product_sku?: string;
        quantity?: string;
      }>;
      const mapped = results.map((x) => ({
        product:
          x.product != null
            ? {
                id: x.product,
                name: String(x.product_name ?? ""),
                sku: String(x.product_sku ?? ""),
              }
            : null,
        quantity: String(x.quantity ?? ""),
      }));
      setReadyMaterialsDraft(mapped.length ? mapped : [{ product: null, quantity: "" }]);
    } catch {
      setReadyMaterialsDraft([{ product: null, quantity: "" }]);
      setSnack("Не удалось загрузить материалы — укажите вручную или оставьте пустым.");
    } finally {
      setReadyMaterialsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await api.get("/orders/status-options/");
        if (!active) return;
        setStatusOptions(r.data as StatusOptionsPayload);
      } catch {
        setStatusOptions(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setFilters(parseOrdersUrlParams(searchParams));
    setCreateOpen(searchParams.get("create") === "1");
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const paginationModel: GridPaginationModel = useMemo(
    () => ({ page: filters.page - 1, pageSize: filters.pageSize }),
    [filters.page, filters.pageSize]
  );

  const pushFilters = useCallback(
    (next: OrdersListQuery, opts?: { keepCreate?: boolean }) => {
      setFilters(next);
      setSearchParams(
        toOrdersSearchParams(next, { create: opts?.keepCreate ?? createOpen }),
        { replace: true }
      );
    },
    [createOpen, setSearchParams]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (auth.role !== "admin" && auth.role !== "manager") return;
      try {
        const r = await api.get("/orders/masters/");
        if (!active) return;
        const arr = r.data as Array<{ id: number; name: string }>;
        setMasters(Array.isArray(arr) ? arr : []);
      } catch {
        setMasters([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [auth.role]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string | number> = {
      page: filters.page,
      page_size: filters.pageSize,
    };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (filters.status !== "all") params.status = filters.status;
    if (filters.master !== "all") {
      const mid = filters.master === "me" ? auth.userId : Number(filters.master);
      if (typeof mid === "number" && Number.isFinite(mid)) params.master = String(mid);
    }
    if (filters.receivedDateFrom) params.received_date_from = filters.receivedDateFrom;
    if (filters.receivedDateTo) params.received_date_to = filters.receivedDateTo;
    if (filters.serviceType !== "all") params.service_type = filters.serviceType;

    try {
      const r = await api.get("/orders/", { params });
      setRows(r.data.results ?? []);
      setTotal(typeof r.data.count === "number" ? r.data.count : 0);
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(typeof detail === "string" ? detail : "Не удалось загрузить список заказов");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.pageSize,
    debouncedSearch,
    filters.status,
    filters.master,
    filters.receivedDateFrom,
    filters.receivedDateTo,
    filters.serviceType,
    auth.userId,
  ]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const wsThrottleRef = useRef<number | null>(null);
  useEffect(() => {
    return subscribe((msg) => {
      if (!msg.type.startsWith("order")) return;
      const aid = msg.payload.actor_id;
      if (typeof aid === "number" && aid === auth.userId) return;
      if (wsThrottleRef.current) window.clearTimeout(wsThrottleRef.current);
      wsThrottleRef.current = window.setTimeout(() => {
        wsThrottleRef.current = null;
        void loadOrders();
      }, 400);
    });
  }, [subscribe, auth.userId, loadOrders]);

  const filterBlock: OrderFiltersState = {
    search: filters.search,
    status: filters.status,
    master: filters.master,
    serviceType: filters.serviceType,
    receivedDateFrom: filters.receivedDateFrom,
    receivedDateTo: filters.receivedDateTo,
  };

  const onFiltersChange = (next: OrderFiltersState) => {
    pushFilters(
      {
        ...filters,
        ...next,
        page: 1,
      },
      { keepCreate: createOpen }
    );
  };

  const onReset = () => {
    pushFilters(
      {
        search: "",
        status: "all",
        master: "all",
        serviceType: "all",
        receivedDateFrom: "",
        receivedDateTo: "",
        page: 1,
        pageSize: filters.pageSize,
        clientId: null,
      },
      { keepCreate: createOpen }
    );
  };

  const changeOrderStatus = useCallback(async (orderId: number, toCode: string) => {
    setStatusBusyId(orderId);
    try {
      const resp = await api.post(`/orders/${orderId}/change-status/`, { to_status: toCode, comment: "" });
      const data = resp.data;
      const next = data?.status;
      setRows((prev) =>
        prev.map((row) =>
          row.id === orderId && next
            ? {
                ...row,
                status: { name: next.name, code: next.code },
                final_cost: data?.final_cost != null ? String(data.final_cost) : row.final_cost,
                total_amount: data?.total_amount != null ? String(data.total_amount) : row.total_amount,
              }
            : row
        )
      );
      setSnack("Статус обновлён");
    } catch (e: unknown) {
      setSnack(formatApiError(e));
    } finally {
      setStatusBusyId(null);
    }
  }, []);

  const confirmReadyFromList = useCallback(async () => {
    if (!readyTarget) return;
    const fc = readyListCost.trim();
    if (!fc) {
      setReadyListError("Укажите итоговую стоимость работ для клиента.");
      return;
    }
    for (const row of readyMaterialsDraft) {
      const hasProduct = Boolean(row.product);
      const hasQty = Boolean(row.quantity?.trim());
      if (hasProduct !== hasQty) {
        setReadyListError(
          "В каждой строке материалов укажите и позицию, и количество, либо удалите неполную строку. Если материалы не использовались — оставьте список пустым."
        );
        return;
      }
    }
    const items = readyMaterialsDraft
      .filter((x) => x.product && x.quantity.trim())
      .map((x) => ({ product: x.product!.id, quantity: x.quantity.trim() }));
    setStatusBusyId(readyTarget.id);
    setReadyListError(null);
    try {
      const resp = await api.post(`/orders/${readyTarget.id}/change-status/`, {
        to_status: "ready",
        comment: "",
        final_work_cost: fc,
        used_products: { items },
      });
      const data = resp.data;
      const next = data?.status;
      setRows((prev) =>
        prev.map((row) =>
          row.id === readyTarget.id && next
            ? {
                ...row,
                status: { name: next.name, code: next.code },
                final_cost: data?.final_cost != null ? String(data.final_cost) : row.final_cost,
                total_amount: data?.total_amount != null ? String(data.total_amount) : row.total_amount,
              }
            : row
        )
      );
      setReadyTarget(null);
      setSnack("Статус обновлён");
    } catch (e: unknown) {
      setReadyListError(formatApiError(e));
    } finally {
      setStatusBusyId(null);
    }
  }, [readyTarget, readyListCost, readyMaterialsDraft]);

  const cols = useMemo<GridColDef<OrderRow>[]>(
    () => [
      {
        field: "order_number",
        headerName: "№ заказа",
        width: 128,
        minWidth: 100,
        sortable: false,
        renderCell: (p) => (
          <Typography component="span" fontWeight={800} sx={{ fontSize: "0.95rem" }}>
            {p.row.order_number}
          </Typography>
        ),
      },
      {
        field: "received_date",
        headerName: "Дата приёма",
        width: 124,
        sortable: false,
      },
      {
        field: "service_type",
        headerName: "Тип услуги",
        width: 110,
        sortable: false,
        valueGetter: (_v, row) => (row.service_type === "print" ? "Печать" : "Ремонт"),
      },
      {
        field: "client",
        headerName: "Клиент",
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: (p) => {
          const c = p.row.client as { name?: string; phone?: string; id?: number };
          const name = typeof c === "object" && c?.name ? c.name : `#${typeof c === "object" ? c?.id : p.row.client}`;
          const phone = typeof c === "object" && c?.phone ? c.phone : "";
          return (
            <Box sx={{ py: 0.5, lineHeight: 1.35 }}>
              <Typography variant="body2" fontWeight={600}>
                {name}
              </Typography>
              {phone ? (
                <Typography variant="caption" color="text.secondary" display="block">
                  {phone}
                </Typography>
              ) : null}
            </Box>
          );
        },
      },
      {
        field: "device",
        headerName: "Устройство",
        flex: 1.1,
        minWidth: 220,
        sortable: false,
        renderCell: (p) => {
          const m = p.row.device_model?.trim();
          const line1 = m ? `${p.row.device_type} ${m}` : p.row.device_type;
          const line2 = issuePreview(p.row.issue_description);
          return (
            <Box sx={{ py: 0.5, lineHeight: 1.35 }}>
              <Typography variant="body2" fontWeight={600}>
                {line1}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {line2}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "status",
        headerName: "Статус",
        width: 168,
        sortable: false,
        renderCell: (p) => <StatusBadge label={p.row.status?.name ?? "—"} code={p.row.status?.code ?? null} />,
      },
      {
        field: "master",
        headerName: "Мастер",
        width: 140,
        sortable: false,
        valueGetter: (_, r) => {
          const m = r.assigned_master;
          if (typeof m === "object" && m?.name) return m.name;
          return "—";
        },
      },
      {
        field: "preliminary_cost",
        headerName: "Предв. сумма",
        width: 110,
        sortable: false,
        valueGetter: (_, r) => (r.preliminary_cost != null && r.preliminary_cost !== "" ? r.preliminary_cost : "—"),
      },
      {
        field: "actions",
        headerName: "Действия",
        width: 260,
        minWidth: 240,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (p) => {
          const row = p.row;
          const code = row.status?.code ?? "";
          const isFinal = Boolean(statusOptions?.statuses?.find((s) => s.code === code)?.is_final);
          const options = statusSelectOptionsForRow(row, statusOptions, auth.role);
          const canChangeStatus = !isFinal && (auth.role === "admin" || options.length > 0);
          const inList = options.some((o) => o.code === code);

          return (
            <Box
              sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5, py: 0.5, width: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              <FormControl size="small" sx={{ minWidth: 138, maxWidth: 170 }}>
                <Select
                  value={code}
                  displayEmpty
                  disabled={!canChangeStatus || statusBusyId === row.id || !statusOptions}
                  renderValue={(v) =>
                    v ? options.find((o) => o.code === v)?.name ?? row.status?.name ?? v : "—"
                  }
                  onChange={(e) => {
                    const v = e.target.value as string;
                    if (!v || v === code) return;
                    if (v === "ready") {
                      void beginReadyFromList(row);
                      return;
                    }
                    void changeOrderStatus(row.id, v);
                  }}
                >
                  {!inList && code ? (
                    <MenuItem value={code}>
                      {row.status?.name ?? code}
                    </MenuItem>
                  ) : null}
                  {options.map((s) => (
                    <MenuItem key={s.code} value={s.code}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Просмотр">
                <IconButton component={RouterLink} to={`/orders/${row.id}`} size="small" color="primary" aria-label="Просмотр">
                  <VisibilityOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Карточка заказа">
                <IconButton component={RouterLink} to={`/orders/${row.id}`} size="small" color="primary" aria-label="Редактировать">
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    [auth.role, statusOptions, statusBusyId, changeOrderStatus, beginReadyFromList]
  );

  const openCreate = () => {
    setCreateOpen(true);
    const p = toOrdersSearchParams(filters, { create: true });
    setSearchParams(p, { replace: true });
  };

  const closeCreate = () => {
    setCreateOpen(false);
    const next = { ...filters, clientId: null };
    setFilters(next);
    setSearchParams(toOrdersSearchParams(next, { create: false }), { replace: true });
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
      <PageHeader
        title="Заказы"
        subtitle="Список заказов, фильтры и карточки"
        rightSlot={
          auth.role === "admin" || auth.role === "manager" ? (
            <Button variant="contained" onClick={openCreate}>
              + Создать заказ
            </Button>
          ) : undefined
        }
      />

      <Divider sx={{ my: 2 }} />

      <OrderFilters
        value={filterBlock}
        onChange={onFiltersChange}
        onReset={onReset}
        masterOptions={masters}
        role={auth.role}
        userId={auth.userId}
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Box sx={{ width: "100%", minHeight: 420 }}>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.id}
          loading={loading}
          rowHeight={92}
          paginationMode="server"
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={(m) => {
            pushFilters(
              {
                ...filters,
                page: m.page + 1,
                pageSize: m.pageSize,
              },
              { keepCreate: createOpen }
            );
          }}
          pageSizeOptions={[20, 25, 50, 100]}
          disableRowSelectionOnClick
          autoHeight={false}
          sx={{
            minHeight: 420,
            border: "none",
            "& .MuiDataGrid-cell": {
              alignItems: "center",
              py: 1.25,
              fontSize: "0.9rem",
            },
            "& .MuiDataGrid-columnHeaders": { fontSize: "0.85rem", fontWeight: 700 },
            "& .MuiDataGrid-row": { minHeight: "92px !important" },
          }}
          slots={{
            noRowsOverlay: () => (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                {loading ? "Загрузка…" : "Нет заказов по выбранным фильтрам. Сбросьте фильтры или создайте заказ."}
              </Box>
            ),
          }}
        />
      </Box>

      <CreateOrderDialog
        open={createOpen}
        initialClientId={filters.clientId}
        onClose={closeCreate}
        onCreated={() => {
          void loadOrders();
          setSnack("Заказ создан");
          closeCreate();
        }}
      />

      <Dialog
        open={!!readyTarget}
        onClose={() => {
          setReadyTarget(null);
          setReadyListError(null);
          setReadyMaterialsDraft([]);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Заказ №{readyTarget?.order_number ?? "—"} — «Готов»</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Укажите итоговую стоимость и перечень материалов. Если материалы не использовались — удалите все строки или оставьте одну пустую.
          </Typography>
          {readyListError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {readyListError}
            </Alert>
          ) : null}
          <TextField
            label="Итоговая стоимость, ₽"
            value={readyListCost}
            onChange={(e) => setReadyListCost(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            disabled={readyMaterialsLoading}
          />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Использованные материалы
          </Typography>
          {readyMaterialsLoading ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Загрузка списка материалов…
            </Typography>
          ) : null}
          <Box sx={{ display: "grid", gap: 1.5, opacity: readyMaterialsLoading ? 0.5 : 1, pointerEvents: readyMaterialsLoading ? "none" : "auto" }}>
            {readyMaterialsDraft.map((mrow, idx) => (
              <Box
                key={idx}
                sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr auto" }, gap: 1.25, alignItems: "center" }}
              >
                <InventoryProductAutocomplete
                  value={mrow.product}
                  onChange={(next) => {
                    setReadyMaterialsDraft((d) => d.map((x, i) => (i === idx ? { ...x, product: next } : x)));
                  }}
                />
                <TextField
                  label="Количество"
                  value={mrow.quantity}
                  onChange={(e) =>
                    setReadyMaterialsDraft((d) => d.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                  }
                />
                <Button variant="outlined" color="error" onClick={() => setReadyMaterialsDraft((d) => d.filter((_, i) => i !== idx))}>
                  Удалить
                </Button>
              </Box>
            ))}
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setReadyMaterialsDraft((d) => [...d, { product: null, quantity: "" }])}
              disabled={readyMaterialsLoading}
            >
              Добавить позицию
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            onClick={() => {
              setReadyTarget(null);
              setReadyListError(null);
              setReadyMaterialsDraft([]);
            }}
          >
            Отмена
          </Button>
          <Button variant="contained" disabled={readyMaterialsLoading} onClick={() => void confirmReadyFromList()}>
            Перевести
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Paper>
  );
}

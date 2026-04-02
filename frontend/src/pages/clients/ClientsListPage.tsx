import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRowId,
  type GridRowSelectionModel,
} from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { useAuth } from "../../app/AuthContext";
import { useCrmRealtime } from "../../realtime/CrmRealtimeContext";
import { PageHeader } from "../../ui/PageHeader";
import { buildClientsApiParams, parseClientsUrlParams, toClientsSearchParams, type ClientsListQuery } from "./clientsUrlParams";
import { ClientFilters } from "./components/ClientFilters";
import { CreateClientDialog } from "./components/CreateClientDialog";
import { TagSelector } from "./components/TagSelector";

type ClientRow = {
  id: number;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  orders_count?: number;
  last_order_at?: string | null;
  created_at?: string;
};

type TagCountRow = { tag: string; count: number };

function newRowSelection(): GridRowSelectionModel {
  return { type: "include", ids: new Set<GridRowId>() };
}

function selectionIds(model: GridRowSelectionModel): number[] {
  return Array.from(model.ids).map(Number);
}

export function ClientsListPage() {
  const { state: auth } = useAuth();
  const { subscribe } = useCrmRealtime();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<ClientsListQuery>(() => parseClientsUrlParams(searchParams));
  const [createOpen, setCreateOpen] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagCounts, setTagCounts] = useState<TagCountRow[]>([]);
  const [snack, setSnack] = useState<string | null>(null);

  const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>(() => newRowSelection());

  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [bulkRemoveTag, setBulkRemoveTag] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [smsType, setSmsType] = useState("bulk_manual");
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setFilters(parseClientsUrlParams(searchParams));
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const pushFilters = useCallback(
    (next: ClientsListQuery) => {
      setFilters(next);
      setSearchParams(toClientsSearchParams(next), { replace: true });
    },
    [setSearchParams]
  );

  const paginationModel: GridPaginationModel = useMemo(
    () => ({ page: filters.page - 1, pageSize: filters.pageSize }),
    [filters.page, filters.pageSize]
  );

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = { ...filters, search: debouncedSearch };
    const params = buildClientsApiParams(q);
    try {
      const r = await api.get("/clients/", { params });
      setRows((r.data.results ?? []) as ClientRow[]);
      setTotal(typeof r.data.count === "number" ? r.data.count : 0);
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(typeof detail === "string" ? detail : "Не удалось загрузить клиентов");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.pageSize,
    debouncedSearch,
    filters.tags.join("|"),
    filters.createdFrom,
    filters.createdTo,
    filters.lastOrderFrom,
    filters.lastOrderTo,
    filters.ordersMin,
    filters.ordersMax,
    filters.activeOrdersOnly,
    filters.deviceType,
  ]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const wsThrottleRef = useRef<number | null>(null);
  useEffect(() => {
    return subscribe((msg) => {
      if (!msg.type.startsWith("client")) return;
      const aid = msg.payload.actor_id;
      if (typeof aid === "number" && aid === auth.userId) return;
      if (wsThrottleRef.current) window.clearTimeout(wsThrottleRef.current);
      wsThrottleRef.current = window.setTimeout(() => {
        wsThrottleRef.current = null;
        void loadClients();
      }, 400);
    });
  }, [subscribe, auth.userId, loadClients]);

  useEffect(() => {
    let active = true;
    (async () => {
      const q = { ...filters, search: debouncedSearch };
      const params = buildClientsApiParams(q);
      params.delete("page");
      params.delete("page_size");
      try {
        const r = await api.get("/clients/tags-count/", { params });
        if (!active) return;
        const list = (r.data?.results ?? []) as TagCountRow[];
        setTagCounts(Array.isArray(list) ? list : []);
      } catch {
        if (active) setTagCounts([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    debouncedSearch,
    filters.tags.join("|"),
    filters.createdFrom,
    filters.createdTo,
    filters.lastOrderFrom,
    filters.lastOrderTo,
    filters.ordersMin,
    filters.ordersMax,
    filters.activeOrdersOnly,
    filters.deviceType,
  ]);

  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of tagCounts) s.add(t.tag);
    for (const t of filters.tags) s.add(t);
    return Array.from(s);
  }, [tagCounts, filters.tags]);

  const cols = useMemo<GridColDef<ClientRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Клиент",
        flex: 1,
        minWidth: 160,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.35 }}>
            {p.row.name}
          </Typography>
        ),
      },
      { field: "phone", headerName: "Телефон", width: 140, maxWidth: 160 },
      {
        field: "email",
        headerName: "Email",
        flex: 0.8,
        minWidth: 140,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ whiteSpace: "normal", wordBreak: "break-all", lineHeight: 1.35 }}>
            {p.row.email || "—"}
          </Typography>
        ),
      },
      {
        field: "created_at",
        headerName: "Первое обращение",
        minWidth: 130,
        valueGetter: (_v, row) => (row.created_at ? String(row.created_at).slice(0, 10) : "—"),
      },
      { field: "orders_count", headerName: "Заказов", width: 100 },
      {
        field: "last_order_at",
        headerName: "Последний заказ",
        minWidth: 130,
        valueGetter: (_v, row) => (row.last_order_at ? String(row.last_order_at).slice(0, 10) : "—"),
      },
      {
        field: "tags",
        headerName: "Теги",
        flex: 1,
        minWidth: 160,
        sortable: false,
        renderCell: (p) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, py: 0.25, alignContent: "flex-start" }}>
            {(p.row.tags ?? []).map((t) => (
              <Chip key={t} size="small" label={t} variant="outlined" sx={{ maxWidth: "100%" }} />
            ))}
            {(p.row.tags?.length ?? 0) === 0 ? (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            ) : null}
          </Box>
        ),
      },
      {
        field: "actions",
        headerName: "",
        width: 120,
        sortable: false,
        renderCell: (p) => (
          <Button size="small" component={RouterLink} to={`/clients/${p.row.id}`}>
            Подробнее
          </Button>
        ),
      },
    ],
    []
  );

  const selectedIds = selectionIds(selectionModel);
  const isAdmin = auth.role === "admin";
  const canCreate = auth.role === "admin" || auth.role === "manager";

  const runBulkAddTags = async () => {
    if (!bulkTags.length || !selectedIds.length) return;
    setBulkBusy(true);
    try {
      await api.post("/clients/bulk/", {
        operation: "add_tags",
        tags: bulkTags,
        client_ids: selectedIds,
      });
      setSnack("Теги добавлены");
      setBulkAddOpen(false);
      setBulkTags([]);
      setSelectionModel(newRowSelection());
      pushFilters({ ...filters, page: 1 });
    } catch {
      setSnack("Не удалось добавить теги");
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkRemoveTags = async () => {
    if (!bulkRemoveTag.trim() || !selectedIds.length) return;
    setBulkBusy(true);
    try {
      await api.post("/clients/bulk/", {
        operation: "remove_tags",
        tags: [bulkRemoveTag.trim()],
        client_ids: selectedIds,
      });
      setSnack("Тег удалён у выбранных клиентов");
      setBulkRemoveOpen(false);
      setBulkRemoveTag("");
      setSelectionModel(newRowSelection());
      pushFilters({ ...filters, page: 1 });
    } catch {
      setSnack("Не удалось удалить тег");
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkSms = async () => {
    if (!smsBody.trim() || !selectedIds.length) return;
    setBulkBusy(true);
    try {
      await api.post("/clients/mass-sms/", {
        notif_type: smsType,
        title: "",
        body: smsBody.trim(),
        client_ids: selectedIds,
      });
      setSnack("SMS поставлены в очередь");
      setBulkSmsOpen(false);
      setSmsBody("");
      setSelectionModel(newRowSelection());
    } catch {
      setSnack("Не удалось отправить SMS");
    } finally {
      setBulkBusy(false);
    }
  };

  const onSegmentBroadcast = (tag: string) => {
    pushFilters({ ...filters, tags: [tag], page: 1 });
    setBulkSmsOpen(true);
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
      <PageHeader
        title="Клиенты"
        subtitle="Список клиентов, сегменты и массовые действия"
        rightSlot={
          canCreate ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Создать клиента
            </Button>
          ) : undefined
        }
      />

      <Box sx={{ display: "flex", flexDirection: { xs: "column", lg: "row" }, gap: 2, alignItems: "stretch" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <TextField
            fullWidth
            label="Быстрый поиск (имя, телефон, email)"
            value={filters.search}
            onChange={(e) => pushFilters({ ...filters, search: e.target.value, page: 1 })}
            sx={{ mb: 2 }}
          />

          <ClientFilters
            value={filters}
            onChange={(next) => setFilters(next)}
            onApply={() => pushFilters(filters)}
            onReset={() =>
              pushFilters({
                search: "",
                page: 1,
                pageSize: 25,
                tags: [],
                createdFrom: "",
                createdTo: "",
                lastOrderFrom: "",
                lastOrderTo: "",
                ordersMin: "",
                ordersMax: "",
                activeOrdersOnly: false,
                deviceType: "",
              })
            }
            tagOptions={tagOptions}
          />

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Box sx={{ width: "100%", minHeight: 420 }}>
            {loading && !rows.length ? (
              <Skeleton variant="rounded" height={420} />
            ) : (
              <DataGrid
                rows={rows}
                columns={cols}
                getRowId={(r) => r.id}
                loading={loading}
                paginationMode="server"
                rowCount={total}
                paginationModel={paginationModel}
                onPaginationModelChange={(m) => {
                  pushFilters({
                    ...filters,
                    page: m.page + 1,
                    pageSize: m.pageSize,
                  });
                }}
                pageSizeOptions={[20, 25, 50, 100]}
                checkboxSelection={isAdmin}
                rowSelectionModel={selectionModel}
                onRowSelectionModelChange={setSelectionModel}
                disableRowSelectionOnClick
                onRowClick={(p) => navigate(`/clients/${p.id}`)}
                autoHeight={false}
                getRowHeight={() => "auto"}
                getEstimatedRowHeight={() => 72}
                sx={{
                  minHeight: 420,
                  width: "100%",
                  border: "none",
                  "& .MuiDataGrid-columnHeaders": { fontSize: "0.85rem", fontWeight: 700 },
                  "& .MuiDataGrid-cell": {
                    alignItems: "flex-start",
                    py: 1.25,
                    whiteSpace: "normal",
                    lineHeight: 1.4,
                    fontSize: "0.9rem",
                  },
                  "& .MuiDataGrid-row": {
                    maxHeight: "none !important",
                  },
                }}
                slots={{
                  noRowsOverlay: () => (
                    <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                      {loading
                        ? "Загрузка…"
                        : "Нет клиентов, соответствующих фильтрам. Сбросьте фильтры или добавьте первого клиента."}
                    </Box>
                  ),
                }}
              />
            )}
          </Box>
        </Box>

        <Paper variant="outlined" sx={{ width: { xs: "100%", lg: 280 }, flexShrink: 0, p: 2, height: "fit-content" }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Сегменты по тегам
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Количество клиентов в текущей выборке фильтров (без учёта пагинации списка).
          </Typography>
          {tagCounts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Нет данных по тегам
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {tagCounts.slice(0, 12).map((row) => (
                <Box
                  key={row.tag}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    py: 0.5,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.tag}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.count}
                  </Typography>
                  {isAdmin ? (
                    <Button size="small" onClick={() => onSegmentBroadcast(row.tag)}>
                      Рассылка
                    </Button>
                  ) : null}
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </Box>

      {isAdmin && selectedIds.length > 0 ? (
        <Paper
          elevation={6}
          sx={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 10,
            p: 2,
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            alignItems: "center",
          }}
        >
          <Typography sx={{ mr: 1 }}>
            Выбрано: {selectedIds.length}
          </Typography>
          <Button size="small" variant="outlined" disabled title="Экспорт XLSX будет добавлен на бэкенде">
            Экспорт XLSX
          </Button>
          <Button size="small" variant="contained" onClick={() => setBulkAddOpen(true)}>
            Добавить тег
          </Button>
          <Button size="small" variant="outlined" onClick={() => setBulkRemoveOpen(true)}>
            Удалить тег
          </Button>
          <Button size="small" variant="contained" color="secondary" onClick={() => setBulkSmsOpen(true)}>
            Отправить SMS
          </Button>
          <IconButton aria-label="снять выбор" onClick={() => setSelectionModel(newRowSelection())} size="small">
            <CloseIcon />
          </IconButton>
        </Paper>
      ) : null}

      <CreateClientDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setSnack("Клиент создан");
          navigate(`/clients/${id}`);
        }}
      />

      <Dialog open={bulkAddOpen} onClose={() => !bulkBusy && setBulkAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить тег выбранным</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TagSelector value={bulkTags} onChange={setBulkTags} label="Теги для добавления" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkAddOpen(false)} disabled={bulkBusy}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void runBulkAddTags()} disabled={bulkBusy || !bulkTags.length}>
            Применить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkRemoveOpen} onClose={() => !bulkBusy && setBulkRemoveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить тег у выбранных</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            fullWidth
            label="Тег"
            value={bulkRemoveTag}
            onChange={(e) => setBulkRemoveTag(e.target.value)}
            placeholder="Точное имя тега"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkRemoveOpen(false)} disabled={bulkBusy}>
            Отмена
          </Button>
          <Button variant="contained" color="warning" onClick={() => void runBulkRemoveTags()} disabled={bulkBusy || !bulkRemoveTag.trim()}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bulkSmsOpen} onClose={() => !bulkBusy && setBulkSmsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Массовая SMS</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <TextField select label="Тип уведомления" value={smsType} onChange={(e) => setSmsType(e.target.value)}>
            <MenuItem value="bulk_manual">Ручная рассылка</MenuItem>
            <MenuItem value="bulk_promo">Акция</MenuItem>
            <MenuItem value="bulk_reminder">Напоминание</MenuItem>
          </TextField>
          <TextField
            label="Текст SMS"
            multiline
            minRows={3}
            value={smsBody}
            onChange={(e) => setSmsBody(e.target.value)}
            required
          />
          <Typography variant="caption" color="text.secondary">
            Отправка ставит задачи в очередь уведомлений (SMS_DRY_RUN в dev).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkSmsOpen(false)} disabled={bulkBusy}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void runBulkSms()} disabled={bulkBusy || !smsBody.trim()}>
            Отправить
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={4000} onClose={() => setSnack(null)} message={snack} />
    </Paper>
  );
}

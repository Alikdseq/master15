import { zodResolver } from "@hookform/resolvers/zod";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
} from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { PhoneMaskInput } from "../../ui/PhoneMaskInput";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { Cell, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { mpBrand } from "../../app/theme";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useCrmRealtime } from "../../realtime/CrmRealtimeContext";
import { PIE_COLORS } from "../dashboard/chartUtils";
import { PageHeader } from "../../ui/PageHeader";
import { formatRuPhoneForMask } from "../../lib/phoneFormat";
import { clientEditSchema, type ClientEditFormValues } from "./clientSchemas";
import { TagSelector } from "./components/TagSelector";

type ClientDto = {
  id: number;
  type: "person" | "company";
  name: string;
  phone: string;
  email: string;
  address: string;
  comment: string;
  tags: string[];
  orders_count?: number;
  last_order_at?: string | null;
  created_at?: string;
};

type OrderRow = {
  id: number;
  order_number: string;
  received_date: string;
  service_type?: string;
  device_type: string;
  device_model?: string;
  issue_description?: string;
  final_cost?: string | null;
  status?: { code: string; name: string } | null;
  assigned_master?: { id: number | null; name: string | null };
  completed_at?: string | null;
};

type StatsDto = {
  total_orders: number;
  revenue_sum: string;
  avg_check: string | null;
  avg_completion_days: number | null;
  device_types: Array<{ name: string; count: number }>;
  monthly_orders: Array<{ month: string; count: number }>;
  top_issues: Array<{ issue: string; count: number }>;
};

type NoteRow = {
  id: number;
  text: string;
  created_at: string;
  created_by_name?: string | null;
};

const SMS_TEMPLATES = [
  { label: "Готово к выдаче", body: "Здравствуйте! Ваш заказ готов к выдаче. Мастер Принт." },
  { label: "Уточнение", body: "Здравствуйте! Позвоните нам для уточнения по ремонту." },
];

type ClientTab = "info" | "orders" | "stats" | "notes" | "sms";

function orderBelongsToClient(order: Record<string, unknown> | undefined, cid: number): boolean {
  if (!order) return false;
  const c = order.client as { id?: number } | undefined;
  return typeof c?.id === "number" && c.id === cid;
}

export function ClientDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state: auth } = useAuth();
  const { subscribe } = useCrmRealtime();
  const clientId = Number(id);

  const [tab, setTab] = useState<ClientTab>("info");
  const [client, setClient] = useState<ClientDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPageSize = 10;
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [stats, setStats] = useState<StatsDto | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);

  const [smsBody, setSmsBody] = useState("");
  const [smsType, setSmsType] = useState("client_manual");
  const [smsBusy, setSmsBusy] = useState(false);

  const isAdmin = auth.role === "admin";
  const isManager = auth.role === "manager";
  const isMaster = auth.role === "master";
  const canEditAll = isAdmin;
  const canEditLimited = isManager;
  const canNotes = isAdmin || isManager;
  const canSms = isAdmin;
  const showStatsTab = !isMaster;

  useEffect(() => {
    if (tab === "stats" && !showStatsTab) setTab("info");
    if (tab === "sms" && !canSms) setTab("info");
  }, [tab, showStatsTab, canSms]);

  const form = useForm<ClientEditFormValues>({
    resolver: zodResolver(clientEditSchema),
    defaultValues: {
      type: "person",
      name: "",
      phone: "",
      email: "",
      address: "",
      comment: "",
      tags: [],
    },
  });

  const loadClient = useCallback(async () => {
    if (!Number.isFinite(clientId)) return;
    setLoadError(null);
    try {
      const r = await api.get(`/clients/${clientId}/`);
      const c = r.data as ClientDto;
      setClient(c);
      form.reset({
        type: c.type,
        name: c.name,
        phone: formatRuPhoneForMask(c.phone),
        email: c.email ?? "",
        address: c.address ?? "",
        comment: c.comment ?? "",
        tags: Array.isArray(c.tags) ? c.tags : [],
      });
      form.clearErrors("root");
    } catch {
      setLoadError("Не удалось загрузить клиента");
      setClient(null);
    }
  }, [clientId, form]);

  const loadNotes = useCallback(async () => {
    if (!Number.isFinite(clientId)) return;
    const r = await api.get(`/clients/${clientId}/notes/`);
    setNotes((r.data?.results ?? []) as NoteRow[]);
  }, [clientId]);

  const loadOrders = useCallback(async () => {
    if (!Number.isFinite(clientId)) return;
    setOrdersLoading(true);
    try {
      const r = await api.get(`/clients/${clientId}/orders/`, {
        params: { page: ordersPage, page_size: ordersPageSize },
      });
      setOrders((r.data?.results ?? []) as OrderRow[]);
      setOrdersTotal(typeof r.data?.count === "number" ? r.data.count : 0);
    } catch {
      setOrders([]);
      setOrdersTotal(0);
    } finally {
      setOrdersLoading(false);
    }
  }, [clientId, ordersPage]);

  const loadStats = useCallback(async () => {
    if (!Number.isFinite(clientId) || isMaster) return;
    setStatsError(null);
    try {
      const r = await api.get(`/clients/${clientId}/stats/`);
      setStats(r.data as StatsDto);
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setStats(null);
      setStatsError(typeof detail === "string" ? detail : "Не удалось загрузить статистику");
    }
  }, [clientId, isMaster]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (tab === "orders") void loadOrders();
  }, [tab, loadOrders]);

  useEffect(() => {
    if (tab === "stats" && showStatsTab) void loadStats();
  }, [tab, loadStats, showStatsTab]);

  const clientWsThrottleRef = useRef<number | null>(null);
  useEffect(() => {
    return subscribe((msg) => {
      const aid = msg.payload.actor_id;
      if (typeof aid === "number" && aid === auth.userId) return;

      const flush = () => {
        void loadClient();
        if (tab === "orders") void loadOrders();
        if (tab === "stats" && showStatsTab) void loadStats();
      };

      if (msg.type === "client_deleted") {
        if (msg.payload.client_id === clientId) nav("/clients");
        return;
      }
      if (msg.type === "client_updated") {
        if (msg.payload.client_id === clientId) void loadClient();
        return;
      }
      if (msg.type === "order_created" || msg.type === "order_updated") {
        const ord = msg.payload.order as Record<string, unknown> | undefined;
        if (orderBelongsToClient(ord, clientId)) {
          if (clientWsThrottleRef.current) window.clearTimeout(clientWsThrottleRef.current);
          clientWsThrottleRef.current = window.setTimeout(() => {
            clientWsThrottleRef.current = null;
            flush();
          }, 350);
        }
        return;
      }
      if (msg.type === "order_deleted") {
        if (msg.payload.client_id === clientId) {
          if (clientWsThrottleRef.current) window.clearTimeout(clientWsThrottleRef.current);
          clientWsThrottleRef.current = window.setTimeout(() => {
            clientWsThrottleRef.current = null;
            flush();
          }, 350);
        }
      }
    });
  }, [
    subscribe,
    auth.userId,
    clientId,
    loadClient,
    loadOrders,
    loadStats,
    tab,
    showStatsTab,
    nav,
  ]);

  const onSaveInfo = form.handleSubmit(async (vals) => {
    if (!clientId || (!canEditAll && !canEditLimited)) return;
    setBusy(true);
    form.clearErrors("root");
    try {
      const payload: Record<string, unknown> = canEditAll
        ? {
            type: vals.type,
            name: vals.name.trim(),
            phone: vals.phone,
            email: vals.email.trim(),
            address: vals.address.trim(),
            comment: vals.comment.trim(),
            tags: vals.tags,
          }
        : {
            email: vals.email.trim(),
            comment: vals.comment.trim(),
            tags: vals.tags,
          };
      const r = canEditAll
        ? await api.put(`/clients/${clientId}/`, payload)
        : await api.patch(`/clients/${clientId}/`, payload);
      setClient(r.data as ClientDto);
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: unknown } }).response?.data
          : undefined;
      let msg = "Не удалось сохранить";
      if (detail && typeof detail === "object") {
        const d = detail as Record<string, unknown>;
        const first = Object.values(d).find((v) => v != null);
        if (typeof first === "string") msg = first;
        else if (Array.isArray(first) && first.length && typeof first[0] === "string") msg = first[0];
      }
      form.setError("root", { message: msg });
    } finally {
      setBusy(false);
    }
  });

  const orderCols = useMemo<GridColDef<OrderRow>[]>(
    () => [
      { field: "order_number", headerName: "№", width: 120 },
      { field: "received_date", headerName: "Дата", width: 120 },
      {
        field: "service_type",
        headerName: "Услуга",
        width: 100,
        valueGetter: (_v, row) => (row.service_type === "print" ? "Печать" : "Ремонт"),
      },
      { field: "device_type", headerName: "Устройство", flex: 0.6, minWidth: 120 },
      {
        field: "issue_description",
        headerName: "Неисправность",
        flex: 1,
        minWidth: 160,
        valueGetter: (_v, row) => {
          const v = row.issue_description ?? "";
          return v ? (v.length > 80 ? `${v.slice(0, 80)}…` : v) : "—";
        },
      },
      { field: "final_cost", headerName: "Сумма", width: 100 },
      { field: "status", headerName: "Статус", width: 130, valueGetter: (_v, row) => row.status?.name ?? "—" },
      {
        field: "repeat",
        headerName: "",
        width: 160,
        sortable: false,
        renderCell: () => (
          <Button
            size="small"
            component={RouterLink}
            to={`/orders?create=1&client_id=${clientId}`}
            state={{ fromClient: clientId }}
          >
            Повторить заказ
          </Button>
        ),
      },
      {
        field: "open",
        headerName: "",
        width: 100,
        sortable: false,
        renderCell: (p) => (
          <Button size="small" component={RouterLink} to={`/orders/${p.row.id}`}>
            Открыть
          </Button>
        ),
      },
    ],
    [clientId]
  );

  const paginationModel: GridPaginationModel = useMemo(
    () => ({ page: ordersPage - 1, pageSize: ordersPageSize }),
    [ordersPage]
  );

  if (loadError) return <Alert severity="error">{loadError}</Alert>;
  if (!client) return <Skeleton variant="rounded" height={400} />;

  const pieData = (stats?.device_types ?? []).map((d) => ({ name: d.name, value: d.count }));

  return (
    <Box>
      <PageHeader
        title={client.name}
        subtitle={client.phone}
        rightSlot={
          <Button startIcon={<ArrowBackIcon />} component={RouterLink} to="/clients" variant="outlined">
            К списку
          </Button>
        }
      />

      <Box sx={{ display: "flex", flexDirection: { xs: "column", lg: "row" }, gap: 2, alignItems: "flex-start" }}>
      <Paper sx={{ p: 2, mb: { xs: 0, lg: 0 }, flex: 1, minWidth: 0, width: "100%" }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 2 }}>
          {(client.tags ?? []).map((t) => (
            <Chip key={t} label={t} size="small" />
          ))}
        </Box>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as ClientTab)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
        >
          <Tab label="Основная информация" value="info" />
          <Tab label="История заказов" value="orders" />
          {showStatsTab ? <Tab label="Статистика" value="stats" /> : null}
          <Tab label="Заметки" value="notes" />
          {canSms ? <Tab label="Уведомления (SMS)" value="sms" /> : null}
        </Tabs>

        {tab === "info" ? (
          <Box component="form" onSubmit={onSaveInfo} sx={{ display: "grid", gap: 2, maxWidth: 720 }}>
            {form.formState.errors.root ? <Alert severity="error">{form.formState.errors.root.message}</Alert> : null}
            <FormControl fullWidth disabled={!canEditAll}>
              <InputLabel>Тип</InputLabel>
              <Controller
                name="type"
                control={form.control}
                render={({ field }) => (
                  <Select label="Тип" value={field.value} onChange={field.onChange}>
                    <MenuItem value="person">Частное лицо</MenuItem>
                    <MenuItem value="company">Организация</MenuItem>
                  </Select>
                )}
              />
            </FormControl>
            <TextField
              label="ФИО / название"
              required
              {...form.register("name")}
              disabled={!canEditAll}
              error={!!form.formState.errors.name}
              helperText={form.formState.errors.name?.message}
            />
            <Controller
              name="phone"
              control={form.control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Телефон"
                  required
                  fullWidth
                  disabled={!canEditAll}
                  error={!!form.formState.errors.phone}
                  helperText={form.formState.errors.phone?.message}
                  InputProps={{ inputComponent: PhoneMaskInput }}
                />
              )}
            />
            <TextField label="Email" {...form.register("email")} disabled={!canEditAll && !canEditLimited} />
            <TextField label="Адрес" multiline minRows={2} {...form.register("address")} disabled={!canEditAll} />
            <TextField label="Комментарий" multiline minRows={2} {...form.register("comment")} disabled={!canEditAll && !canEditLimited} />
            <TagSelector
              value={form.watch("tags")}
              onChange={(t) => form.setValue("tags", t)}
              disabled={!canEditAll && !canEditLimited}
            />
            {(canEditAll || canEditLimited) && (
              <Box>
                <Button type="submit" variant="contained" disabled={busy}>
                  Сохранить
                </Button>
              </Box>
            )}
          </Box>
        ) : null}

        {tab === "orders" ? (
          <Box sx={{ width: "100%", minHeight: 360 }}>
            <DataGrid
              rows={orders}
              columns={orderCols}
              loading={ordersLoading}
              paginationMode="server"
              rowCount={ordersTotal}
              paginationModel={paginationModel}
              onPaginationModelChange={(m) => setOrdersPage(m.page + 1)}
              pageSizeOptions={[ordersPageSize]}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              autoHeight={false}
              sx={{ minHeight: 360, border: "none" }}
            />
          </Box>
        ) : null}

        {tab === "stats" && showStatsTab ? (
          <Box>
            {statsError ? (
              <Alert severity="warning">{statsError}</Alert>
            ) : stats ? (
              <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">
                      Всего заказов
                    </Typography>
                    <Typography variant="h5">{stats.total_orders}</Typography>
                    <Typography sx={{ mt: 1 }} variant="body2">
                      Выручка: {stats.revenue_sum} ₽
                    </Typography>
                    <Typography variant="body2">Средний чек: {stats.avg_check ?? "—"} ₽</Typography>
                    <Typography variant="body2">Среднее время выполнения: {stats.avg_completion_days ?? "—"} дн.</Typography>
                  </CardContent>
                </Card>
                <Card variant="outlined">
                  <CardContent>
                    <Typography fontWeight={600} sx={{ mb: 1 }}>
                      Топ неисправностей
                    </Typography>
                    {(stats.top_issues ?? []).length === 0 ? (
                      <Typography color="text.secondary">Нет данных</Typography>
                    ) : (
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        {stats.top_issues.map((x) => (
                          <li key={x.issue}>
                            <Typography variant="body2">
                              {x.issue} — {x.count}
                            </Typography>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
                <Box sx={{ gridColumn: { md: "1 / -1" }, minHeight: 280 }}>
                  <Typography fontWeight={600} sx={{ mb: 1 }}>
                    Заказы по типам устройств
                  </Typography>
                  {pieData.length === 0 ? (
                    <Typography color="text.secondary">Нет данных для диаграммы</Typography>
                  ) : (
                    <Box sx={{ width: "100%", overflowX: "auto" }}>
                      <PieChart width={560} height={240}>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </Box>
                  )}
                </Box>
                <Box sx={{ gridColumn: { md: "1 / -1" }, minHeight: 280 }}>
                  <Typography fontWeight={600} sx={{ mb: 1 }}>
                    Обращения по месяцам
                  </Typography>
                  {(stats.monthly_orders ?? []).length === 0 ? (
                    <Typography color="text.secondary">Нет данных по месяцам</Typography>
                  ) : (
                    <Box sx={{ width: "100%", overflowX: "auto" }}>
                      <LineChart width={760} height={240} data={stats.monthly_orders ?? []}>
                        <XAxis dataKey="month" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke={mpBrand.blue.main} dot />
                      </LineChart>
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              <Skeleton height={320} />
            )}
          </Box>
        ) : null}

        {tab === "notes" ? (
          <Box sx={{ maxWidth: 720 }}>
            {canNotes ? (
              <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                <TextField
                  fullWidth
                  label="Новая заметка"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  multiline
                  minRows={2}
                />
                <Button
                  variant="contained"
                  disabled={notesBusy || !noteText.trim()}
                  onClick={async () => {
                    setNotesBusy(true);
                    try {
                      await api.post(`/clients/${clientId}/notes/`, { text: noteText.trim() });
                      setNoteText("");
                      await loadNotes();
                    } catch {
                      // ignore
                    } finally {
                      setNotesBusy(false);
                    }
                  }}
                >
                  Добавить
                </Button>
              </Box>
            ) : (
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Заметки доступны только менеджеру и администратору.
              </Typography>
            )}
            <Divider sx={{ my: 2 }} />
            {notes.map((n) => (
              <Paper key={n.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {String(n.created_at).slice(0, 16)} · {n.created_by_name ?? "—"}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {n.text}
                </Typography>
              </Paper>
            ))}
            {notes.length === 0 ? <Typography color="text.secondary">Заметок пока нет</Typography> : null}
          </Box>
        ) : null}

        {canSms && tab === "sms" ? (
          <Box sx={{ maxWidth: 560, display: "grid", gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              История SMS в API пока не подключена. Отправка использует очередь уведомлений (как массовая рассылка).
            </Typography>
            <TextField select label="Тип" value={smsType} onChange={(e) => setSmsType(e.target.value)}>
              <MenuItem value="client_manual">Индивидуальное сообщение</MenuItem>
              <MenuItem value="client_reminder">Напоминание</MenuItem>
            </TextField>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {SMS_TEMPLATES.map((t) => (
                <Button key={t.label} size="small" variant="outlined" onClick={() => setSmsBody(t.body)}>
                  {t.label}
                </Button>
              ))}
            </Box>
            <TextField label="Текст SMS" multiline minRows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
            <Button
              variant="contained"
              disabled={smsBusy || !smsBody.trim()}
              onClick={async () => {
                setSmsBusy(true);
                try {
                  await api.post("/clients/mass-sms/", {
                    notif_type: smsType,
                    title: "",
                    body: smsBody.trim(),
                    client_ids: [clientId],
                  });
                  setSmsBody("");
                } catch {
                  // ignore
                } finally {
                  setSmsBusy(false);
                }
              }}
            >
              Отправить SMS
            </Button>
          </Box>
        ) : null}
      </Paper>

      <Paper sx={{ p: 2, width: { xs: "100%", lg: 300 }, flexShrink: 0, position: { lg: "sticky" }, top: 96 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Сводка
        </Typography>
        <Typography variant="body2">Заказов: {client.orders_count ?? "—"}</Typography>
        <Typography variant="body2">Последний заказ: {client.last_order_at ? String(client.last_order_at).slice(0, 10) : "—"}</Typography>
        <Button sx={{ mt: 2 }} size="small" variant="contained" component={RouterLink} to={`/orders?create=1&client_id=${clientId}`}>
          Создать заказ
        </Button>
      </Paper>
      </Box>
    </Box>
  );
}

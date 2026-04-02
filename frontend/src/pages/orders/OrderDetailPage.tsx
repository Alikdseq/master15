import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import AddIcon from "@mui/icons-material/Add";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_ORIGIN, api, formatApiError } from "../../lib/api";
import { PageHeader } from "../../ui/PageHeader";
import { StatusBadge } from "../../ui/StatusBadge";
import { useAuth } from "../../app/AuthContext";
import { useCrmRealtime } from "../../realtime/CrmRealtimeContext";
import { InventoryProductAutocomplete, type InventoryProductOption } from "./components/InventoryProductAutocomplete";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

export function OrderDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state: auth } = useAuth();
  const { subscribe } = useCrmRealtime();
  const [order, setOrder] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [usedProducts, setUsedProducts] = useState<any[]>([]);
  const [statusOptions, setStatusOptions] = useState<{ statuses: any[]; transitions: any[] } | null>(null);

  const [statusCode, setStatusCode] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [readyDialogOpen, setReadyDialogOpen] = useState(false);
  const [readyFinalCost, setReadyFinalCost] = useState("");
  const [readyMaterialsDraft, setReadyMaterialsDraft] = useState<
    Array<{ product: InventoryProductOption | null; quantity: string }>
  >([]);
  const [readySubmitError, setReadySubmitError] = useState<string | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [materialsDraft, setMaterialsDraft] = useState<
    Array<{ product: InventoryProductOption | null; quantity: string }>
  >([]);

  const [clientQuery, setClientQuery] = useState("");
  const [clientOptions, setClientOptions] = useState<Array<{ id: number; name: string; phone: string }>>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [o, h, up, so] = await Promise.all([
        api.get(`/orders/${id}/`),
        api.get(`/orders/${id}/history/`),
        api.get(`/orders/${id}/used-products/`),
        api.get(`/orders/status-options/`),
      ]);
      setOrder(o.data);
      setHistory(h.data.results);
      setUsedProducts(up.data.results ?? []);
      setStatusOptions(so.data);

      const currentCode = o.data?.status?.code as string | undefined;
      setStatusCode(currentCode ?? "");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось загрузить заказ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderIdNum = Number(id);
  const wsThrottleRef = useRef<number | null>(null);
  useEffect(() => {
    return subscribe((msg) => {
      const aid = msg.payload.actor_id;
      if (typeof aid === "number" && aid === auth.userId) return;
      if (msg.type === "order_deleted") {
        if (msg.payload.order_id === orderIdNum) {
          nav("/orders");
        }
        return;
      }
      if (msg.type === "order_updated") {
        const oid = (msg.payload.order as { id?: number } | undefined)?.id;
        if (oid === orderIdNum) {
          if (wsThrottleRef.current) window.clearTimeout(wsThrottleRef.current);
          wsThrottleRef.current = window.setTimeout(() => {
            wsThrottleRef.current = null;
            void load();
          }, 350);
        }
      }
    });
  }, [subscribe, auth.userId, orderIdNum, load, nav]);

  useEffect(() => {
    const q = clientQuery.trim();
    if (!editOpen) return;
    if (!q) return;
    let active = true;
    (async () => {
      try {
        const r = await api.get("/clients/", { params: { search: q, ordering: "-id" } });
        if (!active) return;
        const results = (r.data?.results ?? []) as any[];
        setClientOptions(
          results.map((x) => ({
            id: x.id,
            name: x.name,
            phone: x.phone,
          }))
        );
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [clientQuery, editOpen]);

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const currentStatusCode = (order?.status?.code ?? "") as string;
  const canEditOrder = auth.role === "admin" || auth.role === "manager";
  const clientObj = order?.client && typeof order.client === "object" ? order.client : null;
  const masterObj = order?.assigned_master && typeof order.assigned_master === "object" ? order.assigned_master : null;

  const statusesByCode = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of statusOptions?.statuses ?? []) m.set(s.code, s);
    return m;
  }, [statusOptions]);

  const allowedNextStatusCodes = useMemo(() => {
    if (!statusOptions) return [];
    const allActive = (statusOptions.statuses ?? []).map((s) => s.code);
    if (auth.role === "admin") return allActive;
    const allowed = new Set<string>();
    for (const t of statusOptions.transitions ?? []) {
      if (t.from === currentStatusCode) allowed.add(t.to);
    }
    allowed.add(currentStatusCode);
    return allActive.filter((x) => allowed.has(x));
  }, [auth.role, currentStatusCode, statusOptions]);

  const accessories = useMemo(() => {
    const a = order?.accessories;
    if (!a) return [];
    if (Array.isArray(a)) return a.map(String).filter(Boolean);
    if (typeof a === "object") {
      return Object.entries(a)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => (v === true ? k : `${k}: ${String(v)}`));
    }
    return [String(a)];
  }, [order]);

  const openMaterials = () => {
    setMaterialsDraft(
      (usedProducts ?? []).map((x: any) => ({
        product:
          x.product != null
            ? {
                id: x.product as number,
                name: String(x.product_name ?? ""),
                sku: String(x.product_sku ?? ""),
              }
            : null,
        quantity: String(x.quantity ?? ""),
      }))
    );
    setMaterialsOpen(true);
  };

  const submitMaterials = async () => {
    const items = materialsDraft
      .filter((x) => x.product && x.quantity)
      .map((x) => ({ product: x.product!.id, quantity: x.quantity }));
    await api.put(`/orders/${id}/used-products/`, { items });
    setMaterialsOpen(false);
    await load();
  };

  const openReadyDialog = () => {
    setReadySubmitError(null);
    setReadyFinalCost(
      order?.final_work_cost != null && order.final_work_cost !== ""
        ? String(order.final_work_cost)
        : order?.preliminary_cost != null && order.preliminary_cost !== ""
          ? String(order.preliminary_cost)
          : ""
    );
    const rows = (usedProducts ?? []).map((x: any) => ({
      product:
        x.product != null
          ? {
              id: x.product as number,
              name: String(x.product_name ?? ""),
              sku: String(x.product_sku ?? ""),
            }
          : null,
      quantity: String(x.quantity ?? ""),
    }));
    setReadyMaterialsDraft(rows.length ? rows : [{ product: null, quantity: "" }]);
    setReadyDialogOpen(true);
  };

  const tryChangeStatus = async () => {
    try {
      await api.post(`/orders/${id}/change-status/`, { to_status: statusCode, comment });
      setComment("");
      await load();
    } catch (e: unknown) {
      setError(formatApiError(e));
    }
  };

  const submitReadyTransition = async () => {
    setReadySubmitError(null);
    const fc = readyFinalCost.trim();
    if (!fc) {
      setReadySubmitError("Укажите итоговую стоимость работ для клиента.");
      return;
    }
    for (const row of readyMaterialsDraft) {
      const hasProduct = Boolean(row.product);
      const hasQty = Boolean(row.quantity?.trim());
      if (hasProduct !== hasQty) {
        setReadySubmitError(
          "В каждой строке материалов укажите и позицию, и количество, либо удалите неполную строку. Если материалы не использовались — оставьте список пустым."
        );
        return;
      }
    }
    const items = readyMaterialsDraft
      .filter((x) => x.product && x.quantity.trim())
      .map((x) => ({ product: x.product!.id, quantity: x.quantity.trim() }));
    try {
      await api.post(`/orders/${id}/change-status/`, {
        to_status: "ready",
        comment,
        final_work_cost: fc,
        used_products: { items },
      });
      setComment("");
      setReadyDialogOpen(false);
      await load();
    } catch (e: unknown) {
      setReadySubmitError(formatApiError(e));
    }
  };

  const handleDeleteOrder = async () => {
    try {
      await api.delete(`/orders/${id}/`);
      setDeleteOpen(false);
      nav("/orders");
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Не удалось удалить заказ");
      setDeleteOpen(false);
    }
  };

  const EditSchema = z.object({
    client_id: z.number().int().positive(),
    device_type: z.string().trim().min(1, "Устройство обязательно"),
    device_model: z.string().trim().optional(),
    serial_number: z.string().trim().optional(),
    issue_description: z.string().trim().min(1, "Неисправность обязательна"),
    received_date: z.string().trim().min(1),
    desired_completion_date: z.string().trim().optional().or(z.literal("")),
    preliminary_cost: z.string().trim().optional().or(z.literal("")),
    final_cost: z.string().trim().optional().or(z.literal("")),
    other_costs: z.string().trim().optional().or(z.literal("")),
    refusal_mark: z.string().trim().optional().or(z.literal("")),
  });
  type EditValues = z.infer<typeof EditSchema>;

  const editDefaults = useMemo<EditValues>(
    () => ({
      client_id: clientObj?.id ?? (typeof order?.client === "number" ? order.client : 0),
      device_type: order?.device_type ?? "",
      device_model: order?.device_model ?? "",
      serial_number: order?.serial_number ?? "",
      issue_description: order?.issue_description ?? "",
      received_date: (order?.received_date ?? "").slice(0, 10),
      desired_completion_date: (order?.desired_completion_date ?? "").slice(0, 10),
      preliminary_cost: order?.preliminary_cost === null || order?.preliminary_cost === undefined ? "" : String(order.preliminary_cost),
      final_cost: order?.final_cost === null || order?.final_cost === undefined ? "" : String(order.final_cost),
      other_costs:
        order?.other_costs === null || order?.other_costs === undefined || order.other_costs === ""
          ? ""
          : String(order.other_costs),
      refusal_mark: order?.refusal_mark ?? "",
    }),
    [clientObj, order]
  );

  const {
    control,
    register,
    handleSubmit,
    formState: { errors: editErrors, isSubmitting },
    reset,
    watch,
  } = useForm<EditValues>({
    resolver: zodResolver(EditSchema),
    defaultValues: editDefaults,
    mode: "onBlur",
  });

  const selectedClientId = watch("client_id");

  useEffect(() => {
    // Keep form state in sync with loaded order data.
    if (!order) return;
    reset(editDefaults);
  }, [order, reset, editDefaults]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!order) return loading ? null : null;

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Paper sx={{ p: { xs: 2, sm: 2.5 } }}>
        <PageHeader
          title={`Заказ №${order.order_number}`}
          subtitle={
            order.service_type === "print"
              ? `Печать${order.print?.document_type ? ` · ${order.print.document_type}` : ""}`
              : `${order.device_type}${order.device_model ? ` · ${order.device_model}` : ""}`
          }
          rightSlot={
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <StatusBadge label={order.status?.name ?? "—"} code={order.status?.code ?? null} />
              {canEditOrder ? (
                <>
                  <IconButton
                    aria-label="Редактировать"
                    onClick={() => {
                      reset(editDefaults);
                      setEditOpen(true);
                    }}
                  >
                    <EditOutlinedIcon />
                  </IconButton>
                  <IconButton
                    aria-label="Удалить"
                    color="error"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </>
              ) : null}
            </Box>
          }
        />

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Paper sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Клиент и устройство
              </Typography>
              <Box sx={{ display: "grid", gap: 1 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Клиент
                  </Typography>
                  {clientObj ? (
                    <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                      <Box>
                        <Typography sx={{ fontWeight: 700 }}>{clientObj.name}</Typography>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {clientObj.phone}
                        </Typography>
                      </Box>
                      <Button variant="outlined" size="small" onClick={() => nav(`/clients/${clientObj.id}`)}>
                        Карточка клиента
                      </Button>
                    </Box>
                  ) : (
                    <Typography sx={{ fontWeight: 600 }}>#{order.client}</Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Тип услуги
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>{order.service_type === "print" ? "Печать" : "Ремонт"}</Typography>
                </Box>
                {order.service_type === "print" && order.print ? (
                  <>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Тип документа
                      </Typography>
                      <Typography sx={{ fontWeight: 600 }}>{order.print.document_type ?? "—"}</Typography>
                    </Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          Страниц / копий
                        </Typography>
                        <Typography sx={{ fontWeight: 600 }}>{order.print.page_count ?? "—"}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          Цветность
                        </Typography>
                        <Typography sx={{ fontWeight: 600 }}>
                          {order.print.color_mode === "color" ? "Цветная" : "Чёрно-белая"}
                        </Typography>
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Срочность
                      </Typography>
                      <Typography sx={{ fontWeight: 600 }}>{order.print.urgent ? "Да" : "Нет"}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Особые пожелания
                      </Typography>
                      <Typography sx={{ whiteSpace: "pre-wrap" }}>{order.print.special_requests || "—"}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Файлы
                      </Typography>
                      {(order.print.file_paths ?? []).length === 0 ? (
                        <Typography>—</Typography>
                      ) : (
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                          {(order.print.file_paths as string[]).map((path, i) => {
                            const href =
                              path.startsWith("http") ? path : `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
                            return (
                              <Typography key={`${path}-${i}`} component="a" href={href} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 600 }}>
                                Файл {i + 1}
                              </Typography>
                            );
                          })}
                        </Box>
                      )}
                    </Box>
                  </>
                ) : (
                  <>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Устройство
                      </Typography>
                      <Typography sx={{ fontWeight: 600 }}>{order.device_type || "—"}</Typography>
                    </Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                      <Box>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          Модель
                        </Typography>
                        <Typography sx={{ fontWeight: 600 }}>{order.device_model || "—"}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          Серийный номер
                        </Typography>
                        <Typography sx={{ fontWeight: 600 }}>{order.serial_number || "—"}</Typography>
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Неисправность
                      </Typography>
                      <Typography sx={{ whiteSpace: "pre-wrap" }}>{order.issue_description || "—"}</Typography>
                    </Box>
                  </>
                )}
              </Box>
            </Paper>
          

            <Paper sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Сроки и стоимость
              </Typography>
              <Box sx={{ display: "grid", gap: 1 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Мастер
                  </Typography>
                  <Typography sx={{ fontWeight: 600 }}>
                    {masterObj ? (masterObj.name ? `${masterObj.name} (${masterObj.email})` : masterObj.email) : "—"}
                  </Typography>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Дата приёма
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{formatDate(order.received_date)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Желаемая дата
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{formatDate(order.desired_completion_date)}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Предварительная стоимость работ
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{order.preliminary_cost ?? "—"}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Окончательная стоимость работ
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{order.final_work_cost ?? "—"}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                  <Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Материалы (по продажным ценам)
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{order.final_materials_cost ?? "—"}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Итого к оплате
                    </Typography>
                    <Typography sx={{ fontWeight: 700 }}>{order.total_amount ?? order.final_cost ?? "—"}</Typography>
                  </Box>
                </Box>
                {auth.role === "admin" ? (
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Себестоимость материалов
                      </Typography>
                      <Typography sx={{ fontWeight: 600 }}>{order.materials_cost_price ?? "—"}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Доп. расходы
                      </Typography>
                      <Typography sx={{ fontWeight: 600 }}>{order.other_costs ?? "—"}</Typography>
                    </Box>
                    <Box sx={{ gridColumn: "1 / -1" }}>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Расчётная прибыль
                      </Typography>
                      <Typography sx={{ fontWeight: 700 }}>{order.profit ?? "—"}</Typography>
                    </Box>
                  </Box>
                ) : null}
                <Box>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Комплектация
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
                    {accessories.length ? accessories.map((x) => <Chip key={x} label={x} />) : <Chip label="—" />}
                  </Box>
                </Box>
              </Box>
            </Paper>
        </Box>

        <Box sx={{ mt: 2 }}>
            <Paper sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Статус
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.5fr auto" }, gap: 1.5, alignItems: "center" }}>
                <TextField
                  select
                  label="Новый статус"
                  value={statusCode}
                  onChange={(e) => setStatusCode(e.target.value)}
                  disabled={!statusOptions}
                >
                  {allowedNextStatusCodes.map((code) => {
                    const s = statusesByCode.get(code);
                    return (
                      <MenuItem key={code} value={code}>
                        {s?.name ?? code}
                      </MenuItem>
                    );
                  })}
                </TextField>
                <TextField label="Комментарий (в историю)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button
                  variant="contained"
                  disabled={!statusCode || statusCode === currentStatusCode}
                  onClick={() => {
                    if (statusCode === "ready") openReadyDialog();
                    else void tryChangeStatus();
                  }}
                >
                  Применить
                </Button>
              </Box>
              <Box sx={{ mt: 1.25, color: "text.secondary", fontSize: 12 }}>
                При переводе в статус «Готов» укажите итоговую стоимость и при необходимости материалы; клиенту будет отправлено SMS.
              </Box>
            </Paper>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 0.8fr" }, gap: 2, mt: 2 }}>
          <Paper sx={{ p: 2.25 }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1 }}>
                <Typography variant="subtitle1">Использованные материалы</Typography>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={openMaterials}>
                  Добавить материал
                </Button>
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: "grid", gap: 1 }}>
                {usedProducts.length ? (
                  usedProducts.map((x) => (
                    <Box
                      key={`${x.product}-${x.quantity}`}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 1,
                        py: 1,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>{x.product_name}</Typography>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {x.product_sku}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontWeight: 700 }}>{x.quantity}</Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Материалы пока не добавлены.
                  </Typography>
                )}
              </Box>
          </Paper>

          <Paper sx={{ p: 2.25 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                История статусов
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              <Box sx={{ display: "grid", gap: 1 }}>
                {history.map((x) => (
                  <Box key={x.id} sx={{ display: "grid", gap: 0.25, pb: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <StatusBadge label={x.status?.name ?? "—"} code={x.status?.code ?? null} />
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {formatDateTime(x.changed_at)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {x.comment || "—"}
                    </Typography>
                  </Box>
                ))}
              </Box>
          </Paper>
        </Box>
      </Paper>

      <Dialog open={readyDialogOpen} onClose={() => setReadyDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Перевод в «Готов»</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Укажите итоговую стоимость. Перечислите использованные материалы (или оставьте блок пустым, если материалы не применялись). Неполные строки недопустимы.
          </Typography>
          {readySubmitError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {readySubmitError}
            </Alert>
          ) : null}
          <TextField
            label="Окончательная стоимость работ (без материалов), ₽"
            value={readyFinalCost}
            onChange={(e) => setReadyFinalCost(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Использованные материалы
          </Typography>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {readyMaterialsDraft.map((row, idx) => (
              <Box key={idx} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr auto" }, gap: 1.25, alignItems: "center" }}>
                <InventoryProductAutocomplete
                  value={row.product}
                  onChange={(next) => {
                    setReadyMaterialsDraft((d) => d.map((x, i) => (i === idx ? { ...x, product: next } : x)));
                  }}
                />
                <TextField
                  label="Количество"
                  value={row.quantity}
                  onChange={(e) =>
                    setReadyMaterialsDraft((d) => d.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                  }
                />
                <Button variant="outlined" color="error" onClick={() => setReadyMaterialsDraft((d) => d.filter((_, i) => i !== idx))}>
                  Удалить
                </Button>
              </Box>
            ))}
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setReadyMaterialsDraft((d) => [...d, { product: null, quantity: "" }])}>
              Добавить позицию
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setReadyDialogOpen(false)}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void submitReadyTransition()}>
            Перевести в «Готов»
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={materialsOpen} onClose={() => setMaterialsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Материалы для заказа</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Добавляйте позиции — при сохранении произойдёт списание со склада.
          </Typography>
          <Box sx={{ display: "grid", gap: 1.5 }}>
            {materialsDraft.map((row, idx) => (
              <Box key={idx} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr auto" }, gap: 1.25, alignItems: "center" }}>
                <InventoryProductAutocomplete
                  value={row.product}
                  onChange={(next) => {
                    setMaterialsDraft((d) => d.map((x, i) => (i === idx ? { ...x, product: next } : x)));
                  }}
                />
                <TextField
                  label="Количество"
                  value={row.quantity}
                  onChange={(e) => setMaterialsDraft((d) => d.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
                />
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setMaterialsDraft((d) => d.filter((_, i) => i !== idx))}
                >
                  Удалить
                </Button>
              </Box>
            ))}
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setMaterialsDraft((d) => [...d, { product: null, quantity: "" }])}
            >
              Добавить позицию
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setMaterialsOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await submitMaterials();
              } catch (e: any) {
                setError(e?.response?.data?.detail ?? "Не удалось сохранить материалы");
              }
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить заказ</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Вы уверены, что хотите удалить заказ №{order.order_number}? Это действие нельзя отменить.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setDeleteOpen(false)}>
            Отмена
          </Button>
          <Button variant="contained" color="error" onClick={() => void handleDeleteOrder()}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Редактирование заказа</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box
            component="form"
            id="order-edit-form"
            onSubmit={handleSubmit(async (values) => {
              setError(null);
              try {
                await api.patch(`/orders/${id}/`, {
                  client: values.client_id,
                  device_type: values.device_type,
                  device_model: values.device_model || "",
                  serial_number: values.serial_number || "",
                  issue_description: values.issue_description,
                  received_date: values.received_date,
                  desired_completion_date: values.desired_completion_date || null,
                  preliminary_cost: values.preliminary_cost ? values.preliminary_cost : null,
                  final_cost: values.final_cost ? values.final_cost : null,
                  ...(auth.role === "admin"
                    ? { other_costs: values.other_costs !== "" ? values.other_costs : "0" }
                    : {}),
                  refusal_mark: values.refusal_mark || "",
                });
                setEditOpen(false);
                await load();
              } catch (e: any) {
                setError(e?.response?.data?.detail ?? "Не удалось сохранить изменения");
              }
            })}
            style={{ marginTop: 4 }}
          >
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
              <Controller
                control={control}
                name="client_id"
                render={({ field }) => (
                  <Autocomplete
                    options={clientOptions}
                    getOptionLabel={(o) => `${o.name} · ${o.phone}`}
                    value={clientOptions.find((c) => c.id === field.value) ?? (clientObj ? clientObj : null)}
                    onChange={(_, v) => field.onChange(v?.id ?? field.value)}
                    onInputChange={(_, v) => setClientQuery(v)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Клиент"
                        error={Boolean(editErrors.client_id)}
                        helperText={editErrors.client_id?.message}
                      />
                    )}
                  />
                )}
              />

              <TextField
                label="Дата приёма"
                type="date"
                InputLabelProps={{ shrink: true }}
                {...register("received_date")}
                error={Boolean(editErrors.received_date)}
                helperText={editErrors.received_date?.message}
              />

              <TextField
                label="Устройство (обязательно)"
                {...register("device_type")}
                error={Boolean(editErrors.device_type)}
                helperText={editErrors.device_type?.message}
              />

              <TextField
                label="Желаемая дата готовности"
                type="date"
                InputLabelProps={{ shrink: true }}
                {...register("desired_completion_date")}
                error={Boolean(editErrors.desired_completion_date)}
                helperText={editErrors.desired_completion_date?.message}
              />

              <TextField label="Модель" {...register("device_model")} />
              <TextField label="Серийный номер" {...register("serial_number")} />

              <TextField
                label="Предварительная стоимость работ"
                {...register("preliminary_cost")}
              />
              <TextField
                label="Итого к оплате (корректировка)"
                {...register("final_cost")}
                helperText="При изменении пересчитывается доля работы и итог"
              />
              {auth.role === "admin" ? (
                <TextField label="Дополнительные расходы по заказу" {...register("other_costs")} />
              ) : null}
            </Box>

            <TextField
              label="Неисправность (обязательно)"
              multiline
              minRows={3}
              sx={{ mt: 1.5 }}
              fullWidth
              {...register("issue_description")}
              error={Boolean(editErrors.issue_description)}
              helperText={editErrors.issue_description?.message}
            />

            <TextField
              label="Отметка отказа клиента"
              sx={{ mt: 1.5 }}
              fullWidth
              {...register("refusal_mark")}
            />

            <Box sx={{ mt: 1.25, color: "text.secondary", fontSize: 12 }}>
              Выбран клиент: {selectedClientId ? `#${selectedClientId}` : "—"}.
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEditOpen(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button
            variant="contained"
            type="submit"
            form="order-edit-form"
            disabled={isSubmitting}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}


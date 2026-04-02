import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { PhoneMaskInput } from "../../../ui/PhoneMaskInput";
import { api } from "../../../lib/api";
import { useAuth } from "../../../app/AuthContext";
import {
  buildAccessoriesPayload,
  createOrderFormSchema,
  DEVICE_TYPES,
  normalizePhoneRu,
  PRINT_DOCUMENT_TYPES,
  type CreateOrderFormValues,
} from "../createOrderSchema";
import { ClientSearchField, type ClientOption } from "./ClientSearchField";

type MasterRow = { id: number; name: string; email: string };

const defaults: CreateOrderFormValues = {
  clientMode: "existing",
  clientId: null,
  newName: "",
  newPhone: "",
  newEmail: "",
  newAddress: "",
  service_type: "repair",
  device_type: "Принтер",
  device_model: "",
  serial_number: "",
  issue_description: "",
  acc_power: false,
  acc_usb: false,
  acc_power_cable: false,
  acc_mouse: false,
  acc_keyboard: false,
  acc_cartridge: false,
  acc_other: "",
  received_date: new Date().toISOString().slice(0, 10),
  desired_completion_date: "",
  preliminary_cost: "",
  assigned_master: "",
  internal_comment: "",
  print_document_type: "Документы",
  print_page_count: 1,
  print_color_mode: "bw",
  print_urgent: false,
  print_special_requests: "",
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Полный объект заказа из ответа API — для локального обновления списка без лишнего GET. */
  onCreated: (order: Record<string, unknown>) => void;
  /** When opening from a client card, preselect this client. */
  initialClientId?: number | null;
};

export function CreateOrderDialog({ open, onClose, onCreated, initialClientId = null }: Props) {
  const { state: auth } = useAuth();
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [printFiles, setPrintFiles] = useState<File[]>([]);

  const form = useForm<CreateOrderFormValues>({
    resolver: zodResolver(createOrderFormSchema) as Resolver<CreateOrderFormValues>,
    defaultValues: defaults,
    shouldUnregister: false,
  });

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    (async () => {
      try {
        const r = await api.get("/orders/masters/");
        setMasters(r.data as MasterRow[]);
      } catch {
        setMasters([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSubmitError(null);
    (async () => {
      if (initialClientId) {
        try {
          const r = await api.get(`/clients/${initialClientId}/`);
          if (cancelled) return;
          const d = r.data as { id: number; name: string; phone: string; email?: string };
          form.reset({
            ...defaults,
            clientMode: "existing",
            clientId: d.id,
          });
          setSelectedClient({ id: d.id, name: d.name, phone: d.phone, email: d.email ?? "" });
          setClientSearch(`${d.name} · ${d.phone}`);
          setPrintFiles([]);
        } catch {
          if (!cancelled) {
            form.reset(defaults);
            setClientSearch("");
            setSelectedClient(null);
            setPrintFiles([]);
          }
        }
      } else {
        form.reset(defaults);
        setClientSearch("");
        setSelectedClient(null);
        setPrintFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialClientId, form]);

  const clientMode = form.watch("clientMode");
  const serviceType = form.watch("service_type");

  const onClientPicked = async (c: ClientOption | null) => {
    setSelectedClient(c);
    if (!c?.id) return;
    try {
      const r = await api.get(`/clients/${c.id}/`);
      const d = r.data as { id: number; name: string; phone: string; email?: string };
      setSelectedClient({ id: d.id, name: d.name, phone: d.phone, email: d.email ?? "" });
      setClientSearch(`${d.name} · ${d.phone}`);
    } catch {
      /* оставляем данные из автодополнения */
    }
  };

  const switchToNewClientMode = () => {
    const raw = clientSearch.trim();
    const digits = raw.replace(/\D/g, "");
    form.setValue("newPhone", digits.length >= 6 ? raw : "");
    form.setValue("newName", digits.length >= 6 ? "" : raw);
    form.setValue("newEmail", "");
    form.setValue("newAddress", "");
    form.setValue("clientMode", "new");
    form.setValue("clientId", null);
    setSelectedClient(null);
  };

  useEffect(() => {
    if (clientMode === "existing") {
      form.setValue("clientId", selectedClient?.id ?? null);
    }
  }, [clientMode, selectedClient, form]);

  const onSubmit = form.handleSubmit(
    async (vals: CreateOrderFormValues) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      let clientId = vals.clientId;
      if (vals.clientMode === "new") {
        const phone = normalizePhoneRu(vals.newPhone);
        try {
          const cr = await api.post("/clients/", {
            type: "person",
            name: vals.newName.trim(),
            phone,
            email: vals.newEmail.trim() || "",
            address: vals.newAddress.trim() || "",
            tags: [],
          });
          clientId = cr.data.id as number;
        } catch (e: unknown) {
          const detail =
            typeof e === "object" && e !== null && "response" in e
              ? (e as { response?: { data?: Record<string, unknown> } }).response?.data
              : undefined;
          const phoneError = detail?.phone;
          const duplicatePhone =
            typeof phoneError === "string"
              ? phoneError.toLowerCase().includes("unique") || phoneError.toLowerCase().includes("already")
              : Array.isArray(phoneError) &&
                phoneError.some((x) => String(x).toLowerCase().includes("unique") || String(x).toLowerCase().includes("already"));
          if (!duplicatePhone) throw e;

          const sr = await api.get("/clients/", { params: { search: phone, page_size: 10 } });
          const rows = (sr.data?.results ?? []) as Array<{ id: number; phone?: string }>;
          const found = rows.find((r) => normalizePhoneRu(String(r.phone ?? "")) === phone) ?? rows[0];
          if (!found?.id) throw e;
          clientId = found.id;
        }
      }
      if (!clientId) {
        setSubmitError("Не выбран клиент");
        setSubmitting(false);
        return;
      }

      const base: Record<string, unknown> = {
        client: clientId,
        service_type: vals.service_type,
        received_date: vals.received_date,
        desired_completion_date: vals.desired_completion_date.trim() || null,
        preliminary_cost: vals.preliminary_cost.trim() ? vals.preliminary_cost.trim() : null,
      };
      const am = vals.assigned_master.trim();
      if (am) base.assigned_master = Number(am);

      let payload: Record<string, unknown>;
      if (vals.service_type === "repair") {
        payload = {
          ...base,
          device_type: vals.device_type,
          device_model: vals.device_model.trim(),
          serial_number: vals.serial_number.trim(),
          issue_description: vals.issue_description.trim(),
          accessories: buildAccessoriesPayload(vals),
        };
      } else {
        payload = {
          ...base,
          print: {
            document_type: vals.print_document_type.trim(),
            page_count: vals.print_page_count,
            color_mode: vals.print_color_mode,
            urgent: vals.print_urgent,
            special_requests: vals.print_special_requests.trim(),
            file_paths: [],
          },
        };
      }

      const resp = await api.post("/orders/", payload);
      const newId = resp.data.id as number;
      let orderPayload: Record<string, unknown> = { ...(resp.data as Record<string, unknown>) };

      if (vals.service_type === "print" && printFiles.length > 0) {
        const fd = new FormData();
        for (const f of printFiles) fd.append("files", f);
        const up = await api.post(`/orders/${newId}/upload-print-files/`, fd);
        const data = up.data as { print?: unknown };
        if (data?.print != null) {
          orderPayload = { ...orderPayload, print: data.print };
        }
      }

      onCreated(orderPayload);
      onClose();
    } catch (e: unknown) {
      const detail =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: unknown } }).response?.data
          : undefined;
      const msg =
        typeof detail === "object" && detail !== null && "detail" in detail
          ? String((detail as { detail?: unknown }).detail)
          : "Не удалось создать заказ";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
    },
    (errors) => {
      const pick = (): string => {
        const entries = Object.entries(errors);
        for (const [, err] of entries) {
          const e = err as { message?: string };
          if (typeof e?.message === "string" && e.message) return e.message;
        }
        for (const [, err] of entries) {
          const nested = err as { root?: { message?: string }; types?: Record<string, string> };
          if (nested?.root?.message) return nested.root.message;
        }
        return "Проверьте заполнение полей формы";
      };
      setSubmitError(pick());
    }
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Новый заказ</DialogTitle>
      <Box component="form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <DialogContent dividers>
          {submitError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {submitError}
            </Alert>
          ) : null}

          <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
            Клиент
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Если клиента ещё нет в базе, выберите режим «Новый клиент» — запись создаётся автоматически при сохранении заказа.
          </Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Режим</InputLabel>
            <Select
              label="Режим"
              value={clientMode}
              onChange={(e) => {
                const m = e.target.value as "existing" | "new";
                form.setValue("clientMode", m);
                if (m === "existing") {
                  setSelectedClient(null);
                  setClientSearch("");
                } else {
                  switchToNewClientMode();
                }
              }}
            >
              <MenuItem value="existing">Существующий клиент (поиск)</MenuItem>
              <MenuItem value="new">Новый клиент</MenuItem>
            </Select>
          </FormControl>

          {clientMode === "existing" ? (
            <>
              <ClientSearchField
                value={selectedClient}
                onChange={(c) => void onClientPicked(c)}
                inputValue={clientSearch}
                onInputChange={setClientSearch}
                disabled={submitting}
                emptySearchAction={{
                  label: "Новый клиент",
                  onClick: () => {
                    switchToNewClientMode();
                  },
                }}
              />
              {form.formState.errors.clientId ? (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                  {form.formState.errors.clientId.message}
                </Typography>
              ) : null}
              {selectedClient ? (
                <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
                  <TextField label="Имя клиента" value={selectedClient.name} fullWidth disabled />
                  <TextField label="Телефон" value={selectedClient.phone} fullWidth disabled />
                  <TextField label="Email" value={selectedClient.email ?? ""} fullWidth disabled />
                </Box>
              ) : null}
            </>
          ) : (
            <Box sx={{ display: "grid", gap: 2 }}>
              <TextField
                label="ФИО / название"
                required
                {...form.register("newName")}
                error={!!form.formState.errors.newName}
                helperText={form.formState.errors.newName?.message}
              />
              <Controller
                name="newPhone"
                control={form.control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Телефон"
                    required
                    fullWidth
                    error={!!form.formState.errors.newPhone}
                    helperText={form.formState.errors.newPhone?.message}
                    InputProps={{ inputComponent: PhoneMaskInput }}
                  />
                )}
              />
              <TextField label="Email" {...form.register("newEmail")} />
              <TextField label="Адрес" {...form.register("newAddress")} multiline minRows={2} />
            </Box>
          )}

          <Divider sx={{ my: 3 }} />
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Тип услуги</FormLabel>
            <Controller
              name="service_type"
              control={form.control}
              render={({ field }) => (
                <RadioGroup
                  row
                  value={field.value}
                  onChange={(_, v) => {
                    field.onChange(v);
                    setPrintFiles([]);
                  }}
                >
                  <FormControlLabel value="repair" control={<Radio />} label="Ремонт" />
                  <FormControlLabel value="print" control={<Radio />} label="Печать" />
                </RadioGroup>
              )}
            />
          </FormControl>

          {serviceType === "repair" ? (
            <>
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                Устройство
              </Typography>
              <Box sx={{ display: "grid", gap: 2 }}>
                <Controller
                  name="device_type"
                  control={form.control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Тип устройства"
                      required
                      error={!!form.formState.errors.device_type}
                      helperText={form.formState.errors.device_type?.message}
                    >
                      {DEVICE_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <TextField label="Модель" {...form.register("device_model")} />
                <TextField label="Серийный номер" {...form.register("serial_number")} />
                <TextField
                  label="Неисправность"
                  required
                  multiline
                  minRows={3}
                  {...form.register("issue_description")}
                  error={!!form.formState.errors.issue_description}
                  helperText={form.formState.errors.issue_description?.message}
                />
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Быстрые шаблоны
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {["Не печатает", "Шумит", "Не включается"].map((t) => (
                      <Button key={t} size="small" variant="outlined" onClick={() => form.setValue("issue_description", t)}>
                        {t}
                      </Button>
                    ))}
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                Комплектация
              </Typography>
              <FormGroup row sx={{ flexWrap: "wrap", gap: 1 }}>
                {(
                  [
                    ["acc_power", "Блок питания"],
                    ["acc_usb", "USB кабель"],
                    ["acc_power_cable", "Кабель питания"],
                    ["acc_mouse", "Мышь"],
                    ["acc_keyboard", "Клавиатура"],
                    ["acc_cartridge", "Картридж"],
                  ] as const
                ).map(([name, label]) => (
                  <Controller
                    key={name}
                    name={name}
                    control={form.control}
                    render={({ field }) => (
                      <FormControlLabel control={<Checkbox checked={field.value} onChange={(_, c) => field.onChange(c)} />} label={label} />
                    )}
                  />
                ))}
              </FormGroup>
              <TextField label="Другое" fullWidth sx={{ mt: 1 }} {...form.register("acc_other")} />
            </>
          ) : (
            <>
              <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                Параметры печати
              </Typography>
              <Box sx={{ display: "grid", gap: 2 }}>
                <Controller
                  name="print_document_type"
                  control={form.control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      select
                      label="Тип документа"
                      required
                      error={!!form.formState.errors.print_document_type}
                      helperText={form.formState.errors.print_document_type?.message}
                    >
                      {PRINT_DOCUMENT_TYPES.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
                <TextField
                  label="Количество страниц / копий"
                  type="number"
                  inputProps={{ min: 1 }}
                  {...form.register("print_page_count", { valueAsNumber: true })}
                  error={!!form.formState.errors.print_page_count}
                  helperText={form.formState.errors.print_page_count?.message}
                />
                <FormControl component="fieldset">
                  <FormLabel component="legend">Цветность</FormLabel>
                  <Controller
                    name="print_color_mode"
                    control={form.control}
                    render={({ field }) => (
                      <RadioGroup row value={field.value} onChange={(_, v) => field.onChange(v)}>
                        <FormControlLabel value="bw" control={<Radio />} label="Чёрно-белая" />
                        <FormControlLabel value="color" control={<Radio />} label="Цветная" />
                      </RadioGroup>
                    )}
                  />
                </FormControl>
                <Controller
                  name="print_urgent"
                  control={form.control}
                  render={({ field }) => (
                    <FormControlLabel control={<Checkbox checked={field.value} onChange={(_, c) => field.onChange(c)} />} label="Срочный заказ" />
                  )}
                />
                <TextField
                  label="Особые пожелания"
                  multiline
                  minRows={2}
                  {...form.register("print_special_requests")}
                />
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Файлы для печати (необязательно)
                  </Typography>
                  <Button variant="outlined" component="label" disabled={submitting}>
                    Выбрать файлы
                    <input
                      type="file"
                      hidden
                      multiple
                      onChange={(e) => {
                        const list = e.target.files;
                        setPrintFiles(list ? Array.from(list) : []);
                      }}
                    />
                  </Button>
                  {printFiles.length > 0 ? (
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      {printFiles.map((f) => f.name).join(", ")}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                      Файлы будут загружены после создания заказа.
                    </Typography>
                  )}
                </Box>
              </Box>
            </>
          )}

          <Divider sx={{ my: 3 }} />
          <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
            Даты и стоимость
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label="Дата приёма" type="date" InputLabelProps={{ shrink: true }} {...form.register("received_date")} />
            <TextField
              label="Желаемая дата готовности"
              type="date"
              InputLabelProps={{ shrink: true }}
              {...form.register("desired_completion_date")}
            />
            <TextField label="Предварительная стоимость" {...form.register("preliminary_cost")} />
          </Box>

          <Divider sx={{ my: 3 }} />
          <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
            Назначение
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Принял: {auth.email ?? "—"}
          </Typography>
          <Controller
            name="assigned_master"
            control={form.control}
            render={({ field }) => (
              <TextField {...field} select label="Назначенный мастер" fullWidth>
                <MenuItem value="">Не назначен</MenuItem>
                {masters.map((m) => (
                  <MenuItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Сохранение…" : "Создать заказ"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../../lib/api";
import { getResults } from "../adminApi";
import type { NotifyFn } from "./UsersTab";

const schema = z.object({
  company_name: z.string().optional(),
  company_phone: z.string().optional(),
  company_address: z.string().optional(),
  company_working_hours: z.string().optional(),
  order_number_format: z.string().optional(),
  prophylaxis_days: z.number().int().min(1).max(3650),
  sms_enabled: z.boolean(),
  sms_api_key: z.string().optional(),
  sms_sender: z.string().optional(),
  sms_test_mode: z.boolean(),
});

type FormVals = z.infer<typeof schema>;

const KEY = {
  company_name: "company.name",
  company_phone: "company.phone",
  company_address: "company.address",
  company_working_hours: "company.working_hours",
  order_number_format: "order.number_format",
  prophylaxis_days: "prophylaxis.reminder_interval_days",
  sms_enabled: "sms.enabled",
  sms_api_key: "sms.api_key",
  sms_sender: "sms.sender",
  sms_test_mode: "sms.test_mode",
} as const;

function readStr(m: Record<string, unknown>, k: string) {
  const v = m[k];
  if (v === undefined || v === null) return "";
  return String(v);
}

function readNum(m: Record<string, unknown>, k: string, fallback: number) {
  const v = m[k];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function readBool(m: Record<string, unknown>, k: string) {
  const v = m[k];
  if (typeof v === "boolean") return v;
  if (v === "true" || v === true) return true;
  return false;
}

export function SettingsTab({ onNotify }: { onNotify: NotifyFn }) {
  const form = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: "",
      company_phone: "",
      company_address: "",
      company_working_hours: "",
      order_number_format: "",
      prophylaxis_days: 180,
      sms_enabled: false,
      sms_api_key: "",
      sms_sender: "",
      sms_test_mode: false,
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/admin/settings/");
        const rows = getResults<{ key: string; value: unknown }>(r.data);
        const map: Record<string, unknown> = {};
        for (const row of rows) map[row.key] = row.value;
        if (cancelled) return;
        form.reset({
          company_name: readStr(map, KEY.company_name),
          company_phone: readStr(map, KEY.company_phone),
          company_address: readStr(map, KEY.company_address),
          company_working_hours: readStr(map, KEY.company_working_hours),
          order_number_format: readStr(map, KEY.order_number_format),
          prophylaxis_days: readNum(map, KEY.prophylaxis_days, 180),
          sms_enabled: readBool(map, KEY.sms_enabled),
          sms_api_key: readStr(map, KEY.sms_api_key),
          sms_sender: readStr(map, KEY.sms_sender),
          sms_test_mode: readBool(map, KEY.sms_test_mode),
        });
      } catch {
        onNotify("Не удалось загрузить настройки", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form, onNotify]);

  const save = form.handleSubmit(async (vals) => {
    const entries: [string, unknown][] = [
      [KEY.company_name, vals.company_name ?? ""],
      [KEY.company_phone, vals.company_phone ?? ""],
      [KEY.company_address, vals.company_address ?? ""],
      [KEY.company_working_hours, vals.company_working_hours ?? ""],
      [KEY.order_number_format, vals.order_number_format ?? ""],
      [KEY.prophylaxis_days, Number.isFinite(vals.prophylaxis_days) ? vals.prophylaxis_days : 180],
      [KEY.sms_enabled, vals.sms_enabled],
      [KEY.sms_api_key, vals.sms_api_key ?? ""],
      [KEY.sms_sender, vals.sms_sender ?? ""],
      [KEY.sms_test_mode, vals.sms_test_mode],
    ];
    try {
      for (const [key, value] of entries) {
        await api.post("/admin/settings/", { key, value });
      }
      onNotify("Настройки сохранены", "success");
    } catch {
      onNotify("Ошибка сохранения настроек", "error");
    }
  });

  return (
    <Box sx={{ display: "grid", gap: 2, maxWidth: 720 }}>
      <Typography variant="subtitle1">Компания и заказы</Typography>
      <TextField label="Название компании" {...form.register("company_name")} fullWidth />
      <TextField label="Контактный телефон" {...form.register("company_phone")} fullWidth />
      <TextField label="Адрес" {...form.register("company_address")} fullWidth multiline minRows={2} />
      <TextField label="Рабочее время" {...form.register("company_working_hours")} fullWidth placeholder="Пн–Пт 9:00–18:00" />
      <TextField label="Формат номера заказа" {...form.register("order_number_format")} fullWidth placeholder="ORD-{year}-{seq}" />
      <TextField
        label="Дней до напоминания о профилактике"
        type="number"
        inputProps={{ min: 1, max: 3650 }}
        {...form.register("prophylaxis_days", { valueAsNumber: true })}
        fullWidth
      />

      <Typography variant="subtitle1" sx={{ mt: 1 }}>
        SMS (провайдер)
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={form.watch("sms_enabled")}
            onChange={(_, v) => form.setValue("sms_enabled", v)}
          />
        }
        label="Включить SMS-уведомления"
      />
      <TextField label="API-ключ" {...form.register("sms_api_key")} fullWidth type="password" autoComplete="off" />
      <TextField label="Отправитель (имя или номер)" {...form.register("sms_sender")} fullWidth />
      <FormControlLabel
        control={
          <Checkbox
            checked={form.watch("sms_test_mode")}
            onChange={(_, v) => form.setValue("sms_test_mode", v)}
          />
        }
        label="Тестовый режим (если поддерживается провайдером)"
      />

      <Box>
        <Button variant="contained" onClick={() => void save()}>
          Сохранить изменения
        </Button>
      </Box>
    </Box>
  );
}

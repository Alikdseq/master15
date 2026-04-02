import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getResults } from "../adminApi";
import type { NotifyFn } from "./UsersTab";

const SMS_TEMPLATE_KEYS = [
  {
    key: "sms.templates.order_ready",
    title: "Заказ готов",
    placeholders: ["{client_name}", "{order_number}"],
  },
  {
    key: "sms.templates.order_accepted",
    title: "Заказ принят",
    placeholders: ["{client_name}", "{order_number}"],
  },
  {
    key: "sms.templates.new_order_staff",
    title: "Новый заказ (сотрудникам)",
    placeholders: ["{order_number}"],
  },
  {
    key: "sms.templates.prophylaxis_reminder",
    title: "Напоминание о профилактике",
    placeholders: ["{client_name}"],
  },
  {
    key: "sms.templates.need_negotiation",
    title: "Требуется согласование",
    placeholders: ["{client_name}", "{order_number}"],
  },
] as const;

function extractText(v: unknown): string {
  if (v && typeof v === "object" && "text" in v && typeof (v as { text: unknown }).text === "string") {
    return (v as { text: string }).text;
  }
  if (typeof v === "string") return v;
  return "";
}

export function TemplatesTab({ onNotify }: { onNotify: NotifyFn }) {
  const [map, setMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/settings/");
      const rows = getResults<{ key: string; value: unknown }>(r.data);
      const next: Record<string, string> = {};
      for (const row of rows) {
        if (row.key.startsWith("sms.templates.")) {
          next[row.key] = extractText(row.value);
        }
      }
      for (const def of SMS_TEMPLATE_KEYS) {
        if (next[def.key] === undefined) next[def.key] = "";
      }
      setMap(next);
    } catch {
      onNotify("Не удалось загрузить шаблоны", "error");
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      for (const def of SMS_TEMPLATE_KEYS) {
        const text = map[def.key] ?? "";
        await api.post("/admin/settings/", { key: def.key, value: { text } });
      }
      onNotify("Шаблоны сохранены", "success");
      void load();
    } catch {
      onNotify("Ошибка сохранения шаблонов", "error");
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {SMS_TEMPLATE_KEYS.map((def) => (
        <Card key={def.key} variant="outlined">
          <CardContent sx={{ display: "grid", gap: 1 }}>
            <Typography variant="subtitle1">{def.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              Ключ: {def.key}
            </Typography>
            <TextField
              multiline
              minRows={3}
              value={map[def.key] ?? ""}
              onChange={(e) => setMap((m) => ({ ...m, [def.key]: e.target.value }))}
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              Плейсхолдеры: {def.placeholders.join(", ")}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              sx={{ alignSelf: "flex-start" }}
              onClick={() =>
                setPreview({
                  title: def.title,
                  text: (map[def.key] ?? "")
                    .replaceAll("{client_name}", "Иван Иванов")
                    .replaceAll("{order_number}", "MP-2025-001"),
                })
              }
            >
              Предпросмотр
            </Button>
          </CardContent>
        </Card>
      ))}

      <Button variant="contained" onClick={() => void save()}>
        Сохранить шаблоны
      </Button>

      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} fullWidth maxWidth="sm">
        <DialogTitle>Предпросмотр{preview ? `: ${preview.title}` : ""}</DialogTitle>
        <DialogContent>{preview ? <Typography sx={{ whiteSpace: "pre-wrap" }}>{preview.text}</Typography> : null}</DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

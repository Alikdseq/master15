import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getResults } from "../adminApi";
import type { NotifyFn } from "./UsersTab";

const AUTO_KEY = "backup.auto_settings";

type AutoSettings = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  time: string;
  keep_count: number;
};

const defaultAuto: AutoSettings = {
  enabled: false,
  frequency: "daily",
  time: "03:00",
  keep_count: 7,
};

export function BackupTab({ onNotify }: { onNotify: NotifyFn }) {
  const [backupName, setBackupName] = useState("");
  const [backupRunning, setBackupRunning] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [auto, setAuto] = useState<AutoSettings>(defaultAuto);

  const loadAuto = useCallback(async () => {
    try {
      const r = await api.get("/admin/settings/");
      const rows = getResults<{ key: string; value: unknown }>(r.data);
      const row = rows.find((x) => x.key === AUTO_KEY);
      if (row?.value && typeof row.value === "object") {
        setAuto({ ...defaultAuto, ...(row.value as AutoSettings) });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadAuto();
  }, [loadAuto]);

  const saveAuto = async () => {
    try {
      await api.post("/admin/settings/", { key: AUTO_KEY, value: auto });
      onNotify("Настройки резервного копирования сохранены", "success");
    } catch {
      onNotify("Не удалось сохранить настройки бэкапа", "error");
    }
  };

  const downloadBackup = async () => {
    if (!backupName) return;
    try {
      const r = await api.get("/admin/backups/download/", {
        params: { name: backupName },
        responseType: "blob",
      });
      const blob = new Blob([r.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onNotify("Скачивание началось", "success");
    } catch {
      onNotify("Ошибка скачивания бэкапа", "error");
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="subtitle1">Ручное резервное копирование</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Button
          variant="contained"
          disabled={backupRunning}
          onClick={async () => {
            setBackupRunning(true);
            try {
              const r = await api.post("/admin/backups/run/", {});
              const path = r.data?.path as string | undefined;
              if (path) setBackupName(path);
              onNotify(path ? `Бэкап создан: ${path}` : "Бэкап создан", "success");
            } catch {
              onNotify("Ошибка создания бэкапа", "error");
            } finally {
              setBackupRunning(false);
            }
          }}
        >
          {backupRunning ? "Создаём..." : "Создать бэкап сейчас"}
        </Button>
        <TextField
          label="Имя файла для скачивания / восстановления"
          value={backupName}
          onChange={(e) => setBackupName(e.target.value)}
          sx={{ minWidth: 320 }}
        />
        <Button variant="outlined" disabled={!backupName} onClick={() => void downloadBackup()}>
          Скачать
        </Button>
        <Button variant="outlined" color="warning" onClick={() => setRestoreOpen(true)}>
          Восстановить из бэкапа…
        </Button>
      </Box>

      <Typography variant="subtitle1" sx={{ mt: 1 }}>
        Автоматическое резервное копирование
      </Typography>
      <Alert severity="info">
        Планировщик на сервере может читать ключ <Box component="code">{AUTO_KEY}</Box> из системных настроек. Пока задача не настроена в Celery — блок служит для хранения параметров.
      </Alert>
      <FormControlLabel
        control={<Checkbox checked={auto.enabled} onChange={(_, v) => setAuto((a) => ({ ...a, enabled: v }))} />}
        label="Включить автоматические бэкапы"
      />
      <TextField
        select
        label="Периодичность"
        value={auto.frequency}
        onChange={(e) => setAuto((a) => ({ ...a, frequency: e.target.value as AutoSettings["frequency"] }))}
        sx={{ maxWidth: 280 }}
      >
        <MenuItem value="daily">Ежедневно</MenuItem>
        <MenuItem value="weekly">Еженедельно</MenuItem>
      </TextField>
      <TextField
        label="Время (локальное сервера)"
        type="time"
        value={auto.time}
        onChange={(e) => setAuto((a) => ({ ...a, time: e.target.value }))}
        InputLabelProps={{ shrink: true }}
        sx={{ maxWidth: 200 }}
      />
      <TextField
        label="Хранить копий"
        type="number"
        value={auto.keep_count}
        onChange={(e) => setAuto((a) => ({ ...a, keep_count: Math.max(1, Number(e.target.value) || 1) }))}
        sx={{ maxWidth: 200 }}
      />
      <Button variant="contained" onClick={() => void saveAuto()} sx={{ alignSelf: "flex-start" }}>
        Сохранить настройки
      </Button>

      <Dialog open={restoreOpen} onClose={() => setRestoreOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Восстановление из бэкапа</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          <Alert severity="warning">
            Вы можете восстановить из файла на сервере (по имени) или загрузить локальный JSON-файл.
          </Alert>
          <Button variant="outlined" component="label" sx={{ justifySelf: "start" }}>
            Выбрать локальный файл
            <input
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setRestoreFile(file);
                if (file?.name) {
                  setBackupName(file.name);
                }
              }}
            />
          </Button>
          {restoreFile ? (
            <Typography variant="body2">
              Локальный файл: <strong>{restoreFile.name}</strong>
            </Typography>
          ) : null}
          <Typography variant="body2">
            Имя файла на сервере: <strong>{backupName || "—"}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setRestoreOpen(false);
              setRestoreFile(null);
            }}
          >
            Отмена
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              try {
                if (restoreFile) {
                  const fd = new FormData();
                  fd.append("file", restoreFile);
                  await api.post("/admin/backups/restore/", fd, {
                    headers: { "Content-Type": "multipart/form-data" },
                  });
                } else {
                  if (!backupName) {
                    onNotify("Укажите имя файла бэкапа", "error");
                    return;
                  }
                  await api.post("/admin/backups/restore/", { name: backupName });
                }
                onNotify("Восстановление выполнено", "success");
                setRestoreOpen(false);
                setRestoreFile(null);
              } catch {
                onNotify("Ошибка восстановления", "error");
              }
            }}
          >
            Подтвердить восстановление
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

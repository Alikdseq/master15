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
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { getResults } from "../adminApi";
import type { NotifyFn } from "./UsersTab";

type StatusRow = {
  id: number;
  code: string;
  name: string;
  sort_index: number;
  color: string;
  visible_to_client: boolean;
  is_final: boolean;
  is_active: boolean;
};

type TransitionRow = {
  id: number;
  from_status: number;
  to_status: number;
  is_enabled: boolean;
};

export function StatusesTab({ onNotify }: { onNotify: NotifyFn }) {
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [transitions, setTransitions] = useState<TransitionRow[]>([]);
  const [graphValidating, setGraphValidating] = useState(false);
  const [graphErrors, setGraphErrors] = useState<string[]>([]);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogMode, setStatusDialogMode] = useState<"create" | "edit">("create");
  const [statusDraft, setStatusDraft] = useState<Partial<StatusRow>>({
    code: "",
    name: "",
    sort_index: 0,
    color: "#1A56A3",
    visible_to_client: true,
    is_final: false,
    is_active: true,
  });

  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false);
  const [transitionDialogMode, setTransitionDialogMode] = useState<"create" | "edit">("create");
  const [transitionDraft, setTransitionDraft] = useState<{
    id: number | null;
    from_status: number | null;
    to_status: number | null;
    is_enabled: boolean;
  }>({ id: null, from_status: null, to_status: null, is_enabled: true });

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.get("/admin/order-statuses/"), api.get("/admin/order-status-transitions/")]);
      setStatuses(getResults<StatusRow>(s.data));
      setTransitions(getResults<TransitionRow>(t.data));
    } catch {
      onNotify("Ошибка загрузки статусов", "error");
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  const statusColumns: GridColDef<StatusRow>[] = useMemo(
    () => [
      { field: "code", headerName: "Код", width: 120 },
      { field: "name", headerName: "Название", flex: 1, minWidth: 160 },
      {
        field: "color",
        headerName: "Цвет",
        width: 100,
        renderCell: (p) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                bgcolor: p.row.color || "#ccc",
                border: "1px solid",
                borderColor: "divider",
              }}
            />
          </Box>
        ),
      },
      { field: "sort_index", headerName: "Порядок", width: 100 },
      {
        field: "visible_to_client",
        headerName: "Клиенту",
        width: 110,
        renderCell: (p) => (p.row.visible_to_client ? "Да" : "Нет"),
      },
      {
        field: "is_final",
        headerName: "Финальный",
        width: 110,
        renderCell: (p) => (p.row.is_final ? "Да" : "—"),
      },
      {
        field: "is_active",
        headerName: "Активен",
        width: 100,
        renderCell: (p) => (p.row.is_active ? "Да" : "—"),
      },
      {
        field: "actions",
        headerName: "",
        width: 140,
        sortable: false,
        renderCell: (p) => (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setStatusDialogMode("edit");
              setStatusDraft({ ...p.row });
              setStatusDialogOpen(true);
            }}
          >
            Редактировать
          </Button>
        ),
      },
    ],
    []
  );

  const transitionColumns: GridColDef<TransitionRow>[] = useMemo(
    () => [
      {
        field: "from_code",
        headerName: "Из",
        width: 160,
        valueGetter: (_v, r) => statusById.get(r.from_status)?.code ?? "—",
      },
      {
        field: "to_code",
        headerName: "В",
        width: 160,
        valueGetter: (_v, r) => statusById.get(r.to_status)?.code ?? "—",
      },
      {
        field: "is_enabled",
        headerName: "Включен",
        width: 140,
        renderCell: (p) => (p.row.is_enabled ? "Да" : "Нет"),
      },
      {
        field: "actions",
        headerName: "",
        width: 160,
        sortable: false,
        renderCell: (p) => (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setTransitionDialogMode("edit");
              setTransitionDraft(p.row);
              setTransitionDialogOpen(true);
            }}
          >
            Изменить
          </Button>
        ),
      },
    ],
    [statusById]
  );

  const handleValidateGraph = async () => {
    setGraphValidating(true);
    setGraphErrors([]);
    try {
      const r = await api.post("/admin/order-statuses/validate/", {});
      if (r.data?.valid) {
        onNotify("Граф статусов валиден", "success");
      } else {
        setGraphErrors(r.data?.errors ?? []);
      }
    } catch {
      setGraphErrors(["Ошибка проверки графа"]);
    } finally {
      setGraphValidating(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="subtitle1">Статусы заказов</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={() => {
              setStatusDialogMode("create");
              setStatusDraft({
                code: "",
                name: "",
                sort_index: 0,
                color: "#1A56A3",
                visible_to_client: true,
                is_final: false,
                is_active: true,
              });
              setStatusDialogOpen(true);
            }}
          >
            + Добавить статус
          </Button>
          <Button variant="outlined" onClick={() => void handleValidateGraph()} disabled={graphValidating}>
            {graphValidating ? "Проверка..." : "Проверить граф"}
          </Button>
        </Box>
      </Box>

      {graphErrors.length ? (
        <Alert severity="error">
          {graphErrors.map((e, idx) => (
            <div key={idx}>{e}</div>
          ))}
        </Alert>
      ) : null}

      <Box sx={{ height: 360, width: "100%" }}>
        <DataGrid rows={statuses} columns={statusColumns} getRowId={(r) => r.id} />
      </Box>

      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mt: 1 }}>
        <Typography variant="subtitle1">Переходы между статусами</Typography>
        <Button
          variant="contained"
          onClick={() => {
            const first = statuses[0]?.id ?? null;
            const second = statuses[1]?.id ?? null;
            setTransitionDialogMode("create");
            setTransitionDraft({ id: null, from_status: first, to_status: second, is_enabled: true });
            setTransitionDialogOpen(true);
          }}
        >
          + Добавить переход
        </Button>
      </Box>

      <Box sx={{ height: 300, width: "100%" }}>
        <DataGrid rows={transitions} columns={transitionColumns} getRowId={(r) => r.id} />
      </Box>

      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{statusDialogMode === "create" ? "Добавить статус" : "Редактировать статус"}</DialogTitle>
        <DialogContent sx={{ pt: 2, display: "grid", gap: 2 }}>
          {statusDialogMode === "create" ? (
            <TextField label="Код" value={statusDraft.code ?? ""} onChange={(e) => setStatusDraft((d) => ({ ...d, code: e.target.value }))} />
          ) : (
            <TextField label="Код" value={statusDraft.code ?? ""} disabled />
          )}
          <TextField label="Название" value={statusDraft.name ?? ""} onChange={(e) => setStatusDraft((d) => ({ ...d, name: e.target.value }))} />
          <TextField
            label="Порядок"
            type="number"
            value={statusDraft.sort_index ?? 0}
            onChange={(e) => setStatusDraft((d) => ({ ...d, sort_index: Number(e.target.value) }))}
          />
          <TextField
            label="Цвет"
            type="color"
            value={statusDraft.color ?? "#1A56A3"}
            onChange={(e) => setStatusDraft((d) => ({ ...d, color: e.target.value }))}
            sx={{ maxWidth: 120 }}
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(statusDraft.visible_to_client)}
                onChange={(e) => setStatusDraft((d) => ({ ...d, visible_to_client: e.target.checked }))}
              />
            }
            label="Видимость клиенту"
          />
          <FormControlLabel
            control={<Checkbox checked={Boolean(statusDraft.is_active)} onChange={(e) => setStatusDraft((d) => ({ ...d, is_active: e.target.checked }))} />}
            label="Активен"
          />
          <FormControlLabel
            control={<Checkbox checked={Boolean(statusDraft.is_final)} onChange={(e) => setStatusDraft((d) => ({ ...d, is_final: e.target.checked }))} />}
            label="Финальный статус"
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setStatusDialogOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                const payload = {
                  code: statusDraft.code,
                  name: statusDraft.name,
                  sort_index: statusDraft.sort_index ?? 0,
                  color: statusDraft.color ?? "#1A56A3",
                  visible_to_client: Boolean(statusDraft.visible_to_client),
                  is_final: Boolean(statusDraft.is_final),
                  is_active: Boolean(statusDraft.is_active),
                };
                if (statusDialogMode === "create") {
                  await api.post("/admin/order-statuses/", payload);
                  onNotify("Статус создан", "success");
                } else if (statusDraft.id) {
                  await api.patch(`/admin/order-statuses/${statusDraft.id}/`, payload);
                  onNotify("Статус обновлён", "success");
                }
                setStatusDialogOpen(false);
                setGraphErrors([]);
                await load();
              } catch {
                onNotify("Ошибка сохранения статуса", "error");
              }
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={transitionDialogOpen} onClose={() => setTransitionDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{transitionDialogMode === "create" ? "Добавить переход" : "Редактировать переход"}</DialogTitle>
        <DialogContent sx={{ pt: 2, display: "grid", gap: 2 }}>
          <TextField
            select
            label="Из статуса"
            value={transitionDraft.from_status ?? ""}
            onChange={(e) => setTransitionDraft((d) => ({ ...d, from_status: Number(e.target.value) }))}
          >
            {statuses.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.code} · {s.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="В статус"
            value={transitionDraft.to_status ?? ""}
            onChange={(e) => setTransitionDraft((d) => ({ ...d, to_status: Number(e.target.value) }))}
          >
            {statuses.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.code} · {s.name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(transitionDraft.is_enabled)}
                onChange={(e) => setTransitionDraft((d) => ({ ...d, is_enabled: e.target.checked }))}
              />
            }
            label="Разрешён"
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setTransitionDialogOpen(false)}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                const payload = {
                  from_status: transitionDraft.from_status,
                  to_status: transitionDraft.to_status,
                  is_enabled: Boolean(transitionDraft.is_enabled),
                };
                if (transitionDialogMode === "create") {
                  await api.post("/admin/order-status-transitions/", payload);
                  onNotify("Переход создан", "success");
                } else if (transitionDraft.id) {
                  await api.patch(`/admin/order-status-transitions/${transitionDraft.id}/`, payload);
                  onNotify("Переход обновлён", "success");
                }
                setTransitionDialogOpen(false);
                await load();
              } catch {
                onNotify("Ошибка сохранения перехода", "error");
              }
            }}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

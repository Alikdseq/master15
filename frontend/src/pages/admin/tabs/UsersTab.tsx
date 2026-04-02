import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef, GridPaginationModel } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../../lib/api";
import { getCount, getResults } from "../adminApi";

export type NotifyFn = (message: string, severity?: "success" | "error" | "info") => void;

type UserRow = {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: "admin" | "manager" | "master";
  is_active: boolean;
  last_login: string | null;
};

const createSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().min(1, "Укажите имя"),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "master"]),
  password: z.string().min(8, "Минимум 8 символов"),
  is_active: z.boolean(),
});

const editSchema = z.object({
  email: z.string().email("Некорректный email"),
  name: z.string().min(1, "Укажите имя"),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "master"]),
  is_active: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

function formatDt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

export function UsersTab({ onNotify }: { onNotify: NotifyFn }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: paginationModel.page + 1,
        page_size: paginationModel.pageSize,
      };
      if (roleFilter) params.role = roleFilter;
      if (search.trim()) params.search = search.trim();
      const r = await api.get("/users/", { params });
      setRows(getResults<UserRow>(r.data));
      setRowCount(getCount(r.data));
    } catch (e) {
      onNotify("Не удалось загрузить пользователей", "error");
      setRows([]);
      setRowCount(0);
    } finally {
      setLoading(false);
    }
  }, [onNotify, paginationModel.page, paginationModel.pageSize, roleFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPaginationModel((m) => ({ ...m, page: 0 }));
  }, [roleFilter]);

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      email: "",
      name: "",
      phone: "",
      role: "manager",
      password: "",
      is_active: true,
    },
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      email: "",
      name: "",
      phone: "",
      role: "manager",
      is_active: true,
    },
  });

  const openEdit = useCallback(
    (row: UserRow) => {
      setEditing(row);
      editForm.reset({
        email: row.email,
        name: row.name,
        phone: row.phone ?? "",
        role: row.role,
        is_active: row.is_active,
      });
      setEditOpen(true);
    },
    [editForm]
  );

  const columns: GridColDef<UserRow>[] = useMemo(
    () => [
      { field: "name", headerName: "Имя", flex: 1, minWidth: 160 },
      { field: "email", headerName: "Email", flex: 1, minWidth: 200 },
      { field: "role", headerName: "Роль", width: 120 },
      { field: "phone", headerName: "Телефон", width: 140 },
      {
        field: "last_login",
        headerName: "Последний вход",
        width: 170,
        valueGetter: (_v, row) => formatDt(row.last_login),
      },
      {
        field: "is_active",
        headerName: "Активен",
        width: 100,
        type: "boolean",
      },
      {
        field: "actions",
        headerName: "Действия",
        width: 320,
        sortable: false,
        renderCell: (p) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, py: 0.5 }}>
            <Button size="small" variant="outlined" onClick={() => openEdit(p.row)}>
              Изменить
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setResetTarget(p.row);
                setResetOpen(true);
              }}
            >
              Сбросить пароль
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={async () => {
                try {
                  await api.patch(`/users/${p.row.id}/`, { is_active: !p.row.is_active });
                  onNotify(p.row.is_active ? "Пользователь заблокирован" : "Пользователь разблокирован", "success");
                  void load();
                } catch {
                  onNotify("Ошибка смены статуса", "error");
                }
              }}
            >
              {p.row.is_active ? "Блокировать" : "Разблокировать"}
            </Button>
            <Button
              size="small"
              color="error"
              variant="text"
              onClick={() => {
                setDeleteTarget(p.row);
                setDeleteOpen(true);
              }}
            >
              Удалить
            </Button>
          </Box>
        ),
      },
    ],
    [load, onNotify, openEdit]
  );

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-end" }}>
        <TextField
          select
          label="Роль"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">Все</MenuItem>
          <MenuItem value="admin">admin</MenuItem>
          <MenuItem value="manager">manager</MenuItem>
          <MenuItem value="master">master</MenuItem>
        </TextField>
        <TextField
          label="Поиск (имя, email)"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          sx={{ minWidth: 260 }}
        />
        <Button
          variant="contained"
          onClick={() => {
            setSearch(searchDraft);
            setPaginationModel((m) => ({ ...m, page: 0 }));
          }}
        >
          Применить
        </Button>
        <Button variant="outlined" onClick={() => void load()}>
          Обновить
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={() => {
            createForm.reset({
              email: "",
              name: "",
              phone: "",
              role: "manager",
              password: "",
              is_active: true,
            });
            setCreateOpen(true);
          }}
        >
          Добавить пользователя
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary">
        Список пользователей (серверная пагинация и фильтры).
      </Typography>

      <Box sx={{ width: "100%", height: 520 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(r) => r.id}
          rowCount={rowCount}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
        />
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Новый пользователь</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          <TextField label="Email" {...createForm.register("email")} error={!!createForm.formState.errors.email} helperText={createForm.formState.errors.email?.message} />
          <TextField label="Имя" {...createForm.register("name")} error={!!createForm.formState.errors.name} helperText={createForm.formState.errors.name?.message} />
          <TextField label="Телефон" {...createForm.register("phone")} />
          <TextField
            select
            label="Роль"
            value={createForm.watch("role")}
            onChange={(e) => createForm.setValue("role", e.target.value as CreateForm["role"])}
          >
            <MenuItem value="admin">admin</MenuItem>
            <MenuItem value="manager">manager</MenuItem>
            <MenuItem value="master">master</MenuItem>
          </TextField>
          <TextField
            type="password"
            label="Пароль"
            {...createForm.register("password")}
            error={!!createForm.formState.errors.password}
            helperText={createForm.formState.errors.password?.message}
          />
          <FormControlLabel
            control={
              <Switch
                checked={createForm.watch("is_active")}
                onChange={(_, v) => createForm.setValue("is_active", v)}
              />
            }
            label="Активен"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={createForm.handleSubmit(async (vals) => {
              try {
                await api.post("/users/", vals);
                onNotify("Пользователь создан", "success");
                setCreateOpen(false);
                void load();
              } catch {
                onNotify("Ошибка создания пользователя", "error");
              }
            })}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Редактирование</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          <TextField label="Email" {...editForm.register("email")} error={!!editForm.formState.errors.email} helperText={editForm.formState.errors.email?.message} />
          <TextField label="Имя" {...editForm.register("name")} error={!!editForm.formState.errors.name} helperText={editForm.formState.errors.name?.message} />
          <TextField label="Телефон" {...editForm.register("phone")} />
          <TextField
            select
            label="Роль"
            value={editForm.watch("role")}
            onChange={(e) => editForm.setValue("role", e.target.value as EditForm["role"])}
          >
            <MenuItem value="admin">admin</MenuItem>
            <MenuItem value="manager">manager</MenuItem>
            <MenuItem value="master">master</MenuItem>
          </TextField>
          <FormControlLabel
            control={
              <Switch checked={editForm.watch("is_active")} onChange={(_, v) => editForm.setValue("is_active", v)} />
            }
            label="Активен"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={editForm.handleSubmit(async (vals) => {
              if (!editing) return;
              try {
                await api.patch(`/users/${editing.id}/`, vals);
                onNotify("Сохранено", "success");
                setEditOpen(false);
                void load();
              } catch {
                onNotify("Ошибка сохранения", "error");
              }
            })}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)}>
        <DialogTitle>Сбросить пароль?</DialogTitle>
        <DialogContent>
          {resetTarget ? (
            <Alert severity="warning">
              Будет сгенерирован временный пароль для <strong>{resetTarget.email}</strong>. Сообщите его пользователю.
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (!resetTarget) return;
              try {
                const r = await api.post(`/users/${resetTarget.id}/reset-password/`, {});
                const pwd = r.data?.temporary_password as string | undefined;
                onNotify(pwd ? `Временный пароль: ${pwd}` : "Пароль сброшен", "info");
                setResetOpen(false);
              } catch {
                onNotify("Ошибка сброса пароля", "error");
              }
            }}
          >
            Сбросить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Удалить пользователя?</DialogTitle>
        <DialogContent>
          {deleteTarget ? <Typography>Удалить {deleteTarget.email} безвозвратно?</Typography> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Отмена</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await api.delete(`/users/${deleteTarget.id}/`);
                onNotify("Пользователь удалён", "success");
                setDeleteOpen(false);
                void load();
              } catch {
                onNotify("Ошибка удаления", "error");
              }
            }}
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

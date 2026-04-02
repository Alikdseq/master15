import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link as RouterLink } from "react-router-dom";
import { api } from "../../lib/api";
import { PageHeader } from "../../ui/PageHeader";
import type { InventoryCategoryRow } from "./inventoryTypes";

const categorySchema = z.object({
  name: z.string().min(1, "Укажите название").max(255),
});

type CategoryForm = z.infer<typeof categorySchema>;

function extractApiError(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data;
  if (typeof d?.detail === "string") return d.detail;
  return "Ошибка запроса";
}

export function InventoryCategoriesPage() {
  const [rows, setRows] = useState<InventoryCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryCategoryRow | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get("/inventory/categories/", { params: { page_size: 200 } });
      const data = r.data;
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setRows(list as InventoryCategoryRow[]);
    } catch {
      setError("Не удалось загрузить категории");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: InventoryCategoryRow) => {
    setEditing(c);
    form.reset({ name: c.name });
    setDialogOpen(true);
  };

  const save = form.handleSubmit(async (values) => {
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/inventory/categories/${editing.id}/`, { name: values.name.trim(), parent: editing.parent });
        setSnack("Категория сохранена");
      } else {
        await api.post("/inventory/categories/", { name: values.name.trim(), parent: null });
        setSnack("Категория создана");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setSnack(extractApiError(e));
    } finally {
      setBusy(false);
    }
  });

  const remove = async (c: InventoryCategoryRow) => {
    if (!window.confirm(`Удалить категорию «${c.name}»?`)) return;
    try {
      await api.delete(`/inventory/categories/${c.id}/`);
      setSnack("Категория удалена");
      await load();
    } catch (e) {
      setSnack(extractApiError(e));
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <PageHeader
        title="Категории склада"
        subtitle="Управление категориями товаров"
        rightSlot={
          <Button component={RouterLink} to="/inventory" variant="outlined" size="small">
            К списку товаров
          </Button>
        }
      />

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Новая категория
        </Button>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {loading ? (
        <Skeleton variant="rounded" height={240} />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell width={140}>Товаров</TableCell>
              <TableCell width={120} align="right">
                Действия
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary">Нет категорий</Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.product_count ?? "—"}</TableCell>
                  <TableCell align="right">
                    <IconButton aria-label="Редактировать" size="small" onClick={() => openEdit(c)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton aria-label="Удалить" size="small" onClick={() => void remove(c)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onClose={busy ? undefined : () => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? "Редактирование" : "Новая категория"}</DialogTitle>
        <DialogContent>
          <TextField
            label="Название"
            fullWidth
            sx={{ mt: 1 }}
            {...form.register("name")}
            error={!!form.formState.errors.name}
            helperText={form.formState.errors.name?.message}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={busy}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void save()} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)} message={snack ?? ""} />
    </Paper>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import type { InventoryCategoryRow } from "../inventoryTypes";
import { UNITS } from "../exportInventoryXlsx";

const createSchema = z.object({
  sku: z.string().min(1, "Артикул обязателен").max(64),
  name: z.string().min(1, "Наименование обязательно"),
  category: z.coerce.number().int().positive("Выберите категорию"),
  unit: z.string().min(1),
  min_stock: z
    .string()
    .min(1)
    .refine((s) => {
      const n = Number(String(s).replace(",", "."));
      return !Number.isNaN(n) && n >= 0;
    }, "Некорректное число"),
  purchase_price: z.string().optional(),
  selling_price: z.string().optional(),
});

const editSchema = createSchema.omit({ sku: true });

export type ProductFormCreateValues = z.infer<typeof createSchema>;
export type ProductFormEditValues = z.infer<typeof editSchema>;

type Props = {
  open: boolean;
  mode: "create" | "edit";
  categories: InventoryCategoryRow[];
  initial?: {
    id: number;
    sku: string;
    name: string;
    category: number;
    unit: string;
    min_stock: string;
    purchase_price: string | null;
    selling_price: string | null;
  } | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

function emptyToNull(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}

export function ProductFormModal({
  open,
  mode,
  categories,
  initial,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const isCreate = mode === "create";
  const schema = isCreate ? createSchema : editSchema;

  const form = useForm<any>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      sku: "",
      name: "",
      category: 0,
      unit: "шт",
      min_stock: "0",
      purchase_price: "",
      selling_price: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (initial && !isCreate) {
      form.reset({
        name: initial.name,
        category: initial.category,
        unit: initial.unit,
        min_stock: String(initial.min_stock),
        purchase_price: initial.purchase_price ?? "",
        selling_price: initial.selling_price ?? "",
      });
    } else if (isCreate) {
      form.reset({
        sku: "",
        name: "",
        category: categories[0]?.id ?? 0,
        unit: "шт",
        min_stock: "0",
        purchase_price: "",
        selling_price: "",
      });
    }
  }, [open, initial, isCreate, categories, form]);

  useEffect(() => {
    if (!open || !isCreate || !categories.length) return;
    const cur = form.getValues("category");
    if (!cur || cur === 0) {
      form.setValue("category", categories[0]!.id);
    }
  }, [open, isCreate, categories, form]);

  const handleSave = form.handleSubmit(async (values) => {
    if (isCreate) {
      const v = values as ProductFormCreateValues;
      await onSubmit({
        sku: v.sku.trim(),
        name: v.name.trim(),
        category: v.category,
        unit: v.unit,
        min_stock: v.min_stock,
        purchase_price: emptyToNull(v.purchase_price),
        selling_price: emptyToNull(v.selling_price),
      });
    } else {
      const v = values as ProductFormEditValues;
      await onSubmit({
        name: v.name.trim(),
        category: v.category,
        unit: v.unit,
        min_stock: v.min_stock,
        purchase_price: emptyToNull(v.purchase_price),
        selling_price: emptyToNull(v.selling_price),
      });
    }
  });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isCreate ? "Новый товар" : "Редактирование товара"}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {isCreate ? (
          <Controller
            name="sku"
            control={form.control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Артикул"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                fullWidth
              />
            )}
          />
        ) : initial ? (
          <TextField label="Артикул" value={initial.sku} disabled fullWidth />
        ) : null}

        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Наименование"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              fullWidth
            />
          )}
        />

        <Controller
          name="category"
          control={form.control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Категория"
              select
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              fullWidth
            >
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />

        <Controller
          name="unit"
          control={form.control}
          render={({ field, fieldState }) => (
            <TextField {...field} label="Единица измерения" select error={!!fieldState.error} fullWidth>
              {UNITS.map((u) => (
                <MenuItem key={u} value={u}>
                  {u}
                </MenuItem>
              ))}
            </TextField>
          )}
        />

        <Controller
          name="min_stock"
          control={form.control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Минимальный остаток"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              fullWidth
            />
          )}
        />

        <Controller
          name="purchase_price"
          control={form.control}
          render={({ field }) => (
            <TextField {...field} label="Закупочная цена" type="number" inputProps={{ step: "0.01" }} fullWidth />
          )}
        />

        <Controller
          name="selling_price"
          control={form.control}
          render={({ field }) => (
            <TextField {...field} label="Цена продажи" type="number" inputProps={{ step: "0.01" }} fullWidth />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={busy}>
          {busy ? "Сохранение…" : "Сохранить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

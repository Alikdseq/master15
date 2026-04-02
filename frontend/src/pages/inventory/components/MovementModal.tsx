import { zodResolver } from "@hookform/resolvers/zod";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../../lib/api";
import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import type { InventoryProduct } from "../inventoryTypes";

const productPick = z
  .object({ id: z.number(), sku: z.string(), name: z.string() })
  .passthrough();

const inSchema = z.object({
  product: productPick.nullable().refine((v) => v !== null, { message: "Выберите товар" }),
  quantity: z
    .string()
    .min(1)
    .refine((s) => {
      const n = Number(String(s).replace(",", "."));
      return !Number.isNaN(n) && n > 0;
    }, "Количество должно быть больше 0"),
  comment: z.string().optional(),
});

const outSchema = inSchema.extend({
  reason_code: z.enum(["damage", "loss", "inventory", "other"]),
});

type InForm = z.infer<typeof inSchema>;
type OutForm = z.infer<typeof outSchema>;

const REASON_OPTIONS: Array<{ value: OutForm["reason_code"]; label: string }> = [
  { value: "damage", label: "Порча" },
  { value: "loss", label: "Утеря" },
  { value: "inventory", label: "Инвентаризация" },
  { value: "other", label: "Другое" },
];

type Props = {
  open: boolean;
  kind: "in" | "out";
  presetProduct: InventoryProduct | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function MovementModal({ open, kind, presetProduct, onClose, onSuccess, onError }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<InventoryProduct[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const isOut = kind === "out";
  const schema = isOut ? outSchema : inSchema;

  const form = useForm<any>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      product: null,
      quantity: "1",
      comment: "",
      ...(isOut ? { reason_code: "other" as const } : {}),
    },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      product: presetProduct,
      quantity: "1",
      comment: "",
      ...(isOut ? { reason_code: "other" } : {}),
    });
    setSearchInput("");
  }, [open, presetProduct, isOut, form]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const r = await api.get("/inventory/products/", {
          params: { search: debouncedSearch.trim() || undefined, page_size: 25 },
        });
        if (!active) return;
        const list = (r.data.results ?? []) as InventoryProduct[];
        if (presetProduct && !list.some((x) => x.id === presetProduct.id)) {
          setOptions([presetProduct, ...list]);
        } else {
          setOptions(list);
        }
      } catch {
        if (active) setOptions(presetProduct ? [presetProduct] : []);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, debouncedSearch, presetProduct]);

  const submit = form.handleSubmit(async (raw) => {
    const product = raw.product as InventoryProduct;
    if (!product) return;
    setSubmitting(true);
    try {
      if (kind === "in") {
        const v = raw as InForm;
        await api.post("/inventory/movements/in/", {
          product: product.id,
          quantity: v.quantity,
          comment: v.comment?.trim() ?? "",
        });
      } else {
        const v = raw as OutForm;
        await api.post("/inventory/movements/out/", {
          product: product.id,
          quantity: v.quantity,
          comment: v.comment?.trim() ?? "",
          reason_code: v.reason_code,
        });
      }
      onSuccess();
    } catch (e) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      onError(typeof d === "string" ? d : "Не удалось выполнить операцию");
    } finally {
      setSubmitting(false);
    }
  });

  const busy = submitting;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{kind === "in" ? "Поступление" : "Списание"}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <Controller
          name="product"
          control={form.control}
          render={({ field, fieldState }) => (
            <Autocomplete
              options={options}
              value={field.value}
              onChange={(_, v) => field.onChange(v)}
              inputValue={searchInput}
              onInputChange={(_, v) => setSearchInput(v)}
              getOptionLabel={(o) => `${o.sku} — ${o.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Товар"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          )}
        />

        <Controller
          name="quantity"
          control={form.control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Количество"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              fullWidth
            />
          )}
        />

        {isOut ? (
          <Controller
            name="reason_code"
            control={form.control}
            render={({ field }) => (
              <TextField {...field} label="Причина списания" select fullWidth>
                {REASON_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        ) : null}

        <Controller
          name="comment"
          control={form.control}
          render={({ field }) => <TextField {...field} label="Комментарий" multiline minRows={2} fullWidth />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          {busy ? "Отправка…" : "Выполнить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

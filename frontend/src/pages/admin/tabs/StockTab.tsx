import { Alert, Box, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getResults } from "../adminApi";
import type { NotifyFn } from "./UsersTab";

const KEY = {
  globalMin: "stock.global_default_min",
  categoryThresholds: "stock.category_thresholds",
  trackPurchase: "stock.track_purchase_prices",
  notifyLow: "stock.notify_low_stock",
} as const;

type ProductRow = {
  id: number;
  name: string;
  sku: string;
  current_stock: string | number;
  min_stock: string | number;
};

type CategoryRow = { id: number; name: string };

function readNumSetting(v: unknown, fallback: number) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function readRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(val);
    if (!Number.isNaN(n)) out[k] = n;
  }
  return out;
}

export function StockTab({ onNotify }: { onNotify: NotifyFn }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [minStockDraft, setMinStockDraft] = useState<Record<number, string>>({});
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [globalMin, setGlobalMin] = useState("0");
  const [catDraft, setCatDraft] = useState<Record<number, string>>({});
  const [trackPurchase, setTrackPurchase] = useState(false);
  const [notifyLow, setNotifyLow] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, p, c] = await Promise.all([
        api.get("/admin/settings/"),
        api.get("/inventory/products/stock-report/"),
        api.get("/inventory/categories/"),
      ]);
      const rows = getResults<{ key: string; value: unknown }>(st.data);
      const map: Record<string, unknown> = {};
      for (const row of rows) map[row.key] = row.value;

      setGlobalMin(String(readNumSetting(map[KEY.globalMin], 0)));
      const thresholds = readRecord(map[KEY.categoryThresholds]);
      const cats = getResults<CategoryRow>(c.data);
      setCategories(cats);
      const cd: Record<number, string> = {};
      for (const cat of cats) {
        cd[cat.id] = thresholds[String(cat.id)] !== undefined ? String(thresholds[String(cat.id)]) : "";
      }
      setCatDraft(cd);

      setTrackPurchase(Boolean(map[KEY.trackPurchase]));
      setNotifyLow(Boolean(map[KEY.notifyLow]));

      const pr = getResults<ProductRow>(p.data);
      setProducts(pr);
      const draft: Record<number, string> = {};
      for (const row of pr) draft[row.id] = String(row.min_stock ?? "");
      setMinStockDraft(draft);
    } catch {
      onNotify("Ошибка загрузки данных склада", "error");
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    try {
      const thresholds: Record<string, number> = {};
      for (const cat of categories) {
        const raw = catDraft[cat.id]?.trim();
        if (raw === "") continue;
        const n = Number(raw);
        if (!Number.isNaN(n)) thresholds[String(cat.id)] = n;
      }
      await api.post("/admin/settings/", { key: KEY.globalMin, value: Number(globalMin) || 0 });
      await api.post("/admin/settings/", { key: KEY.categoryThresholds, value: thresholds });
      await api.post("/admin/settings/", { key: KEY.trackPurchase, value: trackPurchase });
      await api.post("/admin/settings/", { key: KEY.notifyLow, value: notifyLow });
      onNotify("Настройки склада сохранены", "success");
    } catch {
      onNotify("Ошибка сохранения настроек", "error");
    }
  };

  const saveProducts = async () => {
    try {
      const items = Object.entries(minStockDraft).map(([id, v]) => ({
        product: Number(id),
        min_stock: v,
      }));
      await api.post("/inventory/products/bulk-update-min-stock/", { items });
      onNotify("Пороги по товарам сохранены", "success");
      void load();
    } catch {
      onNotify("Ошибка сохранения порогов", "error");
    }
  };

  const columns: GridColDef<ProductRow>[] = [
    { field: "name", headerName: "Товар", flex: 1, minWidth: 220 },
    { field: "sku", headerName: "SKU", width: 140 },
    { field: "current_stock", headerName: "Остаток", width: 130 },
    {
      field: "min_stock",
      headerName: "Порог",
      width: 140,
      sortable: false,
      renderCell: (p) => (
        <TextField
          size="small"
          value={minStockDraft[p.row.id] ?? p.row.min_stock ?? ""}
          onChange={(e) => setMinStockDraft((d) => ({ ...d, [p.row.id]: e.target.value }))}
        />
      ),
    },
  ];

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="subtitle1">Глобальные и категорийные пороги</Typography>
      <Alert severity="info">
        Значения ниже хранятся в системных настройках (stock.*). Пороги по конкретным товарам — в таблице ниже.
      </Alert>
      <TextField
        label="Глобальный порог по умолчанию (число)"
        value={globalMin}
        onChange={(e) => setGlobalMin(e.target.value)}
        sx={{ maxWidth: 360 }}
        type="number"
      />
      <FormControlLabel
        control={<Checkbox checked={trackPurchase} onChange={(_, v) => setTrackPurchase(v)} />}
        label="Включить учёт закупочных цен"
      />
      <FormControlLabel
        control={<Checkbox checked={notifyLow} onChange={(_, v) => setNotifyLow(v)} />}
        label="Создавать уведомление при остатке ниже порога"
      />

      <Typography variant="subtitle2">Пороги по категориям (опционально)</Typography>
      <Box sx={{ display: "grid", gap: 1, maxWidth: 480 }}>
        {categories.map((c) => (
          <TextField
            key={c.id}
            size="small"
            label={c.name}
            value={catDraft[c.id] ?? ""}
            onChange={(e) => setCatDraft((d) => ({ ...d, [c.id]: e.target.value }))}
            type="number"
          />
        ))}
      </Box>

      <Button variant="contained" onClick={() => void saveSettings()} sx={{ alignSelf: "flex-start" }}>
        Сохранить настройки склада
      </Button>

      <Typography variant="subtitle1" sx={{ mt: 2 }}>
        Пороги по товарам
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="contained" onClick={() => void saveProducts()}>
          Сохранить пороги товаров
        </Button>
        <Button variant="outlined" onClick={() => void load()}>
          Обновить
        </Button>
      </Box>

      <Box sx={{ height: 420, width: "100%" }}>
        <DataGrid rows={products} columns={columns} getRowId={(r) => r.id} />
      </Box>
    </Box>
  );
}

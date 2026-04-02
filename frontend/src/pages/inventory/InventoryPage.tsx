import AddIcon from "@mui/icons-material/Add";
import CategoryIcon from "@mui/icons-material/Category";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import RemoveIcon from "@mui/icons-material/Remove";
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
  Typography,
} from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridSortModel,
} from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { useCrmRealtime } from "../../realtime/CrmRealtimeContext";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { PageHeader } from "../../ui/PageHeader";
import type { Role } from "../../lib/auth";
import { downloadProductsXlsx } from "./exportInventoryXlsx";
import { InventoryFilters } from "./components/InventoryFilters";
import { MovementModal } from "./components/MovementModal";
import { ProductDetailDialog } from "./components/ProductDetailDialog";
import { ProductFormModal } from "./components/ProductFormModal";
import type { InventoryCategoryRow, InventoryProduct } from "./inventoryTypes";
import {
  buildInventoryApiParams,
  parseInventoryUrlParams,
  toInventorySearchParams,
  type InventoryListQuery,
} from "./inventoryUrlParams";

function extractApiError(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data;
  if (typeof d?.detail === "string") return d.detail;
  return "Ошибка запроса";
}

const SORT_FIELD_MAP: Record<string, string> = {
  name: "name",
  sku: "sku",
  category_name: "category",
  current_stock: "current_stock",
  min_stock: "min_stock",
  updated_at: "updated_at",
};

function sortModelToOrdering(model: GridSortModel): string {
  const first = model[0];
  if (!first?.field || !first.sort) return "name";
  const apiField = SORT_FIELD_MAP[first.field] ?? "name";
  return first.sort === "desc" ? `-${apiField}` : apiField;
}

function orderingToSortModel(ordering: string): GridSortModel {
  const desc = ordering.startsWith("-");
  const raw = desc ? ordering.slice(1) : ordering;
  const gridField = Object.entries(SORT_FIELD_MAP).find(([, v]) => v === raw)?.[0] ?? "name";
  return [{ field: gridField, sort: desc ? "desc" : "asc" }];
}

function roleCanAct(role: Role | null): boolean {
  return role === "admin";
}

function roleShowsPrices(role: Role | null): boolean {
  return role === "admin";
}

function roleShowsFullTable(role: Role | null): boolean {
  return role === "admin";
}

type ImportExcelResponse = {
  created: number;
  stock_movements: number;
  skipped: number;
  parse_warnings: string[];
  row_errors: Array<{ row: number; sku: string; message: string }>;
};

export function InventoryPage() {
  const { state: auth } = useAuth();
  const { subscribe } = useCrmRealtime();
  const role = auth.role;
  const canAct = roleCanAct(role);
  const showPrices = roleShowsPrices(role);
  const fullTable = roleShowsFullTable(role);

  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<InventoryListQuery>(() => parseInventoryUrlParams(searchParams));

  const [rows, setRows] = useState<InventoryProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);

  const [snack, setSnack] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<ImportExcelResponse | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<InventoryProduct | null>(null);
  const [movementInOpen, setMovementInOpen] = useState(false);
  const [movementOutOpen, setMovementOutOpen] = useState(false);
  const [movementPreset, setMovementPreset] = useState<InventoryProduct | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    setFilters(parseInventoryUrlParams(searchParams));
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(filters.search, 350);

  const pushFilters = useCallback(
    (next: InventoryListQuery) => {
      setFilters(next);
      setSearchParams(toInventorySearchParams(next), { replace: true });
    },
    [setSearchParams]
  );

  const loadCategories = useCallback(async () => {
    try {
      const r = await api.get("/inventory/categories/", { params: { page_size: 200 } });
      const raw = r.data?.results ?? r.data;
      setCategories(Array.isArray(raw) ? (raw as InventoryCategoryRow[]) : []);
    } catch {
      setCategories([]);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = { ...filters, search: debouncedSearch };
    const params = buildInventoryApiParams(q);
    try {
      const r = await api.get("/inventory/products/", { params });
      setRows((r.data.results ?? []) as InventoryProduct[]);
      setTotal(typeof r.data.count === "number" ? r.data.count : 0);
    } catch (e) {
      setError(extractApiError(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, debouncedSearch]);

  const loadLowStockCount = useCallback(async () => {
    try {
      const r = await api.get("/inventory/products/", {
        params: { low_stock_only: "true", page_size: 1, page: 1 },
      });
      setLowStockCount(typeof r.data.count === "number" ? r.data.count : 0);
    } catch {
      setLowStockCount(null);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadLowStockCount();
  }, [loadLowStockCount, rows.length]);

  const invWsThrottleRef = useRef<number | null>(null);
  useEffect(() => {
    return subscribe((msg) => {
      const t = msg.type;
      if (!t.startsWith("product") && t !== "stock_movement") return;
      const aid = msg.payload.actor_id;
      if (typeof aid === "number" && aid === auth.userId) return;
      if (invWsThrottleRef.current) window.clearTimeout(invWsThrottleRef.current);
      invWsThrottleRef.current = window.setTimeout(() => {
        invWsThrottleRef.current = null;
        void loadProducts();
        void loadLowStockCount();
      }, 400);
    });
  }, [subscribe, auth.userId, loadProducts, loadLowStockCount]);

  const paginationModel: GridPaginationModel = useMemo(
    () => ({ page: filters.page - 1, pageSize: filters.pageSize }),
    [filters.page, filters.pageSize]
  );

  const sortModel: GridSortModel = useMemo(() => orderingToSortModel(filters.ordering), [filters.ordering]);

  const columns = useMemo<GridColDef<InventoryProduct>[]>(() => {
    const base: GridColDef<InventoryProduct>[] = fullTable
      ? [
          { field: "sku", headerName: "Артикул", width: 120 },
          { field: "name", headerName: "Наименование", flex: 1, minWidth: 200 },
          { field: "category_name", headerName: "Категория", width: 160, valueGetter: (_v, row) => row.category_name ?? "—" },
          { field: "unit", headerName: "Ед.", width: 72 },
          { field: "current_stock", headerName: "Остаток", width: 110, type: "number" },
          { field: "min_stock", headerName: "Мин.", width: 90, type: "number" },
        ]
      : [
          { field: "name", headerName: "Наименование", flex: 1, minWidth: 220 },
          { field: "category_name", headerName: "Категория", width: 160, valueGetter: (_v, row) => row.category_name ?? "—" },
          { field: "unit", headerName: "Ед.", width: 72 },
          { field: "current_stock", headerName: "Остаток", width: 110, type: "number" },
        ];

    if (showPrices) {
      base.push(
        { field: "purchase_price", headerName: "Закупка", width: 100, valueGetter: (_v, r) => r.purchase_price ?? "—" },
        { field: "selling_price", headerName: "Продажа", width: 100, valueGetter: (_v, r) => r.selling_price ?? "—" }
      );
    }

    if (fullTable) {
      base.push({
        field: "actions",
        headerName: "",
        width: 72,
        sortable: false,
        filterable: false,
        renderCell: (p) => (
          <IconButton
            size="small"
            aria-label="Редактировать"
            onClick={(e) => {
              e.stopPropagation();
              setEditProduct(p.row);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        ),
      });
    }

    return base;
  }, [fullTable, showPrices]);

  const categoryOptions = useMemo(() => categories.map((c) => ({ id: c.id, name: c.name })), [categories]);

  const onExport = async () => {
    if (!rows.length) {
      setSnack("Нет данных для экспорта");
      return;
    }
    try {
      await downloadProductsXlsx(rows);
      setSnack("Файл XLSX сформирован");
    } catch {
      setSnack("Не удалось сформировать XLSX");
    }
  };

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setSnack("Нужен файл Excel: .xlsx или .xls");
      return;
    }
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post<ImportExcelResponse>("/inventory/products/import-excel/", fd);
      const data = r.data;
      if (data.parse_warnings.length > 0 || data.row_errors.length > 0) {
        setImportReport(data);
      } else {
        setImportReport(null);
      }
      const parts = [
        `Новых карточек: ${data.created}`,
        `Поступлений: ${data.stock_movements}`,
        data.skipped ? `Пропущено строк: ${data.skipped}` : null,
      ].filter(Boolean);
      setSnack(parts.join(" · "));
      await loadProducts();
      await loadLowStockCount();
    } catch (err) {
      setSnack(extractApiError(err));
    } finally {
      setImportBusy(false);
    }
  };

  const handleCreateSubmit = async (payload: Record<string, unknown>) => {
    setFormBusy(true);
    try {
      await api.post("/inventory/products/", payload);
      setSnack("Товар создан");
      setCreateOpen(false);
      await loadProducts();
      await loadLowStockCount();
    } catch (e) {
      setSnack(extractApiError(e));
    } finally {
      setFormBusy(false);
    }
  };

  const handleEditSubmit = async (payload: Record<string, unknown>) => {
    if (!editProduct) return;
    setFormBusy(true);
    try {
      await api.patch(`/inventory/products/${editProduct.id}/`, payload);
      setSnack("Товар сохранён");
      setEditProduct(null);
      await loadProducts();
      await loadLowStockCount();
    } catch (e) {
      setSnack(extractApiError(e));
    } finally {
      setFormBusy(false);
    }
  };

  const openDetail = (id: number) => {
    setDetailId(id);
    setDetailOpen(true);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <PageHeader
        title="Склад"
        subtitle="Товары, остатки и движения"
        rightSlot={
          canAct ? (
            <Button
              component={RouterLink}
              to="/inventory/categories"
              variant="outlined"
              size="small"
              startIcon={<CategoryIcon />}
            >
              Категории
            </Button>
          ) : null
        }
      />

      {lowStockCount != null && lowStockCount > 0 && !filters.lowStockOnly ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Товаров ниже минимального остатка: {lowStockCount}. Включите фильтр «Только ниже порога», чтобы увидеть список.
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
        {canAct ? (
          <>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Новый товар
            </Button>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setMovementPreset(null);
                setMovementInOpen(true);
              }}
            >
              Поступление
            </Button>
            <Button
              variant="outlined"
              startIcon={<RemoveIcon />}
              onClick={() => {
                setMovementPreset(null);
                setMovementOutOpen(true);
              }}
            >
              Списание
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: "none" }}
              onChange={(ev) => void onImportFile(ev)}
            />
            <Button
              variant="outlined"
              startIcon={<FileUploadIcon />}
              disabled={importBusy}
              onClick={() => importFileRef.current?.click()}
            >
              Импорт Excel
            </Button>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} onClick={onExport}>
              Экспорт XLSX
            </Button>
          </>
        ) : null}
      </Box>

      <InventoryFilters
        value={filters}
        onChange={(next) => setFilters(next)}
        categoryOptions={categoryOptions}
        onApply={() => pushFilters(filters)}
        onReset={() =>
          pushFilters({
            search: "",
            page: 1,
            pageSize: filters.pageSize,
            category: "",
            lowStockOnly: false,
            ordering: "name",
          })
        }
      />

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Skeleton variant="rounded" height={480} />
      ) : rows.length === 0 ? (
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Нет товаров, соответствующих фильтрам.
          </Typography>
          <Button
            variant="outlined"
            onClick={() =>
              pushFilters({
                search: "",
                page: 1,
                pageSize: filters.pageSize,
                category: "",
                lowStockOnly: false,
                ordering: filters.ordering,
              })
            }
          >
            Сбросить фильтры
          </Button>
          {canAct ? (
            <Button sx={{ ml: 1 }} variant="contained" onClick={() => setCreateOpen(true)}>
              Добавить товар
            </Button>
          ) : null}
        </Box>
      ) : (
        <div style={{ width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            paginationModel={paginationModel}
            onPaginationModelChange={(m) => {
              pushFilters({ ...filters, page: m.page + 1, pageSize: m.pageSize });
            }}
            pageSizeOptions={[20, 25, 50, 100]}
            rowCount={total}
            paginationMode="server"
            sortingMode="server"
            sortModel={sortModel}
            onSortModelChange={(m) => {
              pushFilters({ ...filters, ordering: sortModelToOrdering(m), page: 1 });
            }}
            onRowClick={(p) => openDetail(p.row.id)}
            getRowClassName={(p) => (p.row.is_low_stock ? "mp-inv-low" : "")}
            sx={{
              minHeight: 420,
              border: "none",
              "& .mp-inv-low": {
                backgroundColor: "warning.light",
              },
            }}
            disableRowSelectionOnClick
          />
        </div>
      )}

      <ProductFormModal
        open={createOpen}
        mode="create"
        categories={categories}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateSubmit}
        busy={formBusy}
      />

      <ProductFormModal
        open={!!editProduct}
        mode="edit"
        categories={categories}
        initial={
          editProduct
            ? {
                id: editProduct.id,
                sku: editProduct.sku,
                name: editProduct.name,
                category: editProduct.category,
                unit: editProduct.unit,
                min_stock: editProduct.min_stock,
                purchase_price: editProduct.purchase_price,
                selling_price: editProduct.selling_price,
              }
            : null
        }
        onClose={() => setEditProduct(null)}
        onSubmit={handleEditSubmit}
        busy={formBusy}
      />

      <MovementModal
        open={movementInOpen}
        kind="in"
        presetProduct={movementPreset}
        onClose={() => setMovementInOpen(false)}
        onSuccess={() => {
          setMovementInOpen(false);
          setSnack("Поступление оформлено");
          void loadProducts();
          void loadLowStockCount();
        }}
        onError={(m) => setSnack(m)}
      />

      <MovementModal
        open={movementOutOpen}
        kind="out"
        presetProduct={movementPreset}
        onClose={() => setMovementOutOpen(false)}
        onSuccess={() => {
          setMovementOutOpen(false);
          setSnack("Списание оформлено");
          void loadProducts();
          void loadLowStockCount();
        }}
        onError={(m) => setSnack(m)}
      />

      <ProductDetailDialog
        open={detailOpen}
        productId={detailId}
        onClose={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
        onEdit={(p) => {
          setEditProduct(p);
        }}
        onMovementIn={(p) => {
          setMovementPreset(p);
          setMovementInOpen(true);
        }}
        onMovementOut={(p) => {
          setMovementPreset(p);
          setMovementOutOpen(true);
        }}
        onRefreshList={() => {
          void loadProducts();
          void loadLowStockCount();
        }}
      />

      <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)} message={snack ?? ""} />

      <Dialog open={!!importReport} onClose={() => setImportReport(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Результат импорта</DialogTitle>
        <DialogContent>
          {importReport ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Новых карточек: {importReport.created}. Оформлено поступлений: {importReport.stock_movements}.
                {importReport.skipped > 0 ? ` Пропущено строк: ${importReport.skipped}.` : ""}
              </Typography>
              {importReport.parse_warnings.length > 0 ? (
                <Alert severity="warning">
                  {importReport.parse_warnings.map((w, i) => (
                    <Typography key={i} variant="body2" component="div">
                      {w}
                    </Typography>
                  ))}
                </Alert>
              ) : null}
              {importReport.row_errors.length > 0 ? (
                <Alert severity="error">
                  {importReport.row_errors.map((er, i) => (
                    <Typography key={i} variant="body2" component="div">
                      Строка {er.row}, артикул «{er.sku}»: {er.message}
                    </Typography>
                  ))}
                </Alert>
              ) : null}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportReport(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { downloadReportXlsx } from "../reportExport";
import type { ReportsUrlState } from "../reportsUrlParams";

type ProductRow = {
  id: number;
  name: string;
  sku: string;
  category_name?: string;
  unit: string;
  current_stock: string;
  min_stock: string;
  is_low_stock: boolean;
};

type MovRow = {
  created_at: string;
  product: string;
  sku: string;
  type: string;
  quantity: string;
  reason: string;
  order_number: string | null;
  comment: string;
};

type Props = {
  applied: ReportsUrlState;
  onSubChange: (sub: ReportsUrlState["stock_sub"]) => void;
};

export function StockReportTab({ applied, onSubChange }: Props) {
  const sub = applied.stock_sub;
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [movements, setMovements] = useState<MovRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (sub === "current") {
        const r = await api.get<{ results: ProductRow[] }>("/inventory/products/stock-report/");
        setProducts(r.data.results ?? []);
        setMovements([]);
      } else if (sub === "movements") {
        const r = await api.get<{ results: MovRow[] }>("/reports/stock-movements/", {
          params: { from: applied.from, to: applied.to },
        });
        setMovements(r.data.results ?? []);
        setProducts([]);
      } else {
        const r = await api.get<{ results: ProductRow[] }>("/inventory/products/", {
          params: { low_stock_only: "true", page_size: 200 },
        });
        setProducts((r.data.results ?? []) as ProductRow[]);
        setMovements([]);
      }
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Не удалось загрузить отчёт");
      setProducts([]);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [applied.from, applied.to, sub]);

  useEffect(() => {
    void load();
  }, [load]);

  const prodCols = useMemo<GridColDef<ProductRow>[]>(
    () => [
      { field: "sku", headerName: "Артикул", width: 120 },
      { field: "name", headerName: "Наименование", flex: 1, minWidth: 200 },
      { field: "category_name", headerName: "Категория", width: 140 },
      { field: "unit", headerName: "Ед.", width: 72 },
      { field: "current_stock", headerName: "Остаток", width: 100 },
      { field: "min_stock", headerName: "Мин.", width: 90 },
    ],
    []
  );

  const exportMovements = () => {
    void downloadReportXlsx("/reports/stock-movements.xlsx", { from: applied.from, to: applied.to });
  };

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Tabs
        value={sub}
        onChange={(_, v) => onSubChange(v as ReportsUrlState["stock_sub"])}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Текущие остатки" value="current" />
        <Tab label="Движения" value="movements" />
        <Tab label="Ниже порога" value="low" />
      </Tabs>

      {sub === "movements" ? (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="outlined" onClick={exportMovements}>
            Экспорт движений (XLSX)
          </Button>
        </Box>
      ) : null}

      {loading ? (
        <Skeleton variant="rounded" height={360} />
      ) : sub === "movements" ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Движения за период
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>Товар</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell>Кол-во</TableCell>
                  <TableCell>Заказ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {movements.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{new Date(m.created_at).toLocaleString("ru-RU")}</TableCell>
                    <TableCell>{m.product}</TableCell>
                    <TableCell>{m.type === "in" ? "Приход" : "Расход"}</TableCell>
                    <TableCell>{m.quantity}</TableCell>
                    <TableCell>{m.order_number ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div style={{ height: 440, width: "100%" }}>
          <DataGrid
            rows={products}
            columns={prodCols}
            getRowId={(r) => r.id}
            loading={loading}
            getRowClassName={(p) => (p.row.is_low_stock ? "mp-stock-low" : "")}
            sx={{
              "& .mp-stock-low": { backgroundColor: "warning.light" },
            }}
            disableRowSelectionOnClick
            density="compact"
          />
        </div>
      )}
    </Box>
  );
}

import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { api } from "../../../lib/api";
import { useAuth } from "../../../app/AuthContext";
import type { InventoryProduct, Paginated, StockMovementRow, UsedInOrderRow } from "../inventoryTypes";

type Props = {
  open: boolean;
  productId: number | null;
  onClose: () => void;
  onEdit: (p: InventoryProduct) => void;
  onMovementIn: (p: InventoryProduct) => void;
  onMovementOut: (p: InventoryProduct) => void;
  onRefreshList: () => void;
};

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU");
  } catch {
    return iso;
  }
}

export function ProductDetailDialog({
  open,
  productId,
  onClose,
  onEdit,
  onMovementIn,
  onMovementOut,
  onRefreshList,
}: Props) {
  const { state: auth } = useAuth();
  const isAdmin = auth.role === "admin";
  const showPrices = isAdmin;

  const [tab, setTab] = useState(0);
  const [product, setProduct] = useState<InventoryProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movPage, setMovPage] = useState(0);
  const [movPageSize, setMovPageSize] = useState(25);
  const [movType, setMovType] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [orders, setOrders] = useState<UsedInOrderRow[]>([]);

  const loadProduct = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<InventoryProduct>(`/inventory/products/${productId}/`);
      setProduct(r.data);
    } catch {
      setError("Не удалось загрузить товар");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const loadMovements = useCallback(async () => {
    if (!productId) return;
    const params: Record<string, string | number> = {
      page: movPage + 1,
      page_size: movPageSize,
    };
    if (movType === "in" || movType === "out") params.type = movType;
    if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
    if (dateTo) params.date_to = `${dateTo}T23:59:59`;

    try {
      const r = await api.get<Paginated<StockMovementRow>>(`/inventory/products/${productId}/movements/`, {
        params,
      });
      const data = r.data;
      if (Array.isArray((data as { results?: unknown }).results)) {
        setMovements((data as Paginated<StockMovementRow>).results);
        setMovTotal((data as Paginated<StockMovementRow>).count ?? 0);
      } else {
        setMovements([]);
        setMovTotal(0);
      }
    } catch {
      setMovements([]);
      setMovTotal(0);
    }
  }, [productId, movPage, movPageSize, movType, dateFrom, dateTo]);

  const loadOrders = useCallback(async () => {
    if (!productId) return;
    try {
      const r = await api.get<{ results: UsedInOrderRow[] }>(`/inventory/products/${productId}/used-in-orders/`);
      setOrders(r.data.results ?? []);
    } catch {
      setOrders([]);
    }
  }, [productId]);

  useEffect(() => {
    if (!open || !productId) return;
    void loadProduct();
    setTab(0);
    setMovPage(0);
    setMovType("");
    setDateFrom("");
    setDateTo("");
  }, [open, productId, loadProduct]);

  useEffect(() => {
    if (!open || !productId || tab !== 1) return;
    void loadMovements();
  }, [open, productId, tab, loadMovements]);

  useEffect(() => {
    if (!open || !productId || tab !== 2) return;
    void loadOrders();
  }, [open, productId, tab, loadOrders]);

  const handleClose = () => {
    onRefreshList();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        {loading ? "Загрузка…" : product ? `${product.name} (${product.sku})` : "Товар"}
      </DialogTitle>
      <DialogContent dividers>
        {error ? (
          <Typography color="error">{error}</Typography>
        ) : product ? (
          <>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab label="Основная информация" />
              <Tab label="История движений" />
              <Tab label="Заказы" />
            </Tabs>

            {tab === 0 ? (
              <Box sx={{ display: "grid", gap: 1.5, maxWidth: 560 }}>
                <Typography>
                  <strong>Артикул:</strong> {product.sku}
                </Typography>
                <Typography>
                  <strong>Наименование:</strong> {product.name}
                </Typography>
                <Typography>
                  <strong>Категория:</strong> {product.category_name ?? "—"}
                </Typography>
                <Typography>
                  <strong>Ед. изм.:</strong> {product.unit}
                </Typography>
                <Typography>
                  <strong>Текущий остаток:</strong> {product.current_stock}
                </Typography>
                <Typography>
                  <strong>Мин. остаток:</strong> {product.min_stock}
                </Typography>
                {showPrices ? (
                  <>
                    <Typography>
                      <strong>Закупочная цена:</strong> {product.purchase_price ?? "—"}
                    </Typography>
                    <Typography>
                      <strong>Цена продажи:</strong> {product.selling_price ?? "—"}
                    </Typography>
                  </>
                ) : null}
                {isAdmin ? (
                  <Button variant="outlined" onClick={() => onEdit(product)} sx={{ alignSelf: "flex-start", mt: 1 }}>
                    Редактировать
                  </Button>
                ) : null}
              </Box>
            ) : null}

            {tab === 1 ? (
              <Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2, alignItems: "center" }}>
                  <TextField
                    label="Тип"
                    select
                    size="small"
                    value={movType}
                    onChange={(e) => {
                      setMovType(e.target.value);
                      setMovPage(0);
                    }}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="">Все</MenuItem>
                    <MenuItem value="in">Поступление</MenuItem>
                    <MenuItem value="out">Списание</MenuItem>
                  </TextField>
                  <TextField
                    label="С даты"
                    type="date"
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setMovPage(0);
                    }}
                  />
                  <TextField
                    label="По дату"
                    type="date"
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setMovPage(0);
                    }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      void loadMovements();
                    }}
                  >
                    Обновить
                  </Button>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Тип</TableCell>
                      <TableCell>Кол-во</TableCell>
                      <TableCell>Причина</TableCell>
                      <TableCell>Заказ</TableCell>
                      <TableCell>Пользователь</TableCell>
                      <TableCell>Комментарий</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{formatDt(m.created_at)}</TableCell>
                        <TableCell>{m.type === "in" ? "Приход" : "Расход"}</TableCell>
                        <TableCell>{m.quantity}</TableCell>
                        <TableCell>{m.reason}</TableCell>
                        <TableCell>
                          {m.order_number && m.order != null ? (
                            <Link component={RouterLink} to={`/orders/${m.order}`} underline="hover">
                              {m.order_number}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{m.created_by_name ?? "—"}</TableCell>
                        <TableCell>{m.comment || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  component="div"
                  count={movTotal}
                  page={movPage}
                  onPageChange={(_, p) => setMovPage(p)}
                  rowsPerPage={movPageSize}
                  onRowsPerPageChange={(e) => {
                    setMovPageSize(parseInt(e.target.value, 10));
                    setMovPage(0);
                  }}
                  rowsPerPageOptions={[10, 25, 50]}
                  labelRowsPerPage="На странице"
                />
              </Box>
            ) : null}

            {tab === 2 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Заказ</TableCell>
                    <TableCell>Количество</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography color="text.secondary">Нет привязок к заказам</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o) => (
                      <TableRow key={`${o.order_id}-${o.order_number}`}>
                        <TableCell>
                          <Link component={RouterLink} to={`/orders/${o.order_id}`} underline="hover">
                            {o.order_number}
                          </Link>
                        </TableCell>
                        <TableCell>{o.quantity}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            ) : null}
          </>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          {isAdmin && product ? (
            <>
              <Button startIcon={<AddIcon />} variant="outlined" onClick={() => onMovementIn(product)}>
                Поступление
              </Button>
              <Button startIcon={<RemoveIcon />} variant="outlined" onClick={() => onMovementOut(product)}>
                Списание
              </Button>
            </>
          ) : null}
        </Box>
        <Button onClick={handleClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}

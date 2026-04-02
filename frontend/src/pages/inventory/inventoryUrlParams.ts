export type InventoryListQuery = {
  search: string;
  page: number;
  pageSize: number;
  category: string;
  lowStockOnly: boolean;
  ordering: string;
};

const DEFAULT_PAGE_SIZE = 25;

export function parseInventoryUrlParams(sp: URLSearchParams): InventoryListQuery {
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSizeRaw = parseInt(sp.get("page_size") || String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = [20, 25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE;

  return {
    search: sp.get("search") ?? "",
    page,
    pageSize,
    category: sp.get("category") ?? "",
    lowStockOnly: sp.get("low_stock_only") === "1" || sp.get("low_stock_only") === "true",
    ordering: sp.get("ordering") ?? "name",
  };
}

/** Параметры для GET /inventory/products/ (DRF). */
export function buildInventoryApiParams(q: InventoryListQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", String(q.page));
  p.set("page_size", String(q.pageSize));
  if (q.search.trim()) p.set("search", q.search.trim());
  if (q.category) p.set("category", q.category);
  if (q.lowStockOnly) p.set("low_stock_only", "true");
  if (q.ordering) p.set("ordering", q.ordering);
  return p;
}

export function toInventorySearchParams(q: InventoryListQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.search.trim()) p.set("search", q.search.trim());
  if (q.page > 1) p.set("page", String(q.page));
  if (q.pageSize !== DEFAULT_PAGE_SIZE) p.set("page_size", String(q.pageSize));
  if (q.category) p.set("category", q.category);
  if (q.lowStockOnly) p.set("low_stock_only", "1");
  if (q.ordering && q.ordering !== "name") p.set("ordering", q.ordering);
  return p;
}

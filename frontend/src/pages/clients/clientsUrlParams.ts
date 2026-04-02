export type ClientsListQuery = {
  search: string;
  page: number;
  pageSize: number;
  tags: string[];
  createdFrom: string;
  createdTo: string;
  lastOrderFrom: string;
  lastOrderTo: string;
  ordersMin: string;
  ordersMax: string;
  activeOrdersOnly: boolean;
  deviceType: string;
};

const DEFAULT_PAGE_SIZE = 25;

export function parseClientsUrlParams(sp: URLSearchParams): ClientsListQuery {
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSizeRaw = parseInt(sp.get("page_size") || String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = [20, 25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE;
  const tags = sp.getAll("tag").map((t) => t.trim()).filter(Boolean);

  return {
    search: sp.get("search") ?? "",
    page,
    pageSize,
    tags,
    createdFrom: sp.get("created_from") ?? "",
    createdTo: sp.get("created_to") ?? "",
    lastOrderFrom: sp.get("last_order_from") ?? "",
    lastOrderTo: sp.get("last_order_to") ?? "",
    ordersMin: sp.get("orders_min") ?? "",
    ordersMax: sp.get("orders_max") ?? "",
    activeOrdersOnly: sp.get("active_orders_only") === "1",
    deviceType: sp.get("device_type") ?? "",
  };
}

/** Query string for GET /clients/ and /clients/tags-count/ (DRF: repeated `tag`). */
export function buildClientsApiParams(q: ClientsListQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", String(q.page));
  p.set("page_size", String(q.pageSize));
  if (q.search.trim()) p.set("search", q.search.trim());
  for (const t of q.tags) p.append("tag", t);
  if (q.createdFrom) p.set("created_from", q.createdFrom);
  if (q.createdTo) p.set("created_to", q.createdTo);
  if (q.lastOrderFrom) p.set("last_order_from", q.lastOrderFrom);
  if (q.lastOrderTo) p.set("last_order_to", q.lastOrderTo);
  if (q.ordersMin) p.set("orders_min", q.ordersMin);
  if (q.ordersMax) p.set("orders_max", q.ordersMax);
  if (q.activeOrdersOnly) p.set("active_orders_only", "1");
  if (q.deviceType) p.set("device_type", q.deviceType);
  return p;
}

export function toClientsSearchParams(q: ClientsListQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.search.trim()) p.set("search", q.search.trim());
  if (q.page > 1) p.set("page", String(q.page));
  if (q.pageSize !== DEFAULT_PAGE_SIZE) p.set("page_size", String(q.pageSize));
  for (const t of q.tags) p.append("tag", t);
  if (q.createdFrom) p.set("created_from", q.createdFrom);
  if (q.createdTo) p.set("created_to", q.createdTo);
  if (q.lastOrderFrom) p.set("last_order_from", q.lastOrderFrom);
  if (q.lastOrderTo) p.set("last_order_to", q.lastOrderTo);
  if (q.ordersMin) p.set("orders_min", q.ordersMin);
  if (q.ordersMax) p.set("orders_max", q.ordersMax);
  if (q.activeOrdersOnly) p.set("active_orders_only", "1");
  if (q.deviceType) p.set("device_type", q.deviceType);
  return p;
}

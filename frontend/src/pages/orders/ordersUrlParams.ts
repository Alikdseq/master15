import type { OrderFiltersState } from "./components/OrderFilters";

export type OrdersListQuery = OrderFiltersState & {
  page: number;
  pageSize: number;
  /** Preselect client in create dialog (from client card). */
  clientId: number | null;
};

const VALID_STATUS = ["all", "accepted", "diagnostics", "negotiation", "waiting_parts", "repair", "ready", "completed"] as const;

const VALID_SERVICE_TYPE = ["all", "repair", "print"] as const;

export function parseOrdersUrlParams(sp: URLSearchParams): OrdersListQuery {
  const st = sp.get("status") ?? "all";
  const status = VALID_STATUS.includes(st as (typeof VALID_STATUS)[number]) ? st : "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const pageSizeRaw = parseInt(sp.get("page_size") || "25", 10);
  const pageSize = [20, 25, 50, 100].includes(pageSizeRaw) ? pageSizeRaw : 25;

  const cidRaw = sp.get("client_id");
  const clientIdParsed = cidRaw ? parseInt(cidRaw, 10) : NaN;
  const clientId = Number.isFinite(clientIdParsed) ? clientIdParsed : null;

  const svc = sp.get("service_type") ?? "all";
  const serviceType = VALID_SERVICE_TYPE.includes(svc as (typeof VALID_SERVICE_TYPE)[number]) ? svc : "all";

  return {
    search: sp.get("search") ?? "",
    status,
    master: sp.get("master") ?? "all",
    serviceType: serviceType as OrdersListQuery["serviceType"],
    receivedDateFrom: sp.get("received_date_from") ?? "",
    receivedDateTo: sp.get("received_date_to") ?? "",
    page,
    pageSize,
    clientId,
  };
}

export function toOrdersSearchParams(q: OrdersListQuery, opts?: { create?: boolean }): URLSearchParams {
  const p = new URLSearchParams();
  if (q.search.trim()) p.set("search", q.search.trim());
  if (q.status !== "all") p.set("status", q.status);
  if (q.master !== "all") p.set("master", q.master);
  if (q.serviceType !== "all") p.set("service_type", q.serviceType);
  if (q.receivedDateFrom) p.set("received_date_from", q.receivedDateFrom);
  if (q.receivedDateTo) p.set("received_date_to", q.receivedDateTo);
  if (q.page > 1) p.set("page", String(q.page));
  if (q.pageSize !== 25) p.set("page_size", String(q.pageSize));
  if (opts?.create) p.set("create", "1");
  if (q.clientId != null) p.set("client_id", String(q.clientId));
  return p;
}

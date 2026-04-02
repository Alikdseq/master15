export type UserRole = "admin" | "manager" | "master";

export interface DashboardCharts {
  orders_line: { labels: string[]; values: number[] };
  status_distribution: { code: string; name: string; count: number }[];
}

export interface OrderCard {
  id: number;
  order_number: string;
  client_name: string;
  client_phone: string;
  device_type: string;
  status_code: string | null;
  status_name: string | null;
  received_date: string | null;
  days_in_status: number;
}

export interface ActivityRow {
  name: string;
  completed: number;
  avg_days: number | null;
}

export interface LowStockRow {
  id: number;
  name: string;
  sku: string;
  unit: string;
  current_stock: string | number;
  min_stock: string | number;
}

export interface TopServiceRow {
  name: string;
  count: number;
}

export interface AdminStats {
  orders_today: number;
  orders_week: number;
  orders_month: number;
  revenue_month: string | null;
  avg_completion_hours: number | null;
  low_stock_count: number;
}

export interface ManagerStats {
  orders_today: number;
  orders_week: number;
  orders_month: number;
  pending_negotiation: number;
  ready_pickup: number;
  low_stock_count: number;
}

export interface MasterStats {
  in_repair: number;
  waiting_parts: number;
  completed_week: number;
  avg_repair_days: number | null;
  active_orders: number;
}

export interface DashboardPayload {
  role: UserRole;
  updated_at: string;
  stats: AdminStats | ManagerStats | MasterStats;
  charts: DashboardCharts;
  top_services: TopServiceRow[];
  low_stock: LowStockRow[] | null;
  urgent_orders: OrderCard[];
  activity: ActivityRow[] | null;
  negotiation_orders: OrderCard[] | null;
  ready_orders: OrderCard[] | null;
  master_orders: OrderCard[] | null;
  master_load: { active: number; waiting_parts: number; avg_repair_days: number | null } | null;
}

export function isAdminStats(stats: DashboardPayload["stats"], role: UserRole): stats is AdminStats {
  return role === "admin" && stats != null && "revenue_month" in stats;
}

export function isManagerStats(stats: DashboardPayload["stats"], role: UserRole): stats is ManagerStats {
  return role === "manager" && stats != null && "pending_negotiation" in stats;
}

export function isMasterStats(stats: DashboardPayload["stats"], role: UserRole): stats is MasterStats {
  return role === "master" && stats != null && "in_repair" in stats;
}

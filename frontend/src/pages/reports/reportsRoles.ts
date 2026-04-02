import type { Role } from "../../lib/auth";

export type ReportsTabKey = "orders" | "finance" | "stock" | "clients" | "services" | "masters";

const ALL: ReportsTabKey[] = ["orders", "finance", "stock", "clients", "services", "masters"];

/** Менеджер: заказы (без финансовых KPI в UI), клиенты, услуги — по ТЗ. */
const MANAGER_TABS: ReportsTabKey[] = ["orders", "clients", "services"];

/** Мастер: только загрузка (свои данные через API дашборда). */
const MASTER_TABS: ReportsTabKey[] = ["masters"];

export function visibleReportTabs(role: Role | null): ReportsTabKey[] {
  if (role === "admin") return ALL;
  if (role === "manager") return MANAGER_TABS;
  if (role === "master") return MASTER_TABS;
  return [];
}

export function defaultTabForRole(role: Role | null): ReportsTabKey {
  const v = visibleReportTabs(role);
  return v[0] ?? "orders";
}

/** Финансовые суммы в отчёте по заказам и отдельная вкладка «Финансы». */
export function roleShowsFinance(role: Role | null): boolean {
  return role === "admin";
}

export function roleShowsStock(role: Role | null): boolean {
  return role === "admin";
}

export function tabLabel(key: ReportsTabKey): string {
  const m: Record<ReportsTabKey, string> = {
    orders: "Заказы",
    finance: "Финансы",
    stock: "Склад",
    clients: "Клиенты",
    services: "Услуги / неисправности",
    masters: "Загрузка мастеров",
  };
  return m[key];
}

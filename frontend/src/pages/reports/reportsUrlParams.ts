import type { ReportsTabKey } from "./reportsRoles";
import { defaultTabForRole, visibleReportTabs } from "./reportsRoles";
import type { Role } from "../../lib/auth";

export type ReportsUrlState = {
  tab: ReportsTabKey;
  from: string;
  to: string;
  preset: string;
  status: string;
  master: string;
  device_type: string;
  stock_sub: "current" | "movements" | "low";
  client_tags: string;
  finance_group: string;
};

export function monthBounds(d = new Date()): { from: string; to: string } {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

function isoDate(x: Date): string {
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computePeriodFromPreset(preset: string): { from: string; to: string } {
  const today = new Date();
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (preset) {
    case "today":
      return { from: isoDate(d0), to: isoDate(d0) };
    case "week": {
      const wd = d0.getDay() || 7;
      const mon = new Date(d0);
      mon.setDate(d0.getDate() - wd + 1);
      return { from: isoDate(mon), to: isoDate(d0) };
    }
    case "month":
      return monthBounds(today);
    case "quarter": {
      const q = Math.floor(today.getMonth() / 3);
      const from = new Date(today.getFullYear(), q * 3, 1);
      const to = new Date(today.getFullYear(), q * 3 + 3, 0);
      return { from: isoDate(from), to: isoDate(to) };
    }
    default:
      return monthBounds(today);
  }
}

export function parseReportsUrlParams(sp: URLSearchParams, role: Role | null): ReportsUrlState {
  const { from: defFrom, to: defTo } = monthBounds();
  const tabRaw = sp.get("tab") as ReportsTabKey | null;
  const vis = visibleReportTabs(role);
  const visSet = new Set(vis);
  let tab: ReportsTabKey = tabRaw && visSet.has(tabRaw) ? tabRaw : defaultTabForRole(role);

  return {
    tab,
    from: sp.get("from") ?? defFrom,
    to: sp.get("to") ?? defTo,
    preset: sp.get("preset") ?? "month",
    status: sp.get("status") ?? "",
    master: sp.get("master") ?? "",
    device_type: sp.get("device_type") ?? "",
    stock_sub: (sp.get("stock_sub") as ReportsUrlState["stock_sub"]) || "current",
    client_tags: sp.get("client_tags") ?? "",
    finance_group: sp.get("finance_group") ?? "month",
  };
}

export function toReportsSearchParams(s: ReportsUrlState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("tab", s.tab);
  p.set("from", s.from);
  p.set("to", s.to);
  if (s.preset !== "month") p.set("preset", s.preset);
  if (s.status) p.set("status", s.status);
  if (s.master) p.set("master", s.master);
  if (s.device_type) p.set("device_type", s.device_type);
  if (s.stock_sub !== "current") p.set("stock_sub", s.stock_sub);
  if (s.client_tags) p.set("client_tags", s.client_tags);
  if (s.finance_group !== "month") p.set("finance_group", s.finance_group);
  return p;
}


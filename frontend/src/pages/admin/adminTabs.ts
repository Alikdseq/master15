export const ADMIN_TAB_IDS = [
  "users",
  "settings",
  "templates",
  "statuses",
  "stock",
  "backup",
  "logs",
] as const;

export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

export function parseAdminTab(raw: string | null): AdminTabId {
  if (raw && (ADMIN_TAB_IDS as readonly string[]).includes(raw)) {
    return raw as AdminTabId;
  }
  return "users";
}

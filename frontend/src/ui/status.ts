export type OrderStatusCode =
  | "accepted"
  | "diagnostics"
  | "negotiation"
  | "waiting_parts"
  | "repair"
  | "ready"
  | "completed"
  | (string & {});

export const STATUS_COLORS: Record<
  string,
  { bg: string; fg: string; dot?: string }
> = {
  accepted: { bg: "#EFF6FF", fg: "#1E4F8A", dot: "#3B82F6" }, // Принят
  diagnostics: { bg: "#F3E8FF", fg: "#5B21B6", dot: "#8B5CF6" }, // Диагностика
  negotiation: { bg: "#FFFBEB", fg: "#92400E", dot: "#F59E0B" }, // Согласование
  waiting_parts: { bg: "#FFF7ED", fg: "#9A3412", dot: "#F97316" }, // Ожидание запчастей
  repair: { bg: "#FCE7F3", fg: "#9D174D", dot: "#EC4899" }, // В ремонте
  ready: { bg: "#DCFCE7", fg: "#166534", dot: "#10B981" }, // Готов
  completed: { bg: "#F1F5F9", fg: "#334155", dot: "#6B7280" }, // Выдан
};


import { mpBrand } from "../../app/theme";

/** Локальная календарная дата YYYY-MM-DD (не UTC — `toISOString()` сдвигает день для UTC+N). */
function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Метка графика в формате DD.MM → диапазон дат приёма для фильтра списка заказов. */
export function chartLabelToDayRange(label: string): { from: string; to: string } | null {
  const m = label.match(/^(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const now = new Date();
  let y = now.getFullYear();
  const candidate = new Date(y, month - 1, day);
  if (candidate > now) y -= 1;
  const d = new Date(y, month - 1, day);
  return { from: toLocalYmd(d), to: toLocalYmd(d) };
}

/** CMYK + брендовый синий (как на вывеске «Мастер Принт»). */
export const PIE_COLORS = [...mpBrand.chart];

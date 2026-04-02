/** Приводит телефон к виду маски +7 XXX XXX-XX-XX для отображения в форме. */
export function formatRuPhoneForMask(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8") && d.length >= 11) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw.trim();
}

import { api } from "../../lib/api";

/**
 * Скачивание XLSX с авторизацией (Bearer из axios).
 */
export async function downloadReportXlsx(path: string, params: Record<string, string | undefined | null>) {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") clean[k] = String(v);
  }
  const r = await api.get(path, {
    params: clean,
    responseType: "blob",
  });
  const blob = new Blob([r.data as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const disposition = r.headers["content-disposition"] as string | undefined;
  let filename = path.split("/").pop() ?? "report.xlsx";
  const m = disposition?.match(/filename="?([^";]+)"?/i);
  if (m) filename = m[1].trim();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

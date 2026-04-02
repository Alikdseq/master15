import ExcelJS from "exceljs";
import type { InventoryProduct } from "./inventoryTypes";

const UNITS = ["шт", "м", "кг", "л", "упак", "компл"];

async function saveWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadProductsXlsx(rows: InventoryProduct[], filename = "sklad-tovary.xlsx") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Товары");
  ws.columns = [
    { header: "Артикул", key: "sku" },
    { header: "Наименование", key: "name" },
    { header: "Категория", key: "category_name" },
    { header: "Ед. изм.", key: "unit" },
    { header: "Остаток", key: "current_stock" },
    { header: "Мин. остаток", key: "min_stock" },
    { header: "Закупка", key: "purchase_price" },
    { header: "Продажа", key: "selling_price" },
    { header: "Ниже порога", key: "is_low_stock" },
  ];
  for (const r of rows) {
    ws.addRow({
      sku: r.sku,
      name: r.name,
      category_name: r.category_name ?? "",
      unit: r.unit,
      current_stock: r.current_stock,
      min_stock: r.min_stock,
      purchase_price: r.purchase_price ?? "",
      selling_price: r.selling_price ?? "",
      is_low_stock: r.is_low_stock ? "Да" : "Нет",
    });
  }
  await saveWorkbook(wb, filename);
}

export async function downloadMovementsXlsx(
  rows: Array<{
    created_at: string;
    type: string;
    quantity: string;
    reason: string;
    comment: string;
    order_number: string | null;
    created_by_name: string | null;
  }>,
  filename = "sklad-dvizheniya.xlsx"
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Движения");
  ws.columns = [
    { header: "Дата", key: "created_at" },
    { header: "Тип", key: "type" },
    { header: "Количество", key: "quantity" },
    { header: "Причина", key: "reason" },
    { header: "Комментарий", key: "comment" },
    { header: "Заказ", key: "order_number" },
    { header: "Пользователь", key: "created_by_name" },
  ];
  for (const r of rows) {
    ws.addRow({
      created_at: r.created_at,
      type: r.type === "in" ? "Поступление" : "Списание",
      quantity: r.quantity,
      reason: r.reason,
      comment: r.comment,
      order_number: r.order_number ?? "",
      created_by_name: r.created_by_name ?? "",
    });
  }
  await saveWorkbook(wb, filename);
}

export { UNITS };

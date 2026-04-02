import { z } from "zod";

/**
 * RHF не передаёт в resolver несмонтированные/незарегистрированные поля → undefined;
 * голый z.string() / z.boolean() даёт «expected string, received undefined».
 */
function formStr() {
  return z
    .union([z.string(), z.undefined(), z.null()])
    .transform((v) => (v == null ? "" : String(v)));
}

function formBool() {
  return z
    .union([z.boolean(), z.undefined(), z.null()])
    .transform((v): boolean => (v === true || v === false ? v : false));
}

function clientIdField() {
  return z
    .union([z.number(), z.null(), z.undefined()])
    .transform((v): number | null => (v === undefined ? null : v));
}

export const DEVICE_TYPES = ["Принтер", "МФУ", "Ноутбук", "Монитор", "Другое"] as const;

export const PRINT_DOCUMENT_TYPES = [
  "Листовки",
  "Визитки",
  "Брошюры",
  "Документы",
  "Фото",
  "Плакаты",
  "Другое",
] as const;

export const createOrderFormSchema = z
  .object({
    clientMode: z.enum(["existing", "new"]),
    clientId: clientIdField(),
    newName: formStr(),
    newPhone: formStr(),
    newEmail: formStr(),
    newAddress: formStr(),
    service_type: z.enum(["repair", "print"]),
    device_type: formStr(),
    device_model: formStr(),
    serial_number: formStr(),
    issue_description: formStr(),
    acc_power: formBool(),
    acc_usb: formBool(),
    acc_power_cable: formBool(),
    acc_mouse: formBool(),
    acc_keyboard: formBool(),
    acc_cartridge: formBool(),
    acc_other: formStr(),
    received_date: z
      .union([z.string(), z.undefined(), z.null()])
      .transform((v) =>
        v === undefined || v === null || v === "" ? new Date().toISOString().slice(0, 10) : v
      )
      .pipe(z.string().min(1)),
    desired_completion_date: formStr(),
    preliminary_cost: formStr(),
    assigned_master: formStr(),
    internal_comment: formStr(),
    print_document_type: formStr(),
    /** MUI number input + valueAsNumber часто отдаёт строку или NaN — нормализуем перед проверкой. */
    print_page_count: z
      .any()
      .transform((v: unknown) => {
        if (v === "" || v === null || v === undefined) return 1;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n) || Number.isNaN(n)) return 1;
        return n;
      })
      .pipe(z.number().min(1, "Укажите количество не меньше 1")),
    print_color_mode: z
      .union([z.enum(["bw", "color"]), z.undefined(), z.null()])
      .transform((v): "bw" | "color" => (v === undefined || v === null ? "bw" : v)),
    print_urgent: formBool(),
    print_special_requests: formStr(),
  })
  .superRefine((data, ctx) => {
    if (data.clientMode === "existing" && !data.clientId) {
      ctx.addIssue({ code: "custom", path: ["clientId"], message: "Выберите клиента из списка" });
    }
    if (data.clientMode === "new") {
      if (!data.newName.trim()) ctx.addIssue({ code: "custom", path: ["newName"], message: "Укажите имя клиента" });
      const digits = data.newPhone.replace(/\D/g, "");
      if (digits.length < 10) ctx.addIssue({ code: "custom", path: ["newPhone"], message: "Введите корректный телефон" });
    }
    if (data.service_type === "repair") {
      if (!data.device_type.trim()) ctx.addIssue({ code: "custom", path: ["device_type"], message: "Укажите тип устройства" });
      if (!data.issue_description.trim()) ctx.addIssue({ code: "custom", path: ["issue_description"], message: "Опишите неисправность" });
    }
    if (data.service_type === "print") {
      if (!data.print_document_type.trim()) {
        ctx.addIssue({ code: "custom", path: ["print_document_type"], message: "Укажите тип документа" });
      }
    }
  });

export type CreateOrderFormValues = z.infer<typeof createOrderFormSchema>;

export function buildAccessoriesPayload(v: CreateOrderFormValues): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (v.acc_power) o.power_supply = true;
  if (v.acc_usb) o.usb_cable = true;
  if (v.acc_power_cable) o.power_cable = true;
  if (v.acc_mouse) o.mouse = true;
  if (v.acc_keyboard) o.keyboard = true;
  if (v.acc_cartridge) o.cartridge = true;
  if (v.acc_other.trim()) o.other = v.acc_other.trim();
  return o;
}

export function normalizePhoneRu(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("8") && d.length >= 11) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  if (d.startsWith("7") && d.length === 11) return `+${d}`;
  return raw.trim().startsWith("+") ? raw.trim() : `+${d}`;
}

import { z } from "zod";

const phoneRu = z
  .string()
  .min(10, "Укажите телефон")
  .regex(/^\+7[\d\s()-]+$/, "Формат: +7 и цифры");

export const createClientSchema = z.object({
  type: z.enum(["person", "company"]),
  name: z.string().min(1, "Укажите имя или название"),
  phone: phoneRu,
  email: z.string().email("Некорректный email").or(z.literal("")),
  address: z.string(),
  comment: z.string(),
});

export type CreateClientFormValues = z.infer<typeof createClientSchema>;

export const clientEditSchema = z.object({
  type: z.enum(["person", "company"]),
  name: z.string().min(1, "Укажите имя или название"),
  phone: phoneRu,
  email: z.string().email("Некорректный email").or(z.literal("")),
  address: z.string(),
  comment: z.string(),
  tags: z.array(z.string()),
});

export type ClientEditFormValues = z.infer<typeof clientEditSchema>;

export const smsSendSchema = z.object({
  notif_type: z.string().min(1, "Укажите тип"),
  title: z.string(),
  body: z.string().min(1, "Введите текст SMS"),
});

export type SmsSendFormValues = z.infer<typeof smsSendSchema>;

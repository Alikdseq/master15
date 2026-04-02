import { test, expect } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "admin@example.com";
const password = process.env.E2E_PASSWORD ?? "Passw0rd123";

test("login and open orders list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заказы" })).toBeVisible();
});

test("create order via UI", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();

  await page.getByRole("link", { name: "Заказы" }).click();
  await page.getByRole("link", { name: "+ Новый заказ" }).click();
  await expect(page.getByRole("heading", { name: "Новый заказ" })).toBeVisible();

  // Select first real client option (option[0] is usually empty).
  const clientSelect = page.getByLabel("Клиент");
  const v = await clientSelect.locator("option").nth(1).getAttribute("value");
  if (!v) throw new Error("No client options found");
  await clientSelect.selectOption(v);
  await page.getByLabel("Устройство (обязательно)").fill("Принтер");
  await page.getByLabel("Неисправность (обязательно)").fill("E2E test");
  await page.getByRole("button", { name: "Создать" }).click();

  await expect(page).toHaveURL(/\/orders\/\d+$/);
  await expect(page.getByText(/Заказ/)).toBeVisible();
});

test("change status on order card", async ({ page }) => {
  // Ensure desktop layout for stable DataGrid locators.
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();

  // Open the first order from the list.
  await page.getByRole("link", { name: "Открыть" }).first().click();

  // Wait until order detail is loaded.
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  await expect(page.getByLabel("Новый статус")).toBeVisible();

  // Move order to "Согласование".
  await page.getByLabel("Новый статус").click();
  await page.getByRole("option", { name: "Согласование" }).click();
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText("Согласование")).toBeVisible();
});

test("master cannot open admin", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto("/login");
  await page.getByLabel("Email").fill("master@example.com");
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();

  // Ensure login redirect completed.
  await expect(page.getByRole("heading", { name: /^Заказы$/ })).toBeVisible();

  await page.goto("/admin");
  // Should be redirected back to the orders list by UI RBAC.
  await expect(page.getByRole("heading", { name: /^Заказы$/ })).toBeVisible();
});

test("inventory stock report visible", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();

  await page.getByRole("link", { name: "Склад" }).click();
  await expect(page.getByRole("heading", { name: /^Склад$/ })).toBeVisible();
});

test("reports page loads", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();

  await page.getByRole("link", { name: "Отчёты" }).click();
  await expect(page.getByText("Отчёты (XLSX)")).toBeVisible();
});


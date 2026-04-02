## Назначение документа
Этот документ описывает:
1. Что находится на каждой странице фронтенда (структура UI, ключевые элементы, состояния).
2. Какие данные подгружаются с бэка (точные эндпоинты, методы, query/body).
3. Какие поля ожидаются в ответах (минимально необходимые для отображения).

Документ предназначен для передачи:
- веб-дизайнеру (как визуально оформить страницы: блоки, таблицы, формы, отступы, состояния);
- фронтенд-разработчику (как реализовать UI и интеграцию с API по контракту из разделов).

## Глобальные допущения и архитектура
### Роли и доступ
Фронтенд использует JWT и защищённые роуты:
- Роуты внутри `RequireAuth` доступны только если `accessToken` присутствует в состоянии авторизации.
- `RequireRole` ограничивает отдельные страницы:
  - `admin`:
    - `/dashboard`
    - `/reports`
    - `/admin`
  - `admin`, `manager`:
    - `/orders/new`
    - `/reports`

### Глобальный Layout (общие элементы)
Все страницы внутри `RequireAuth` обёрнуты компонентом `Layout`:
- Верхняя панель (`AppBar`):
  - логотип/название: “Мастер Принт CRM”
  - текст: `email (role)`
  - кнопка “Выйти” (logout + переход на `/login`)
- Сайдбар (`Drawer`):
  - пункты навигации:
    - `/dashboard` (только `admin`)
    - `/orders`
    - `/clients`
    - `/inventory`
    - `/reports` (только `admin`, `manager`)
    - `/admin` (только `admin`)
- Основная область:
  - `Outlet` для рендера текущей страницы

### Стандартные UI-компоненты
1. `PageHeader`
   - левый блок: `title` (h6) + `subtitle` (body2, secondary color)
   - правый слот `rightSlot` (произвольные элементы) и опциональный CTA-кнопка
2. `StatusBadge`
   - отображение статуса компактной меткой:
     - точка (цвет по коду)
     - `label`

### Базовые эндпоинты API и авторизация
Фронтенд создаёт axios-инстанс в `frontend/src/lib/api.ts`.

По Docker (как сейчас в `docker-compose.yml`) предполагается:
- `VITE_API_BASE_URL = "http://localhost:8000/api"`

Авторизация:
- в заголовке `Authorization: Bearer <accessToken>`
- refresh выполняется через `POST /api/auth/refresh/` с телом `{ refresh }`

### Стили и согласованность (рекомендации для дизайнера)
- Использовать единый ритм отступов: `Paper` как “карточка”, `sx={{ p: ... }}` как в текущем интерфейсе.
- Таблицы и списки: `DataGrid` с фиксированными ширинами ключевых колонок + гибкими (flex).
- Критичные действия: `variant="contained"` (первичные) и `color="error"` (удаление).
- Диалоги:
  - статусы/переходы — `maxWidth="sm"` или `md` (как в реализации)
  - подтверждения — `maxWidth="xs"`

---

## Роуты и страницы (карта)
1. `/login`
2. `/dashboard` (admin)
3. `/orders` (список)
4. `/orders/new` (admin/manager)
5. `/orders/:id` (детальная карточка заказа)
6. `/clients` (список)
7. `/clients/:id` (карточка клиента)
8. `/inventory` (склад)
9. `/reports` (admin/manager) — ссылки на XLSX
10. `/admin` (admin) — управление статусами/настройками/порогами/аудитом/пользователями/бэкапами

---

## 1) LoginPage (`/login`)
### Назначение
Вход пользователя в CRM.

### Что на странице (UI)
- Центральный контейнер (`Container maxWidth="sm"`)
- Карточка (`Paper`) с:
  - заголовком: “Вход в CRM”
  - полями:
    - `Email` (TextField)
    - `Пароль` (TextField type=password)
  - кнопка “Войти”
  - область ошибок (`Alert severity="error"`)

### Состояния
- Loading: кнопка “Войти” `disabled`
- Error: показ `detail` из ответа, иначе “Не удалось войти”

### Какие данные подгружаются с бэка
1. `POST /api/auth/token/`
   - body: `{ email, password }`
   - ожидаемый ответ:
     - `access` (access token)
     - `refresh` (refresh token)

### Дальнейшие действия
- После успешного login: переход на `/orders`.

---

## 2) DashboardPage (`/dashboard`) — админская сводка
### Назначение
Показать KPI по заказам и среднее время выполнения.

### Что на странице (UI)
- Карточка (`Paper p=3`)
  - заголовок “Дашборд” (h6)
  - текстовые KPI:
    - “Заказы: сегодня X, неделя Y, месяц Z”
    - “Среднее время выполнения (ч): AVG”
  - состояния загрузки/ошибок:
    - пока нет данных: `CircularProgress`
    - ошибка: `Alert severity="error"`

### Какие данные подгружаются с бэка
1. `GET /api/reports/dashboard/`
   - ожидаемые поля ответа:
     - `orders.today`
     - `orders.week`
     - `orders.month`
     - `avg_completion_hours` (может быть `null`, тогда отображается `—`)

---

## 3) OrdersListPage (`/orders`) — список заказов
### Назначение
Поиск и фильтрация заказов + быстрый доступ к карточкам.

### Что на странице (UI)
- `Paper` с отступами: `p={xs:2, sm:2.5}`
- `PageHeader`
  - title: “Заказы”
  - subtitle: “Поиск, фильтры и быстрый доступ к карточкам”
  - CTA "+ Новый заказ" показывается если `role` = `admin` или `manager` и ведёт на `/orders/new`
- Фильтры (Grid-строка):
  1. Поиск:
     - label: “Поиск (номер / телефон / устройство)”
     - TextField controlled `search`
  2. Select “Статус”:
     - значения: `all`, `accepted`, `diagnostics`, `negotiation`, `waiting_parts`, `repair`, `ready`, `completed`
  3. Select “Мастер”:
     - значения: `all`, `me` (опционально, если доступно), иначе число
  4. Chip “Сбросить”
     - сбрасывает search/status/master
- Блок “Активные фильтры”:
  - если фильтры не `all`: показываются `Chip` с возможностью удаления
- Блок ошибки (`Alert severity="error"`)
- Основной список:
  - Desktop (не mobile):
    - `DataGrid` высота ~600px
    - колонки:
      - `order_number` → “Номер”
      - `received_date` → “Дата”
      - `device_type` → “Устройство”
      - `client` → “Клиент”
        - value “name” или “#id”
      - `status` → “Статус”
        - рендер `StatusBadge` по `status.name` и `status.code`
      - (колонка без названия) “Открыть”
        - Chip “Открыть”, кликабельный `RouterLink` → `/orders/:id`
  - Mobile:
    - список карточек (`Paper` на каждый заказ)
    - внутри:
      - номер и статус в одной строке
      - дата `received_date`
      - устройство `device_type`
      - ссылка на `/orders/:id` через `component={RouterLink}`

### Состояния
- `loading`:
  - Desktop: `DataGrid loading={loading}`
  - Mobile: при отсутствии данных показывается “Ничего не найдено...”
- Empty:
  - Desktop — DataGrid пустой
  - Mobile — Paper с текстом “Ничего не найдено. Попробуйте изменить фильтры или поиск.”

### Какие данные подгружаются с бэка
1. `GET /api/orders/`
   - query params (по факту пользовательских фильтров):
     - `search` (debounced, trimmed)
     - `status` (если не `all`)
     - `master`:
       - если `master === "me"` → подставляется `auth.userId`
       - иначе → число
   - ожидаемый ответ:
     - `data.results[]`, каждый элемент содержит минимум:
       - `id`
       - `order_number`
       - `received_date`
       - `device_type`
       - `status: { name, code }` (опционально)
       - `client`:
         - либо объект `{ id, name, phone }`
         - либо число (id)

---

## 4) OrderCreatePage (`/orders/new`)
### Назначение
Создание нового заказа.

### Что на странице (UI)
- `Paper p=3`
  - Заголовок: “Новый заказ”
  - Ошибка: `Alert severity="error"`
  - Форма (`Box component="form" onSubmit`)
    - Select “Клиент” (native option):
      - опции из списка клиентов
      - placeholder пустой вариант
    - TextField “Устройство (обязательно)”
    - TextField “Модель”
    - TextField multiline “Неисправность (обязательно)”
    - Кнопка “Создать”

### Какие данные подгружаются с бэка
1. `GET /api/clients/` для списка клиентов
   - query: `{ ordering: "-id" }`
   - ожидаемые поля:
     - `id`, `name`, `phone` (минимум)
2. `POST /api/orders/` при создании
   - body:
     - `client` (number)
     - `device_type` (string)
     - `device_model` (string)
     - `issue_description` (string)
     - `received_date` (string `YYYY-MM-DD`)
   - ожидаемый ответ: `id` созданного заказа
   - действие: переход на `/orders/:id`

---

## 5) OrderDetailPage (`/orders/:id`) — карточка заказа
### Назначение
Просмотр деталей заказа, изменение статуса, управление материалами, редактирование полей и история изменений.

### Что на странице (UI, структура)
Основная обёртка: `Box sx={{ display: "grid", gap: 2 }}`

1. Верхняя карточка (Paper)
   - `PageHeader`
     - title: `Заказ №${order.order_number}`
     - subtitle: `${device_type} · ${device_model}`
     - rightSlot:
       - `StatusBadge` текущего статуса
       - кнопки редактирования/удаления:
         - показываются если `canEditOrder` (role `admin` или `manager`)
         - редактирование открывает диалог
         - удаление открывает подтверждение
   - `Divider`
   - Сетка (2 колонки на md):
     - Левый блок: “Клиент и устройство”
     - Правый блок: “Сроки и стоимость”

2. Блок “Статус”
   - Select “Новый статус” (из `allowedNextStatusCodes`)
   - TextField “Комментарий (в историю)”
   - Кнопка “Применить”
     - при статусе `ready` открывается дополнительное подтверждение SMS
   - Подсказка о SMS (текст)

3. Сетка (на md 2 колонки):
   - Левый Paper: “Использованные материалы”
     - кнопка “Добавить материал” → открывает диалог
     - список использованных материалов:
       - `product_name`, `product_sku`, `quantity`
   - Правый Paper: “История статусов”
     - список записей:
       - `StatusBadge` + `changed_at` (formatted)
       - `comment`

4. Диалоги:
   - `Dialog` подтверждения перевода в “Готов” (SMS)
   - `Dialog` “Материалы для заказа” (autocomplete товара + количество + сохранение/отмена)
   - `Dialog` “Удалить заказ” (подтверждение)
   - `Dialog` “Редактирование заказа” (форма на react-hook-form + zod)

### Какие данные подгружаются с бэка
При первом `load()` выполняется параллельно:
1. `GET /api/orders/:id/`
   - ожидаемые поля заказа (минимум):
     - `id`
     - `order_number`
     - `device_type`
     - `device_model`
     - `serial_number`
     - `issue_description`
     - `received_date`
     - `desired_completion_date`
     - `preliminary_cost`
     - `final_cost`
     - `refusal_mark`
     - `accessories` (опционально, может быть array/string/object)
     - `status: { name, code }` (опционально)
     - `client` (число id или объект `{ id, name, phone }`)
     - `assigned_master` (число id или объект `{ id, name, email }`)
2. `GET /api/orders/:id/history/`
   - ожидаемые поля истории:
     - `id`
     - `status: { name, code }`
     - `changed_at` (date-time)
     - `comment`
3. `GET /api/orders/:id/used-products/`
   - ожидаемые поля использованных материалов:
     - `product_name`
     - `product_sku`
     - `quantity`
     - внутренне также используются `product` и `quantity` при сохранении
4. `GET /api/orders/status-options/`
   - ожидаемые поля:
     - `statuses[]`: `{ code, name, ... }`
     - `transitions[]`: `{ from, to, ... }`

Дополнительно:
5. При вводе товаров в диалоге материалов:
   - `GET /api/inventory/products/?search=...`
   - ожидаемые поля:
     - `id`, `name`, `sku`, `unit`
6. При вводе клиентов в диалоге редактирования:
   - `GET /api/clients/?search=...&ordering=-id`
   - ожидаемые поля:
     - `id`, `name`, `phone`

### Пользовательские действия и эндпоинты
1. Изменение статуса:
   - POST `/api/orders/:id/change-status/`
   - body: `{ to_status: <statusCode>, comment: <comment> }`
   - при статусе `ready` дополнительно показывается подтверждение SMS
2. Добавление/обновление материалов:
   - PUT `/api/orders/:id/used-products/`
   - body:
     - `{ items: [{ product: number|null, quantity: string }, ...] }`
3. Удаление заказа:
   - DELETE `/api/orders/:id/`
   - после успеха: переход на `/orders`
4. Редактирование заказа (форма):
   - PATCH `/api/orders/:id/`
   - body:
     - `client_id` → в запросе используется как `client`
     - `device_type`
     - `device_model`
     - `serial_number`
     - `issue_description`
     - `received_date`
     - `desired_completion_date` (может быть `null`)
     - `preliminary_cost` (может быть `null`)
     - `final_cost` (может быть `null`)
     - `refusal_mark`

### Состояния
- Loading: `loading` используется как флаг; если `!order` и loading — страница может отрисовать пусто.
- Error: показывается `Alert severity="error"` текстом из `detail` или дефолтного сообщения.

---

## 6) ClientsListPage (`/clients`) — список клиентов
### Назначение
Поиск клиентов и быстрый переход в карточку.

### Что на странице (UI)
- `Paper p=2`
  - заголовок “Клиенты” (h6)
  - TextField поиска:
    - label: “Поиск (телефон / имя / email)”
  - `DataGrid`:
    - колонки:
      - `name` → “Клиент”
      - `phone` → “Телефон”
      - `orders_count` → “Заказов”
      - “Открыть” (кнопка “Карточка” → `/clients/:id`)
  - DataGrid высота ~560px

### Состояния
- Error не отображается отдельным `Alert` (в текущем коде — только “тихое” поведение)
- Empty: DataGrid пустой

### Какие данные подгружаются с бэка
1. `GET /api/clients/`
   - query:
     - если `search` не пустой: `{ search }`
     - иначе: `{}` (без params)
   - ожидаемый формат:
     - `data.results[]`
   - ожидаемые поля на строку:
     - `id`, `name`, `phone`, `orders_count` (опционально), `email` (в типе)

---

## 7) ClientDetailPage (`/clients/:id`) — карточка клиента
### Назначение
Показать данные клиента, историю заказов и список заметок. Добавлять новые заметки.

### Что на странице (UI)
- `Paper p=3`
  - верх:
    - Имя клиента (h6)
    - Телефон (body1/обычный Typography)
  - Раздел “История заказов”
    - список строк (каждая строка — `Box` с borderBottom)
    - формат: `order_number · received_date · status.name`
  - Раздел “Заметки”
    - форма добавления заметки:
      - TextField “Новая заметка”
      - кнопка “Добавить”
    - список заметок:
      - `n.text`

### Какие данные подгружаются с бэка
1. `GET /api/clients/:id/` — данные клиента
   - ожидаемые поля:
     - `name`, `phone`
2. `GET /api/clients/:id/orders/` — история заказов клиента
   - ожидаемые поля на элементы:
     - `id`
     - `order_number`
     - `received_date`
     - `status: { name }` (опционально)
3. `GET /api/clients/:id/notes/` — список заметок
   - ожидаемые поля:
     - `id`, `text`
4. POST добавление заметки:
   - `POST /api/clients/:id/notes/`
   - body: `{ text: noteText }`
   - после успеха: повторная загрузка всех секций (`load()`)

### Состояния
- Error: `Alert severity="error"` (сообщение из `catch`)

---

## 8) InventoryPage (`/inventory`) — склад
### Назначение
Просмотр остатков по товарам, выполнение приход/списание и просмотр движений по конкретному товару.

### Что на странице (UI)
- `Paper p=2`
  - заголовок “Склад” (h6)

1. Блок действий по складу (2 группы):
   - Приход:
     - TextField “Product ID (приход)”
     - TextField “Кол-во”
     - Button “Поступление”
   - Списание:
     - TextField “Product ID (списание)”
     - TextField “Кол-во”
     - Button “Списание”

2. Таблица остатков:
   - `DataGrid` высота ~560px
   - колонки:
     - `name` → “Товар”
     - `sku` → “SKU”
     - `current_stock` → “Остаток”
     - `min_stock` → “Порог”
     - `is_low_stock` → “Ниже порога” (Да/Нет)
     - “История”:
       - Button “Смотреть”
       - включение/выключение в зависимости от выбранного товара и наличия движений

3. Блок движений склада:
   - заголовок “Движения склада”
   - текст-статус:
     - если `selectedProductId`: “Товар ID: ...”
     - иначе: “Выберите товар в таблице выше”
   - DataGrid (высота ~320px):
     - `created_at` → “Дата”
     - `type` → “Тип”
     - `quantity` → “Кол-во”
     - `reason` → “Причина”
     - `order_number` → “Заказ”
     - `comment` → “Комментарий”

### Доступ на запись
- Запись разрешена если `role` = `admin` или `manager`.
- Иначе input/button для прихода/списания отключены.

### Какие данные подгружаются с бэка
1. `GET /api/inventory/products/stock-report/`
   - ожидаемые поля на продукт:
     - `id`, `name`, `sku`, `current_stock`, `min_stock`, `is_low_stock`
2. При выборе товара (по `selectedProductId`):
   - `GET /api/inventory/products/:productId/movements/`
   - ожидаемые поля на движение:
     - `id`, `created_at`, `type`, `quantity`, `reason`
     - `order_number` (nullable)
     - `comment` (nullable)
     - `product`, `sku`
3. Приход:
   - `POST /api/inventory/movements/in/`
   - body: `{ product: inProductId, quantity: inQty, comment: "Приход из UI" }`
4. Списание:
   - `POST /api/inventory/movements/out/`
   - body: `{ product: outProductId, quantity: outQty, comment: "Списание из UI" }`
5. После успешных движений: повторная загрузка таблицы остатков (`load()`)

---

## 9) ReportsPage (`/reports`) — выгрузки XLSX
### Назначение
Дать пользователю скачать XLSX отчёты за период.

### Что на странице (UI)
- `Paper p=2`
  - заголовок: “Отчёты (XLSX)”
  - блок фильтра периода:
    - TextField “С” (default `2026-03-01`)
    - TextField “По” (default `2026-03-31`)
  - блок кнопок (ссылки, открываются в новой вкладке):
    - Button “Заказы (XLSX)” (variant contained)
    - Button “Движение склада (XLSX)” (outlined)
    - Button “Финансы (XLSX)” (outlined)

### Какие данные подгружаются
В текущей реализации данные не подгружаются через axios.
Кнопки — это ссылки на скачивание файлов:
1. `<API_BASE>/reports/orders.xlsx?from=...&to=...`
2. `<API_BASE>/reports/stock-movements.xlsx?from=...&to=...`
3. `<API_BASE>/reports/finance.xlsx?from=...&to=...`

Где `<API_BASE>`:
- `VITE_API_BASE_URL` (если задан), иначе `http://127.0.0.1:8000/api`

---

## 10) AdminPage (`/admin`) — админка
### Назначение
Управление:
1. Статусами и переходами статусов заказа
2. SMS шаблонами и системными настройками
3. Порогами минимальных остатков
4. Аудит-логами
5. Пользователями
6. Бэкапами

### Что на странице (UI)
- `Paper p=2`
  - заголовок: “Администрирование”
  - `Alert severity="info"` при наличии `msg`
  - `Tabs`:
    - “Статусы”
    - “SMS шаблоны”
    - “Пороги склада”
    - “Аудит”
    - “Пользователи”
    - “Бэкапы”

Ниже — содержимое каждого `tab`.

### Общая логика данных
Страница при монтировании вызывает `loadAll()`:
- параллельно грузит статусы, переходы, настройки, товары для порогов и список пользователей.

---

### 10.1) Tab 0: Статусы
UI:
- Заголовок “Статусы”
- Кнопки:
  - “+ Добавить статус”
  - “Проверить граф” (POST validate, disabled при `graphValidating`)
- При наличии ошибок графа: `Alert severity="error"` со списком строк
- `DataGrid` статусов:
  - колонки:
    - code
    - name
    - sort_index (Порядок)
    - is_final (чип Да/—)
    - is_active (чип Да/—)
    - actions: кнопка “Редактировать”
- Блок “Переходы статусов”:
  - кнопка “+ Добавить переход”
  - `DataGrid` переходов:
    - from_code
    - to_code
    - is_enabled
    - actions: “Изменить”

Диалоги:
- Диалог статуса:
  - mode: create/edit
  - поля:
    - code
    - name
    - sort_index
    - is_active
    - is_final
- Диалог перехода:
  - mode: create/edit
  - поля:
    - from_status (select по статусам)
    - to_status (select по статусам)
    - is_enabled (checkbox)

API:
1. `GET /api/admin/order-statuses/`
2. `GET /api/admin/order-status-transitions/`
3. `POST /api/admin/order-statuses/validate/` body `{}`
   - ожидаемый ответ:
     - `valid` boolean
     - `errors[]` (если invalid)
4. Создание статуса:
   - `POST /api/admin/order-statuses/` (body = statusDraft)
5. Редактирование статуса:
   - `PATCH /api/admin/order-statuses/:id/`
6. Создание перехода:
   - `POST /api/admin/order-status-transitions/`
7. Редактирование перехода:
   - `PATCH /api/admin/order-status-transitions/:id/`

Минимальные поля для статусов/переходов (как ожидает UI):
- статус:
  - `id`, `code`, `name`, `sort_index`, `is_final`, `is_active`
- переход:
  - `id`, `from_status`, `to_status`, `is_enabled`

---

### 10.2) Tab 1: SMS шаблоны / настройки
UI:
- Заголовок “Настройки (SystemSetting)”
- Поля:
  - select `key` (только ограниченный набор `KNOWN_SETTING_KEYS`)
  - TextField “value (JSON)” (multiline)
  - кнопка “Сохранить”
Сообщение о результате в `msg` (Alert)

API:
1. `GET /api/admin/settings/`
   - UI ожидает:
     - `data.results` (или data напрямую)
     - каждый entry содержит `{ key, value }`
2. `POST /api/admin/settings/`
   - body: `{ key: settingKey, value: parsedJSON }`

---

### 10.3) Tab 2: Пороги склада (min stock)
UI:
- Заголовок “Пороги минимальных остатков”
- Кнопки:
  - “Сохранить”
  - “Обновить”
- `DataGrid` товаров:
  - колонки:
    - name
    - sku
    - current_stock (остаток)
    - min_stock (редактируемое поле через TextField в ячейке)

API:
1. `GET /api/inventory/products/stock-report/`
2. `POST /api/inventory/products/bulk-update-min-stock/`
   - body:
     - `{ items: [{ product: number, min_stock: string }, ...] }`

---

### 10.4) Tab 3: Аудит
UI:
- Заголовок “Аудит действий”
- Фильтры:
  - action (TextField)
  - actor (TextField, ожидается id)
  - type (TextField)
  - from (type=date)
  - to (type=date)
  - кнопка “Применить”
- `DataGrid` audit logs:
  - created_at
  - action
  - object_type
  - object_id
  - actor_email
  - meta (показывается JSON в моноширинном шрифте)

API:
1. `GET /api/admin/audit-logs/` с query params:
   - `action`, `actor`, `type`, `from`, `to` (только если поля заполнены)

---

### 10.5) Tab 4: Пользователи
UI:
- DataGrid users:
  - email
  - name
  - phone
  - role
  - is_active (Да/Нет чип или текст)
  - actions:
    - кнопка “Сброс пароля”
- Блок “Создать пользователя”:
  - поля:
    - email, name, phone
    - role (select)
    - password (type=password)
    - is_active (checkbox)
  - кнопка “Создать”

API:
1. `GET /api/users/`
2. `POST /api/users/` body = userCreateDraft
3. Сброс пароля:
   - `POST /api/users/:id/reset-password/` body `{}`
   - ожидаемый ответ:
     - `temporary_password`

---

### 10.6) Tab 5: Бэкапы
UI:
- Заголовок “Бэкапы”
- Поля:
  - кнопка “Создать бэкап” (enabled/disabled по backupRunning)
  - TextField: “Имя бэкапа (backup_*.json)”
  - кнопка “Скачать” (outlined)
  - кнопка “Восстановить” (outlined, color=error)

API:
1. Создать:
   - `POST /api/admin/backups/run/` body `{}`
   - ожидаемый ответ:
     - `path` (строка пути/имени)
2. Скачать:
   - `GET /api/admin/backups/download/`
   - query: `{ name: backupName }`
   - ожидается `blob` (файл)
3. Восстановить:
   - `POST /api/admin/backups/restore/`
   - body: `{ name: backupName }`

---

## Примечания по контрактам данных (для фронтенд-разработчика)
1. Во многих местах фронт ожидает формат `data.results` (PageNumberPagination/DRF pagination).
   - Если backend возвращает `results` внутри `data`, UI использует `r.data.results`.
2. Сущности, где есть `status`, ожидают структуру:
   - `{ name: string, code: string }`
3. `clients` и `orders` в некоторых местах могут вернуть `client` как:
   - либо объект
   - либо id-число
   UI это учитывает в рендере (например, для `ClientsListPage` и `OrderDetailPage`).
4. Файлы отчётов скачиваются по ссылкам (не через axios), поэтому:
   - backend должен отдавать эти endpoints как direct download.

---

## Что делать дальше
1. Дизайнеру:
   - Использовать этот документ как blueprint: секции, формы, таблицы, диалоги и текстовые состояния.
2. Фронтенд-разработчику:
   - Реализовать/перепривязать UI на новые макеты, сохраняя:
     - структуру эндпоинтов
     - ожидания по `data.results`/полям
     - поведение кнопок/диалогов.



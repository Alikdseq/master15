## Security baseline (этап J)

### 1) RBAC / доступы (TC‑41)
- Проверить, что **master** не имеет доступа к `/api/admin/*`
- Проверить, что **manager** не имеет доступа к `/api/reports/dashboard/` (admin only)
- Проверить, что **неавторизованный** запрос к защищённым endpoint → 401

### 2) SQLi (TC‑42)
- Поиск: `/api/orders/?search=' OR '1'='1` не должен падать 500 и не должен “раскрывать” лишние данные.
- Аналогично для `/api/clients/?search=...`

### 3) XSS (TC‑43)
- Ввести в `clients.comment` или заметку клиента строку `<script>alert(1)</script>`
- Убедиться, что UI отображает это **как текст** (React экранирует) и не исполняет.

### 4) JWT/сессии
- Access token имеет ограниченный срок жизни (настройки SIMPLE_JWT)
- Refresh токен работает, logout на фронте удаляет токены

### 5) Transport
- Для prod: только HTTPS, корректные `ALLOWED_HOSTS`, CORS ограничить доменом фронта


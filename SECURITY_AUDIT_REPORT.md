# Аудит безопасности CRM «Мастер Принт»

Дата: 2026-03-27

## 1) Найденные уязвимости и статус

| Категория | Описание проблемы | Местоположение | Риск | Ссылка на документ | Рекомендация | Статус |
|---|---|---|---|---|---|---|
| Аутентификация / brute-force | Не было ограничений на попытки входа (`/api/auth/token/`), что позволяло подбор пароля. | `backend/users/auth_views.py`, `backend/config/settings.py` | Высокий | п.3.1, п.4.1 (ограничение попыток 5/15 мин) | Включить rate limit на login и глобальные throttle DRF. | Исправлено |
| JWT | Срок жизни access token по умолчанию был 60 минут (длиннее рекомендованных 15-30 минут). | `backend/config/settings.py`, `backend/.env.example` | Средний | п.4.1 (JWT 15-30 минут) | Уменьшить access lifetime до 30 минут, refresh оставить отдельным. | Исправлено |
| HTTP security headers / HTTPS hardening | Не было принудительных security headers и production-профиля secure-cookie/HSTS/SSL redirect. | `backend/config/settings.py` | Высокий | п.3.7, п.4.2 (HTTPS, защищённые cookie) | Включить secure-параметры в production + CSP/XFO/NoSniff/Referrer-Policy. | Исправлено |
| CORS | Разрешённый origin был захардкожен в коде, без централизованного env-управления. | `backend/config/settings.py`, `backend/.env.example` | Средний | п.4.1 (CORS только доверенный домен) | Чтение списка origin из `DJANGO_CORS_ALLOWED_ORIGINS`. | Исправлено |
| Загрузка файлов | Загрузка файлов печати не проверяла MIME, расширение и размер. | `backend/orders/views.py` (`upload_print_files`) | Высокий | п.4.2 (валидация расширения/MIME/размера) | Проверять allowlist расширений/MIME и ограничивать размер файла. | Исправлено |
| Секреты/пароли инфраструктуры | В `docker-compose.yml` использовались небезопасные дефолты пароля БД прямо в файле. | `docker-compose.yml` | Средний | п.3.6, п.4.2 (секреты в env, сложный пароль БД) | Использовать переменные окружения с безопасным placeholder, не хранить реальные секреты в compose. | Исправлено |
| Хранение токенов на фронтенде | JWT хранится в `localStorage`, что повышает риск кражи токенов при XSS. | `frontend/src/lib/auth.ts`, `frontend/src/lib/api.ts` | Средний | п.5.2 (предпочтительно HttpOnly cookie) | Перейти на cookie-based auth (`HttpOnly`, `Secure`, `SameSite=Strict`) при поддержке backend. | Требует архитектурного изменения |
| Зависимости Python | `pip-audit` нашёл уязвимость в `pygments==2.19.2` (CVE-2026-4539). | `backend/requirements.txt` | Низкий | п.4.4 (регулярные обновления зависимостей) | Обновить `pygments` до версии с исправлением после выхода/публикации фикс-версии. | Открыто |
| Зависимости npm | `npm audit` нашёл high в `xlsx` (fix unavailable) и moderate в `yaml` (через dev-зависимость). | `frontend/package.json` / lockfile | Средний | п.4.4 (npm audit) | Для `xlsx`: рассмотреть замену библиотеки или sandbox/ограничение входных файлов; для `yaml`: выполнить `npm audit fix` и проверить сборку. | Частично открыто |

## 2) Реализованные исправления (код)

### `backend/config/settings.py`
- Добавлены:
  - production guard для `DJANGO_SECRET_KEY`;
  - CORS из env: `DJANGO_CORS_ALLOWED_ORIGINS`;
  - DRF throttling (`anon`, `user`, `login`);
  - уменьшенный `JWT_ACCESS_MINUTES` по умолчанию до 30;
  - secure-cookie/HSTS/SSL redirect в non-debug;
  - security headers и параметры CSP;
  - конфиг allowlist/лимитов upload (`UPLOAD_*`).

### `backend/users/auth_views.py`
- Для login endpoint добавлен scoped throttle:
  - `throttle_classes = [ScopedRateThrottle]`
  - `throttle_scope = "login"`

### `backend/security/middleware.py` (новый файл)
- Добавлен middleware для установки заголовка `Content-Security-Policy` на основе настроек.

### `backend/orders/views.py`
- Усилена валидация в `upload_print_files`:
  - проверка расширения файла;
  - проверка `content_type`;
  - проверка максимального размера;
  - сохранение файла под случайным именем без пользовательского basename.

### `backend/.env.example`
- Добавлены безопасные env-параметры:
  - `DJANGO_CORS_ALLOWED_ORIGINS`
  - `DRF_THROTTLE_*`
  - `UPLOAD_*`
- Изменён `JWT_ACCESS_MINUTES=30`.

### `docker-compose.yml`
- Секреты и БД-параметры переведены на env interpolation (`${...}`) с безопасным placeholder вместо фиксированного `master_print`.

## 3) Инфраструктурные инструкции (сервер)

1. **HTTPS/Nginx**
   - Настроить TLS (Let's Encrypt):
     - `sudo certbot --nginx -d crm.example.com`
   - Включить redirect `80 -> 443`.
   - Прокидывать `X-Forwarded-Proto` до Django.

2. **Firewall**
   - Открыть только `80/tcp`, `443/tcp`, `22/tcp` (SSH ограничить по IP).
   - Закрыть внешнюю доступность PostgreSQL/Redis.

3. **БД**
   - Использовать отдельного пользователя БД (не root/superuser).
   - Сложный пароль в `.env`/secret manager.
   - Разрешить доступ к БД только из приватной сети/docker network.

4. **Бэкапы**
   - Ежедневный dump + хранение вне основного сервера.
   - Пример cron:
     - `0 2 * * * pg_dump -Fc "$POSTGRES_DB" > /secure-backups/master_print_$(date +\%F).dump`
   - Шифровать архивы бэкапов.

5. **Обновления**
   - Регулярно запускать:
     - `pip-audit -r requirements.txt`
     - `npm audit`
   - Обновлять базовые Docker-образы (postgres/redis/python/node).

## 4) Проверки после исправлений

- **Статический анализ backend (`bandit`)**:
  - выявлены только low-issues в тестах (hardcoded test passwords и `assert` в pytest), high/medium в приложении не найдено.
- **`pip-audit`**:
  - 1 известная уязвимость: `pygments` (CVE-2026-4539).
- **`npm audit --omit=dev`**:
  - `xlsx` high (без доступного fix),
  - `yaml` moderate (fix available).
- **Линтер по изменённым файлам**:
  - ошибок не выявлено.

## 5) Остаточные риски / следующий этап

1. Шифрование чувствительных полей клиентов (телефон/адрес/email) на уровне приложения + миграция существующих данных.
2. Добавление security-тестов:
   - rate-limit на `/api/auth/token/`,
   - негативные тесты загрузки файлов (MIME/size/ext),
   - проверка `Content-Security-Policy` в ответах.

## 6) Дополнительные исправления (2026-03-27)

- Реализован переход auth на `HttpOnly` cookie:
  - backend: `auth/token` и `auth/refresh` выставляют cookie, добавлен `auth/logout`;
  - backend: добавлена `CookieJWTAuthentication` (чтение access из cookie);
  - frontend: удалено хранение JWT в `localStorage`, все запросы через `withCredentials`;
  - frontend: восстановление сессии при старте через `/auth/me/`;
  - websocket: поддержка авторизации по cookie без query `token`.
- заменена библиотека `xlsx` на `exceljs` в фронтенд-экспорте склада;
- выполнен `npm audit fix`, уязвимость `yaml` (dev) устранена;
- добавлено шифрование PII клиентов на уровне приложения (phone/email/address) в модели `Client`:
  - прозрачное шифрование в БД через `EncryptedCharField` (AES-256 GCM),
  - добавлены `phone_digest` и `email_digest` (HMAC digest) для безопасного индексирования,
  - миграции `0003_encrypt_client_pii` и `0004_...` для backfill и индексов;
- добавлены security-тесты:
  - проверка CSP-заголовка,
  - проверка блокировки login rate limit,
  - проверка отклонения небезопасной загрузки файлов,
  - проверка, что PII клиентов хранится в БД в шифрованном виде.

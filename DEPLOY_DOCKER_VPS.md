# Деплой CRM «Мастер Принт» на VPS через Docker (crm.master15.ru)

Эта инструкция рассчитана на VPS с **Ubuntu 22.04/24.04** (для Debian команды почти те же).
Деплой делаем через **Docker Compose**: PostgreSQL + Redis + Django (ASGI/Daphne) + Celery worker/beat + Nginx + Let’s Encrypt.

> В репозитории используются файлы:
> - `docker-compose.prod.yml` — production compose
> - `deploy/nginx/conf.d/crm.master15.ru.conf` — Nginx конфиг (пока HTTP)
> - `.env.prod` (на сервере) — переменные окружения production

---

## 0) Что должно быть готово до начала

- Домен/поддомен создан: **`crm.master15.ru`**
- DNS-запись поддомена указывает на IP VPS:
  - **A** запись: `crm` → `YOUR_VPS_IP`
- На VPS есть доступ по SSH под `root`
- Открыты порты **80** и **443** (в фаерволе VPS и/или панели провайдера)

Проверка DNS на локальном ПК:

```bash
nslookup crm.master15.ru
```

---

## 1) Подготовка VPS: обновление и установка Docker

Подключись к серверу:

```bash
ssh root@YOUR_VPS_IP
```

Обнови систему:

```bash
apt update && apt -y upgrade
```

Поставь Docker и Docker Compose plugin:

```bash
apt -y install ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Проверка:

```bash
docker --version
docker compose version
```

---

## 2) Фаервол (если включён UFW)

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

---

## 3) Куда положить проект на сервере

Рекомендую директорию:

```bash
mkdir -p /opt/master-print
cd /opt/master-print
```

### Вариант A: если проект в Git и есть доступ

```bash
git clone <REPO_URL> .
```

Если уже клонировал раньше:

```bash
git pull
```

### Вариант B: если проекта на сервере ещё нет

Загрузи файлы любым способом (SCP/WinSCP), затем проверь структуру:

```bash
cd /opt/master-print
ls
```

В корне должны быть минимум:
- `backend/`
- `frontend/`
- `docker-compose.prod.yml`
- `deploy/nginx/conf.d/crm.master15.ru.conf`

---

## 4) Создаём production окружение `.env.prod`

В корне проекта:

```bash
cd /opt/master-print
nano .env.prod
```

Пример (значения **обязательно** поменять):

```env
# --- Django ---
DJANGO_SECRET_KEY=PASTE_LONG_RANDOM_SECRET_HERE
DJANGO_ALLOWED_HOSTS=crm.master15.ru
DJANGO_CORS_ALLOWED_ORIGINS=https://crm.master15.ru
PII_ENCRYPTION_KEY=

# --- DB ---
POSTGRES_DB=master_print
POSTGRES_USER=master_print
POSTGRES_PASSWORD=PASTE_STRONG_DB_PASSWORD_HERE

# --- Frontend -> API ---
VITE_API_BASE_URL=https://crm.master15.ru/api

# --- SMS (можно оставить так до подключения провайдера) ---
SMS_PROVIDER=dummy
SMS_DRY_RUN=1
```

Сгенерировать `DJANGO_SECRET_KEY` на сервере:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(64))
PY
```

---

## 5) Первый запуск (HTTP, без SSL) — поднимаем backend/worker/beat + БД/Redis + Nginx

Поднимаем сервисы:

```bash
cd /opt/master-print
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build postgres redis backend worker beat nginx
```

Проверяем статусы:

```bash
docker compose -f docker-compose.prod.yml ps
```

Если что-то не стартовало — смотри логи:

```bash
docker compose -f docker-compose.prod.yml logs -n 200 backend
docker compose -f docker-compose.prod.yml logs -n 200 nginx
docker compose -f docker-compose.prod.yml logs -n 200 worker
docker compose -f docker-compose.prod.yml logs -n 200 beat
```

---

## 6) Собираем фронтенд (production build)

Команда один раз собирает фронт в `dist`, и Nginx начинает его раздавать:

```bash
cd /opt/master-print
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm frontend
```

Проверка сайта по HTTP:
- открой `http://crm.master15.ru`

---

## 7) Выпускаем SSL (Let’s Encrypt)

Важно:
- DNS должен уже указывать на VPS
- порт 80 должен быть доступен извне

Выпускаем сертификат:

```bash
cd /opt/master-print
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d crm.master15.ru \
  --email YOUR_EMAIL@example.com \
  --agree-tos --no-eff-email
```

После успешного выпуска сертификата нужно **добавить HTTPS-сервер блок** в nginx конфиг и включить редирект 80→443.
Файл для правки:
- `deploy/nginx/conf.d/crm.master15.ru.conf`

Далее перезапусти Nginx:

```bash
docker compose -f docker-compose.prod.yml restart nginx
```

Проверка:
- открой `https://crm.master15.ru`

---

## 8) Создать админа Django (если нужно)

```bash
cd /opt/master-print
docker compose --env-file .env.prod -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

Проверка админки:
- `https://crm.master15.ru/admin/`

---

## 9) Обновление проекта (когда вышел новый код)

1) Забрать изменения:

```bash
cd /opt/master-print
git pull
```

2) Пересобрать и перезапустить backend/worker/beat/nginx:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build backend worker beat nginx
```

3) Пересобрать фронт:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm frontend
docker compose -f docker-compose.prod.yml restart nginx
```

---

## 10) Диагностика проблем (самое полезное)

### 10.1 Контейнеры

```bash
docker compose -f docker-compose.prod.yml ps
```

### 10.2 Логи

```bash
docker compose -f docker-compose.prod.yml logs -n 200 backend
docker compose -f docker-compose.prod.yml logs -n 200 nginx
docker compose -f docker-compose.prod.yml logs -n 200 worker
docker compose -f docker-compose.prod.yml logs -n 200 beat
```

### 10.3 Частые причины

- **502 Bad Gateway**: Nginx не достучался до backend → смотри логи `nginx` и `backend`.
- **Сайт открывается, но API не работает**: проверь `VITE_API_BASE_URL` в `.env.prod`, и что Nginx проксирует `/api/`.
- **WebSocket не работает**: убедись, что запросы идут на `/ws/` и что `backend` поднят через `daphne` (а не `runserver`).

### 10.4 Порты 80/443 заняты «нужным» nginx на хосте (панель, другой сайт)

Если `ss` показывает `nginx` на `*:80` и это **нельзя отключить**, оставьте в `docker-compose.prod.yml` у сервиса `nginx` проброс, например **`8888:80`** и при необходимости **`8443:443`**. Тогда CRM доступна внутри сервера как `http://127.0.0.1:8888`.

Для пользователей из интернета настройте **хостовый** nginx как обратный прокси на этот порт только для `crm.master15.ru` (SSL можно терминировать на хосте). Готовый пример фрагмента конфига:

- `deploy/host-nginx-reverse-proxy.example.conf`

После правок на хосте: `nginx -t && systemctl reload nginx` (или как принято на вашей ОС).

В `.env.prod` для фронта укажите **публичный** URL (как видит браузер), например:

- `VITE_API_BASE_URL=https://crm.master15.ru/api`

Сертификат Let’s Encrypt для поддомена удобнее выпускать **на хосте** (`certbot --nginx` или webroot), потому что порт 80 уже обслуживает хостовый nginx.

---

## 11) Резервные копии (минимум)

### 11.1 Бэкап PostgreSQL в файл (вручную)

```bash
cd /opt/master-print
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/db_$(date +%F).sql"
```

> Чтобы переменные `POSTGRES_USER/POSTGRES_DB` подставились, запускай команду так:
> `set -a; source .env.prod; set +a` (или просто впиши значения руками).

---

## 12) Полная остановка (если нужно)

```bash
cd /opt/master-print
docker compose -f docker-compose.prod.yml down
```

Остановить и удалить тома (ОСТОРОЖНО: удалит БД и данные):

```bash
docker compose -f docker-compose.prod.yml down -v
```


## Backend (Django/DRF)

### Требования

- Python 3.11+ (у вас: 3.11.9)
- Docker Desktop (для PostgreSQL + Redis в dev)

### Быстрый старт (dev)

1) Запустить инфраструктуру:

```powershell
docker compose -f ..\docker-compose.dev.yml up -d
```

2) (Опционально) создать `.env` на базе `.env.example` и выставить переменные окружения.

3) Применить миграции и запустить сервер:

```powershell
.\.venv\Scripts\python manage.py migrate
.\.venv\Scripts\python manage.py runserver
```

### Документация API

- Swagger UI: `http://127.0.0.1:8000/api/docs/`
- OpenAPI schema: `http://127.0.0.1:8000/api/schema/`

### Celery (dev)

Worker:

```powershell
.\.venv\Scripts\celery -A config worker -l INFO
```

Beat:

```powershell
.\.venv\Scripts\celery -A config beat -l INFO
```

### Тесты

```powershell
.\.venv\Scripts\pytest
```


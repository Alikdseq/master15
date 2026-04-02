param(
  [ValidateSet("up","down","migrate","run","test","worker","beat")]
  [string]$Action = "up"
)

$ErrorActionPreference = "Stop"

switch ($Action) {
  "up" {
    docker compose -f docker-compose.dev.yml up -d
  }
  "down" {
    docker compose -f docker-compose.dev.yml down
  }
  "migrate" {
    Push-Location backend
    .\.venv\Scripts\python manage.py migrate
    Pop-Location
  }
  "run" {
    Push-Location backend
    .\.venv\Scripts\python manage.py runserver
    Pop-Location
  }
  "test" {
    Push-Location backend
    .\.venv\Scripts\pytest
    Pop-Location
  }
  "worker" {
    Push-Location backend
    .\.venv\Scripts\celery -A config worker -l INFO
    Pop-Location
  }
  "beat" {
    Push-Location backend
    .\.venv\Scripts\celery -A config beat -l INFO
    Pop-Location
  }
}


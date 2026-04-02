from .settings import *  # noqa: F403

# Use SQLite for local test runs to avoid requiring a running Postgres.
# Production and dev runtime still use PostgreSQL via config.settings.
DATABASES = {  # noqa: F405
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}


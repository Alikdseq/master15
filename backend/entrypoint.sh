#!/bin/sh
set -e

python manage.py migrate
python manage.py seed_dev || true

python manage.py runserver 0.0.0.0:8000


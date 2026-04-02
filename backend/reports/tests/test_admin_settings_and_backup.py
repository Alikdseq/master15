from io import BytesIO
from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from clients.models import Client
from system_settings.models import SystemSetting


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc36_change_sms_template_setting():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post("/api/admin/settings/", {"key": "sms.templates.order_ready", "value": {"text": "Готово {order_number}"}}, format="json")
    assert resp.status_code == 201
    assert SystemSetting.objects.filter(key="sms.templates.order_ready").exists()


@pytest.mark.django_db
def test_tc37_bulk_update_min_stock():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    from inventory.models import InventoryCategory, Product

    cat = InventoryCategory.objects.create(name="Картриджи")
    p = Product.objects.create(name="HP", category=cat, sku="S1", unit="шт", min_stock="1")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post("/api/inventory/products/bulk-update-min-stock/", {"items": [{"product": p.id, "min_stock": "5"}]}, format="json")
    assert resp.status_code == 200
    p.refresh_from_db()
    assert str(p.min_stock) == "5.000"


@pytest.mark.django_db
def test_tc38_audit_logs_accessible_and_filterable():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    # Create something that logs
    api.post("/api/admin/settings/", {"key": "x", "value": {"a": 1}}, format="json")
    resp = api.get("/api/admin/audit-logs/?action=system_setting_upsert")
    assert resp.status_code == 200
    assert resp.data["count"] >= 1


@pytest.mark.django_db
def test_tc44_backup_and_tc45_restore_smoke():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    Client.objects.create(type="person", name="X", phone="+70000000000")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    run = api.post("/api/admin/backups/run/", {}, format="json")
    assert run.status_code == 201
    name = run.data["path"]

    # download exists
    dl = api.get(f"/api/admin/backups/download/?name={name}")
    assert dl.status_code == 200

    # restore (smoke)
    rs = api.post("/api/admin/backups/restore/", {"name": name}, format="json")
    assert rs.status_code == 200


@pytest.mark.django_db
def test_backup_restore_from_uploaded_file():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    Client.objects.create(type="person", name="X", phone="+70000000000")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    run = api.post("/api/admin/backups/run/", {}, format="json")
    assert run.status_code == 201
    name = run.data["path"]

    backup_path = Path(settings.BACKUP_DIR) / name
    content = backup_path.read_bytes()
    upload = SimpleUploadedFile(name=name, content=content, content_type="application/json")

    rs = api.post("/api/admin/backups/restore/", {"file": upload}, format="multipart")
    assert rs.status_code == 200
    assert rs.data["restored"] is True


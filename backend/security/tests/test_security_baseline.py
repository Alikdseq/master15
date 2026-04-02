import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from django.test import override_settings
from rest_framework.test import APIClient

from clients.models import Client
from orders.models import Order, OrderStatus, PrintOrder


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data.get("access")
    if token:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc41_master_forbidden_admin_endpoints():
    master = User.objects.create_user(
        email="m@example.com",
        name="Master",
        role=User.Role.MASTER,
        password="Passw0rd123",
    )
    api = APIClient()
    _auth(api, email=master.email, password="Passw0rd123")
    r = api.get("/api/admin/settings/")
    assert r.status_code == 403


@pytest.mark.django_db
def test_tc42_sql_injection_like_payload_does_not_error():
    admin = User.objects.create_user(
        email="a@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    payload = "' OR '1'='1"
    r1 = api.get("/api/orders/", {"search": payload})
    r2 = api.get("/api/clients/", {"search": payload})
    assert r1.status_code == 200
    assert r2.status_code == 200


@pytest.mark.django_db
def test_tc43_xss_payload_is_returned_as_text():
    admin = User.objects.create_user(
        email="a@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    xss = "<script>alert(1)</script>"
    r = api.post(
        "/api/clients/",
        {"type": "person", "name": "X", "phone": "+70000000000", "comment": xss, "tags": []},
        format="json",
    )
    assert r.status_code == 201
    cid = r.data["id"]
    g = api.get(f"/api/clients/{cid}/")
    assert g.status_code == 200
    assert g.data["comment"] == xss


@pytest.mark.django_db
def test_security_csp_header_present():
    api = APIClient()
    r = api.get("/api/schema/")
    assert r.status_code == 200
    assert "Content-Security-Policy" in r


@pytest.mark.django_db
def test_login_rate_limit_blocks_excessive_attempts():
    cache.clear()
    User.objects.create_user(
        email="ratelimit@example.com",
        name="RateLimit",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    api = APIClient()
    with override_settings(
        REST_FRAMEWORK={
            **settings.REST_FRAMEWORK,
            "DEFAULT_THROTTLE_RATES": {
                **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
                "login": "2/min",
            },
        }
    ):
        r1 = api.post(
            "/api/auth/token/",
            {"email": "ratelimit@example.com", "password": "wrong"},
            format="json",
        )
        r2 = api.post(
            "/api/auth/token/",
            {"email": "ratelimit@example.com", "password": "wrong"},
            format="json",
        )
        r3 = api.post(
            "/api/auth/token/",
            {"email": "ratelimit@example.com", "password": "wrong"},
            format="json",
        )
    assert r1.status_code in (400, 401)
    assert r2.status_code in (400, 401)
    assert r3.status_code == 429


@pytest.mark.django_db
def test_upload_print_files_rejects_invalid_extension_and_mime():
    admin = User.objects.create_user(
        email="uploadsec@example.com",
        name="UploadSec",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    accepted = OrderStatus.objects.create(code="accepted", name="Принят", sort_index=1)
    client = Client.objects.create(type="person", name="Клиент", phone="+70000000999")
    order = Order.objects.create(
        order_number="TSEC-1",
        client=client,
        service_type=Order.ServiceType.PRINT,
        device_type="Печать",
        issue_description="Печать файла",
        status=accepted,
        created_by=admin,
    )
    PrintOrder.objects.create(order=order, document_type="doc", page_count=1, color_mode="bw")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    bad_file = SimpleUploadedFile(
        "malware.exe",
        b"fake-binary",
        content_type="application/octet-stream",
    )
    resp = api.post(
        f"/api/orders/{order.id}/upload-print-files/",
        {"files": [bad_file]},
        format="multipart",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_client_pii_stored_encrypted_in_database():
    client = Client.objects.create(
        type="person",
        name="PII",
        phone="+70000000123",
        email="pii@example.com",
        address="Москва, ул. Тестовая",
    )
    with connection.cursor() as cur:
        cur.execute("SELECT phone, email, address FROM clients_client WHERE id = %s", [client.id])
        row = cur.fetchone()
    assert row is not None
    phone_raw, email_raw, address_raw = row
    assert isinstance(phone_raw, str) and phone_raw.startswith("enc1:")
    assert isinstance(email_raw, str) and email_raw.startswith("enc1:")
    assert isinstance(address_raw, str) and address_raw.startswith("enc1:")


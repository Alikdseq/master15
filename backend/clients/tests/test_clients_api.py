import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from datetime import date

from clients.models import Client
from orders.models import Order, OrderStatus
from notifications.models import Notification


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc11_add_new_client():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    resp = api.post(
        "/api/clients/",
        {"type": "person", "name": "Иванов Петр", "phone": "+79181234567", "email": "a@b.com", "tags": ["VIP"]},
        format="json",
    )
    assert resp.status_code == 201
    assert Client.objects.filter(phone="+79181234567").exists()


@pytest.mark.django_db
def test_tc12_search_client_by_phone():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    Client.objects.create(type="person", name="Test", phone="+70000000000", email="t@t.com")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    resp = api.get("/api/clients/?search=%2B7000")
    assert resp.status_code == 200
    assert resp.data["count"] == 1


@pytest.mark.django_db
def test_tc13_edit_client_add_tag():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    c = Client.objects.create(type="person", name="Test", phone="+70000000000", email="t@t.com", tags=[])

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    resp = api.patch(f"/api/clients/{c.id}/", {"tags": ["VIP"]}, format="json")
    assert resp.status_code == 200
    c.refresh_from_db()
    assert c.tags == ["VIP"]


@pytest.mark.django_db
def test_tc14_client_order_history_endpoint_empty_or_list():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    c = Client.objects.create(type="person", name="Test", phone="+70000000000")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    resp = api.get(f"/api/clients/{c.id}/orders/")
    assert resp.status_code == 200
    assert "results" in resp.data

    accepted = OrderStatus.objects.get(code="accepted")
    Order.objects.create(
        client=c,
        order_number="0317-9999",
        device_type="Принтер",
        issue_description="X",
        received_date=date.today(),
        status=accepted,
    )
    resp2 = api.get(f"/api/clients/{c.id}/orders/")
    assert resp2.status_code == 200
    assert len(resp2.data["results"]) == 1


@pytest.mark.django_db
def test_tc15_delete_client_constraints():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    c1 = Client.objects.create(type="person", name="NoOrders", phone="+70000000001")
    c2 = Client.objects.create(type="person", name="HasOrders", phone="+70000000002")
    Order.objects.create(client=c2)

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    r1 = api.delete(f"/api/clients/{c1.id}/")
    assert r1.status_code == 204

    r2 = api.delete(f"/api/clients/{c2.id}/")
    assert r2.status_code == 400


@pytest.mark.django_db
def test_tc16_manager_cannot_send_mass_sms():
    manager = User.objects.create_user(
        email="mgr@example.com", name="Mgr", role=User.Role.MANAGER, password="Passw0rd123"
    )
    Client.objects.create(type="person", name="VIP 1", phone="+70000000060", tags=["VIP"])
    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")

    resp = api.post(
        "/api/clients/mass-sms/",
        {"notif_type": "bulk_test", "title": "t", "body": "hello", "tags": ["VIP"]},
        format="json",
    )
    assert resp.status_code == 403


@pytest.mark.django_db
def test_tc17_admin_mass_sms_by_segment_creates_notifications():
    admin = User.objects.create_user(
        email="admin@example.com", name="Admin", role=User.Role.ADMIN, phone="+70000000061", password="Passw0rd123"
    )
    c1 = Client.objects.create(type="person", name="VIP 1", phone="+70000000062", tags=["VIP"])
    c2 = Client.objects.create(
        type="person",
        name="VIP 2 disabled",
        phone="+70000000063",
        tags=["VIP"],
        notifications_disabled_types=["bulk_test"],
    )

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    resp = api.post(
        "/api/clients/mass-sms/",
        {
            "notif_type": "bulk_test",
            "title": "Bulk",
            "body": "Hello from admin",
            "tags": ["VIP"],
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["queued"] == 1
    assert Notification.objects.filter(type="bulk_test").count() == 1


@pytest.mark.django_db
def test_tc18_client_notes_crud():
    manager = User.objects.create_user(
        email="mgr2@example.com", name="Mgr2", role=User.Role.MANAGER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="VIP 1", phone="+70000000070", tags=["VIP"])

    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")

    r = api.post(f"/api/clients/{c.id}/notes/", {"text": "Заметка клиента"}, format="json")
    assert r.status_code == 201
    assert r.data["text"] == "Заметка клиента"
    assert r.data["client"] == c.id

    r2 = api.get(f"/api/clients/{c.id}/notes/")
    assert r2.status_code == 200
    assert any(n["text"] == "Заметка клиента" for n in r2.data["results"])


@pytest.mark.django_db
def test_master_client_list_only_assigned():
    master = User.objects.create_user(
        email="m@example.com", name="Master", role=User.Role.MASTER, password="Passw0rd123"
    )
    c1 = Client.objects.create(type="person", name="A", phone="+70000000080")
    c2 = Client.objects.create(type="person", name="B", phone="+70000000081")
    accepted = OrderStatus.objects.get(code="accepted")
    Order.objects.create(
        client=c2,
        order_number="0317-8888",
        device_type="Принтер",
        issue_description="X",
        received_date=date.today(),
        status=accepted,
        assigned_master=master,
    )

    api = APIClient()
    _auth(api, email=master.email, password="Passw0rd123")

    r = api.get("/api/clients/")
    assert r.status_code == 200
    assert r.data["count"] == 1
    assert r.data["results"][0]["id"] == c2.id


@pytest.mark.django_db
def test_master_cannot_fetch_stats():
    master = User.objects.create_user(
        email="m2@example.com", name="M", role=User.Role.MASTER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="X", phone="+70000000082")
    accepted = OrderStatus.objects.get(code="accepted")
    Order.objects.create(
        client=c,
        order_number="0317-7777",
        device_type="Принтер",
        issue_description="Y",
        received_date=date.today(),
        status=accepted,
        assigned_master=master,
    )

    api = APIClient()
    _auth(api, email=master.email, password="Passw0rd123")

    r = api.get(f"/api/clients/{c.id}/stats/")
    assert r.status_code == 403


from datetime import date

import pytest
from django.contrib.auth import get_user_model
from freezegun import freeze_time
from rest_framework.test import APIClient

from clients.models import Client
from orders.models import Order
from notifications.models import Notification


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
@freeze_time("2026-03-17")
def test_tc01_create_order_valid():
    manager = User.objects.create_user(
        email="m@example.com", name="Mgr", role=User.Role.MANAGER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="Иванов Петр", phone="+70000000000")
    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")

    resp = api.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "device_model": "HP 1018",
            "issue_description": "Не печатает",
            "accessories": {"usb": True},
            "received_date": "2026-03-17",
        },
        format="json",
    )
    assert resp.status_code == 201
    o = Order.objects.get(id=resp.data["id"])
    assert o.order_number.startswith("0317-")
    assert o.status.code == "accepted"


@pytest.mark.django_db
def test_tc02_create_order_missing_required_fields():
    manager = User.objects.create_user(
        email="m@example.com", name="Mgr", role=User.Role.MANAGER, password="Passw0rd123"
    )
    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")
    resp = api.post("/api/orders/", {"device_type": ""}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_tc03_edit_order():
    manager = User.objects.create_user(
        email="m@example.com", name="Mgr", role=User.Role.MANAGER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="A", phone="+70000000000")
    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")
    resp = api.post(
        "/api/orders/",
        {"client": c.id, "device_type": "Принтер", "issue_description": "X", "received_date": str(date.today())},
        format="json",
    )
    oid = resp.data["id"]
    r2 = api.patch(f"/api/orders/{oid}/", {"issue_description": "Y"}, format="json")
    assert r2.status_code == 200


@pytest.mark.django_db
def test_tc04_status_transition_rules():
    admin = User.objects.create_user(
        email="a@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123"
    )
    master = User.objects.create_user(
        email="s@example.com", name="Master", role=User.Role.MASTER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="A", phone="+70000000000")

    api_admin = APIClient()
    _auth(api_admin, email=admin.email, password="Passw0rd123")
    oresp = api_admin.post(
        "/api/orders/",
        {"client": c.id, "device_type": "Принтер", "issue_description": "X", "assigned_master": master.id, "received_date": str(date.today())},
        format="json",
    )
    oid = oresp.data["id"]

    api_master = APIClient()
    _auth(api_master, email=master.email, password="Passw0rd123")

    # allowed: accepted -> diagnostics
    r1 = api_master.post(f"/api/orders/{oid}/change-status/", {"to_status": "diagnostics"}, format="json")
    assert r1.status_code == 200

    # not allowed: diagnostics -> ready
    r2 = api_master.post(f"/api/orders/{oid}/change-status/", {"to_status": "ready"}, format="json")
    assert r2.status_code == 400


@pytest.mark.django_db
def test_tc06_search_order_by_number():
    admin = User.objects.create_user(
        email="a@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="A", phone="+70000000000")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post(
        "/api/orders/",
        {"client": c.id, "device_type": "Принтер", "issue_description": "X", "received_date": str(date.today())},
        format="json",
    )
    number = resp.data["order_number"]
    r2 = api.get(f"/api/orders/?search={number}")
    assert r2.status_code == 200
    assert r2.data["count"] == 1


@pytest.mark.django_db
def test_tc07_filter_by_status():
    admin = User.objects.create_user(
        email="a@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="A", phone="+70000000000")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    api.post(
        "/api/orders/",
        {"client": c.id, "device_type": "Принтер", "issue_description": "X", "received_date": str(date.today())},
        format="json",
    )
    r = api.get("/api/orders/?status=accepted")
    assert r.status_code == 200
    assert r.data["count"] >= 1


@pytest.mark.django_db
def test_tc09_history_contains_changes():
    admin = User.objects.create_user(
        email="a@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="A", phone="+70000000000")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post(
        "/api/orders/",
        {"client": c.id, "device_type": "Принтер", "issue_description": "X", "received_date": str(date.today())},
        format="json",
    )
    oid = resp.data["id"]
    api.post(f"/api/orders/{oid}/change-status/", {"to_status": "diagnostics", "comment": "start"}, format="json")
    hist = api.get(f"/api/orders/{oid}/history/")
    assert hist.status_code == 200
    assert len(hist.data["results"]) >= 2  # created + change


@pytest.mark.django_db
def test_tc10_forbid_edit_completed():
    admin = User.objects.create_user(
        email="a@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="A", phone="+70000000000")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post(
        "/api/orders/",
        {"client": c.id, "device_type": "Принтер", "issue_description": "X", "received_date": str(date.today())},
        format="json",
    )
    oid = resp.data["id"]
    # admin override to completed
    api.post(f"/api/orders/{oid}/change-status/", {"to_status": "completed"}, format="json")
    r2 = api.patch(f"/api/orders/{oid}/", {"issue_description": "Y"}, format="json")
    assert r2.status_code == 400


@pytest.mark.django_db
def test_create_order_rejects_desired_date_before_received():
    manager = User.objects.create_user(
        email="m2@example.com", name="Mgr2", role=User.Role.MANAGER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="Иванов Петр", phone="+70000000001")
    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")

    resp = api.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "Не печатает",
            "received_date": "2026-03-17",
            "desired_completion_date": "2026-03-16",
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "desired_completion_date" in resp.data


@pytest.mark.django_db
def test_create_order_rejects_negative_cost():
    manager = User.objects.create_user(
        email="m3@example.com", name="Mgr3", role=User.Role.MANAGER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="Иванов Петр", phone="+70000000002")
    api = APIClient()
    _auth(api, email=manager.email, password="Passw0rd123")

    resp = api.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "Не печатает",
            "received_date": "2026-03-17",
            "preliminary_cost": "-1.00",
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "preliminary_cost" in resp.data


@pytest.mark.django_db
def test_manager_cannot_set_completed_status():
    admin = User.objects.create_user(
        email="a2@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123"
    )
    manager = User.objects.create_user(
        email="m4@example.com", name="Mgr4", role=User.Role.MANAGER, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="Иванов Петр", phone="+70000000003")

    api_admin = APIClient()
    _auth(api_admin, email=admin.email, password="Passw0rd123")
    resp = api_admin.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "X",
            "received_date": str(date.today()),
        },
        format="json",
    )
    oid = resp.data["id"]
    api_admin.post(f"/api/orders/{oid}/change-status/", {"to_status": "diagnostics"}, format="json")
    api_admin.post(f"/api/orders/{oid}/change-status/", {"to_status": "negotiation"}, format="json")
    api_admin.post(f"/api/orders/{oid}/change-status/", {"to_status": "repair"}, format="json")
    api_admin.post(
        f"/api/orders/{oid}/change-status/",
        {"to_status": "ready", "final_work_cost": "100.00", "used_products": {"items": []}},
        format="json",
    )

    api_manager = APIClient()
    _auth(api_manager, email=manager.email, password="Passw0rd123")
    r = api_manager.post(f"/api/orders/{oid}/change-status/", {"to_status": "completed"}, format="json")
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_number_increments_same_day():
    admin = User.objects.create_user(
        email="a3@example.com", name="Admin3", role=User.Role.ADMIN, password="Passw0rd123"
    )
    c = Client.objects.create(type="person", name="Иван", phone="+70000000010")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    r1 = api.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "X",
            "received_date": "2026-03-17",
        },
        format="json",
    )
    r2 = api.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "Y",
            "received_date": "2026-03-17",
        },
        format="json",
    )

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.data["order_number"].endswith("-0001")
    assert r2.data["order_number"].endswith("-0002")


@pytest.mark.django_db
def test_master_cannot_change_unassigned_order_status():
    admin = User.objects.create_user(
        email="a4@example.com", name="Admin4", role=User.Role.ADMIN, password="Passw0rd123"
    )
    master_assigned = User.objects.create_user(
        email="m10@example.com", name="MasterAssigned", role=User.Role.MASTER, password="Passw0rd123"
    )
    master_other = User.objects.create_user(
        email="m11@example.com", name="MasterOther", role=User.Role.MASTER, password="Passw0rd123"
    )

    c = Client.objects.create(type="person", name="A", phone="+70000000011")

    api_admin = APIClient()
    _auth(api_admin, email=admin.email, password="Passw0rd123")
    resp = api_admin.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "X",
            "assigned_master": master_assigned.id,
            "received_date": str(date.today()),
        },
        format="json",
    )
    oid = resp.data["id"]

    api_master = APIClient()
    _auth(api_master, email=master_other.email, password="Passw0rd123")
    r = api_master.post(f"/api/orders/{oid}/change-status/", {"to_status": "diagnostics"}, format="json")
    # Чужой заказ не попадает в queryset мастера — 404 вместо 400 с текстом о назначении.
    assert r.status_code == 404


@pytest.mark.django_db
def test_ready_creates_sms_notification():
    system_admin = User.objects.create_user(
        email="sysadmin@example.com",
        name="Sys",
        role=User.Role.ADMIN,
        password="Passw0rd123",
        phone="+70000000050",
    )
    manager = User.objects.create_user(
        email="mgr@example.com",
        name="Mgr",
        role=User.Role.MANAGER,
        password="Passw0rd123",
        phone="+70000000051",
    )

    c = Client.objects.create(type="person", name="Иван", phone="+70000000052")

    api_manager = APIClient()
    _auth(api_manager, email=manager.email, password="Passw0rd123")

    resp = api_manager.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "issue_description": "X",
            "received_date": str(date.today()),
        },
        format="json",
    )
    oid = resp.data["id"]

    # accepted -> diagnostics -> negotiation -> repair -> ready
    api_manager.post(f"/api/orders/{oid}/change-status/", {"to_status": "diagnostics"}, format="json")
    api_manager.post(f"/api/orders/{oid}/change-status/", {"to_status": "negotiation"}, format="json")
    api_manager.post(f"/api/orders/{oid}/change-status/", {"to_status": "repair"}, format="json")
    api_manager.post(
        f"/api/orders/{oid}/change-status/",
        {"to_status": "ready", "final_work_cost": "2500.00", "used_products": {"items": []}},
        format="json",
    )

    assert Notification.objects.filter(type="order_ready", status=Notification.Status.QUEUED).exists()


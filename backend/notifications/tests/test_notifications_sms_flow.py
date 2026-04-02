import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from clients.models import Client
from config.tasks import deliver_queued_notifications, queue_prophylaxis_reminders_task
from notifications.models import Notification
from system_settings.services import set_setting
from django.utils import timezone
from freezegun import freeze_time


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc23_sms_sent_on_ready_status_change():
    # templates
    set_setting("sms.templates.order_ready", "Здравствуйте, {client_name}! Заказ {order_number} готов.")

    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, phone="+79990000000", password="Passw0rd123")
    master = User.objects.create_user(email="m@example.com", name="Master", role=User.Role.MASTER, phone="+79990000001", password="Passw0rd123")
    client = Client.objects.create(type="person", name="Иванов", phone="+70000000000")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    o = api.post(
        "/api/orders/",
        {"client": client.id, "device_type": "Принтер", "issue_description": "X", "assigned_master": master.id, "received_date": "2026-03-17"},
        format="json",
    ).data
    oid = o["id"]

    api.post(
        f"/api/orders/{oid}/change-status/",
        {"to_status": "ready", "final_work_cost": "1500.00", "used_products": {"items": []}},
        format="json",
    )
    assert Notification.objects.filter(type="order_ready").exists()

    # deliver (dry-run marks sent)
    deliver_queued_notifications(limit=100)
    assert Notification.objects.filter(type="order_ready", status=Notification.Status.SENT).exists()


@pytest.mark.django_db
def test_tc24_staff_gets_new_order_notification():
    set_setting("sms.templates.new_order_staff", "Новый заказ {order_number}")
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, phone="+79990000000", password="Passw0rd123")
    manager = User.objects.create_user(email="mgr@example.com", name="Mgr", role=User.Role.MANAGER, phone="+79990000002", password="Passw0rd123")
    master = User.objects.create_user(email="m@example.com", name="Master", role=User.Role.MASTER, phone="+79990000001", password="Passw0rd123")
    client = Client.objects.create(type="person", name="Иванов", phone="+70000000000")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    api.post(
        "/api/orders/",
        {"client": client.id, "device_type": "Принтер", "issue_description": "X", "assigned_master": master.id, "received_date": "2026-03-17"},
        format="json",
    )

    assert Notification.objects.filter(user=manager, type="new_order_staff").exists()
    assert Notification.objects.filter(user=master, type="new_order_staff").exists()


@pytest.mark.django_db
def test_tc26_disable_notification_type():
    # disable for manager
    manager = User.objects.create_user(email="mgr@example.com", name="Mgr", role=User.Role.MANAGER, phone="+79990000002", password="Passw0rd123")
    manager.notifications_disabled_types = ["new_order_staff"]
    manager.save(update_fields=["notifications_disabled_types"])
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, phone="+79990000000", password="Passw0rd123")
    master = User.objects.create_user(email="m@example.com", name="Master", role=User.Role.MASTER, phone="+79990000001", password="Passw0rd123")
    client = Client.objects.create(type="person", name="Иванов", phone="+70000000000")

    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    api.post(
        "/api/orders/",
        {"client": client.id, "device_type": "Принтер", "issue_description": "X", "assigned_master": master.id, "received_date": "2026-03-17"},
        format="json",
    )

    assert not Notification.objects.filter(user=manager, type="new_order_staff").exists()


@pytest.mark.django_db
def test_notifications_history_and_mark_read():
    user = User.objects.create_user(email="u@example.com", name="U", role=User.Role.MANAGER, phone="+79990000002", password="Passw0rd123")
    Notification.objects.create(user=user, type="t", title="x", body="y")

    api = APIClient()
    _auth(api, email=user.email, password="Passw0rd123")
    lst = api.get("/api/notifications/")
    assert lst.status_code == 200
    nid = lst.data["results"][0]["id"]
    mr = api.post(f"/api/notifications/{nid}/mark-read/")
    assert mr.status_code == 200
    assert mr.data["read_at"] is not None


@pytest.mark.django_db
@freeze_time("2026-03-17 10:00:00")
def test_tc29_prophylaxis_reminders_are_queued_for_due_clients():
    set_setting(
        "sms.templates.prophylaxis_reminder",
        {"text": "Здравствуйте, {client_name}! Напоминание о профилактике."},
    )
    set_setting("prophylaxis.reminder_interval_days", 180)

    # system admin (where client SMS notifications are stored)
    admin = User.objects.create_user(
        email="admin@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        phone="+79990000000",
        password="Passw0rd123",
    )

    due_client = Client.objects.create(
        type="person",
        name="Иван",
        phone="+70000000010",
        last_prophylaxis_reminder_at=timezone.now() - timezone.timedelta(days=181),
    )
    not_due_client = Client.objects.create(
        type="person",
        name="Пётр",
        phone="+70000000011",
        last_prophylaxis_reminder_at=timezone.now() - timezone.timedelta(days=100),
    )
    disabled_client = Client.objects.create(
        type="person",
        name="Сидор",
        phone="+70000000012",
        last_prophylaxis_reminder_at=timezone.now() - timezone.timedelta(days=181),
        notifications_disabled_types=["prophylaxis_reminder"],
    )

    created = queue_prophylaxis_reminders_task()
    assert created == 1

    q = Notification.objects.filter(type="prophylaxis_reminder", status=Notification.Status.QUEUED)
    assert q.count() == 1
    n = q.first()
    assert n.data["client_id"] == due_client.id

    # deliver (dry-run marks sent)
    deliver_queued_notifications(limit=10)
    assert Notification.objects.filter(type="prophylaxis_reminder", status=Notification.Status.SENT).exists()

    # reminder timestamp must be updated
    due_client.refresh_from_db()
    assert due_client.last_prophylaxis_reminder_at is not None


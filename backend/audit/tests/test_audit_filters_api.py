import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog


User = get_user_model()


def _auth_admin(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc_g5_audit_filters_action_actor_object_type_and_dates():
    admin = User.objects.create_user(
        email="admin@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
        phone="+79990000000",
    )
    actor_other = User.objects.create_user(
        email="other@example.com",
        name="Other",
        role=User.Role.MANAGER,
        password="Passw0rd123",
        phone="+79990000001",
    )

    t1 = timezone.now() - timezone.timedelta(days=3)
    t2 = timezone.now() - timezone.timedelta(days=1)

    AuditLog.objects.create(
        actor=admin,
        action="user_created",
        object_type="type1",
        object_id="1",
        meta={"x": 1},
        created_at=t1,
    )
    AuditLog.objects.create(
        actor=actor_other,
        action="user_created",
        object_type="type1",
        object_id="2",
        meta={"x": 2},
        created_at=t2,
    )
    AuditLog.objects.create(
        actor=admin,
        action="order_created",
        object_type="type2",
        object_id="3",
        meta={"x": 3},
        created_at=t2,
    )

    api = APIClient()
    _auth_admin(api, email=admin.email, password="Passw0rd123")

    # Filter by action
    resp = api.get("/api/admin/audit-logs/?action=user_created")
    assert resp.status_code == 200
    assert resp.data["count"] == 2

    # Filter by actor (admin.id)
    resp2 = api.get(f"/api/admin/audit-logs/?action=user_created&actor={admin.id}")
    assert resp2.status_code == 200
    assert resp2.data["count"] == 1

    # Filter by object_type by alias: `type`
    resp3 = api.get(f"/api/admin/audit-logs/?action=user_created&actor={admin.id}&type=type1")
    assert resp3.status_code == 200
    assert resp3.data["count"] == 1

    # Filter by date range: only t2
    date_from = t2.date().isoformat()
    date_to = t2.date().isoformat()
    resp4 = api.get(f"/api/admin/audit-logs/?from={date_from}&to={date_to}")
    assert resp4.status_code == 200
    assert resp4.data["count"] == 2


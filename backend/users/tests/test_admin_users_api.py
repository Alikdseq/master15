import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


from audit.models import AuditLog


User = get_user_model()


def _auth_admin(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc_g1_admin_can_reset_password_and_login_with_temp_password():
    admin = User.objects.create_user(
        email="admin@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
        phone="+79990000000",
    )
    victim = User.objects.create_user(
        email="victim@example.com",
        name="Victim",
        role=User.Role.MANAGER,
        password="OldPassw0rd123",
        phone="+79990000010",
    )

    api = APIClient()
    _auth_admin(api, email=admin.email, password="Passw0rd123")

    resp = api.post(f"/api/users/{victim.id}/reset-password/")
    assert resp.status_code == 200
    temp = resp.data["temporary_password"]
    assert isinstance(temp, str) and temp

    # Can login with temp password
    api2 = APIClient()
    login = api2.post("/api/auth/token/", {"email": victim.email, "password": temp}, format="json")
    assert login.status_code == 200

    # Audit record exists
    assert AuditLog.objects.filter(action="user_password_reset", actor_id=admin.id, object_id=str(victim.id)).exists()


@pytest.mark.django_db
def test_tc_g1_non_admin_forbidden_reset_password():
    manager = User.objects.create_user(
        email="mgr@example.com",
        name="Mgr",
        role=User.Role.MANAGER,
        password="Passw0rd123",
        phone="+79990000002",
    )
    victim = User.objects.create_user(
        email="victim@example.com",
        name="Victim",
        role=User.Role.MANAGER,
        password="OldPassw0rd123",
        phone="+79990000010",
    )

    api = APIClient()
    _auth_admin(api, email=manager.email, password="Passw0rd123")

    resp = api.post(f"/api/users/{victim.id}/reset-password/")
    # Since permission for /api/users is IsAdmin, this should be forbidden.
    assert resp.status_code == 403


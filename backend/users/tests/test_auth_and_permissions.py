import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


User = get_user_model()


@pytest.mark.django_db
def test_token_obtain_success():
    User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    client = APIClient()
    resp = client.post("/api/auth/token/", {"email": "admin@example.com", "password": "Passw0rd123"}, format="json")
    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


@pytest.mark.django_db
def test_token_obtain_wrong_password():
    User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    client = APIClient()
    resp = client.post("/api/auth/token/", {"email": "admin@example.com", "password": "wrong"}, format="json")
    assert resp.status_code in (400, 401)


@pytest.mark.django_db
def test_admin_can_list_users():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    User.objects.create_user(email="m@example.com", name="Master", role=User.Role.MASTER, password="Passw0rd123")

    client = APIClient()
    token = client.post("/api/auth/token/", {"email": admin.email, "password": "Passw0rd123"}, format="json").data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    resp = client.get("/api/users/")
    assert resp.status_code == 200
    assert "results" in resp.data


@pytest.mark.django_db
def test_non_admin_forbidden_users_endpoint():
    master = User.objects.create_user(email="m@example.com", name="Master", role=User.Role.MASTER, password="Passw0rd123")
    client = APIClient()
    token = client.post("/api/auth/token/", {"email": master.email, "password": "Passw0rd123"}, format="json").data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    resp = client.get("/api/users/")
    assert resp.status_code == 403


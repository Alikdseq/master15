from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


User = get_user_model()


def _obtain_access_and_refresh(*, email: str, password: str) -> tuple[str, str]:
    client = APIClient()
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    assert resp.status_code == 200
    return resp.data["access"], resp.data["refresh"]


@pytest.mark.django_db
def test_tc62_refresh_token_returns_new_access():
    password = "Passw0rd123"
    u = User.objects.create_user(email="sec_i@example.com", name="User", role=User.Role.ADMIN, password=password, phone="+79990000021")

    access, refresh = _obtain_access_and_refresh(email=u.email, password=password)

    client = APIClient()
    resp = client.post("/api/auth/refresh/", {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    assert "access" in resp.data
    assert resp.data["access"] != access


@pytest.mark.django_db
def test_tc63_admin_endpoints_without_auth_return_401():
    api = APIClient()
    resp = api.get("/api/admin/audit-logs/")
    assert resp.status_code == 401


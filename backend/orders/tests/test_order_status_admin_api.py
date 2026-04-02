import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from orders.models import OrderStatus, OrderStatusTransition


User = get_user_model()


def _auth_admin(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc_g2_validate_graph_fails_when_two_final_statuses():
    admin = User.objects.create_user(
        email="admin@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        phone="+79990000000",
        password="Passw0rd123",
    )

    # There is already one final status seeded: completed
    s1 = OrderStatus.objects.get(code="completed")
    assert s1.is_final is True

    OrderStatus.objects.create(code="completed2", name="Выдан 2", sort_index=999, is_final=True, is_active=True)

    api = APIClient()
    _auth_admin(api, email=admin.email, password="Passw0rd123")

    resp = api.post("/api/admin/order-statuses/validate/", {})
    assert resp.status_code == 400
    assert resp.data["valid"] is False


@pytest.mark.django_db
def test_tc_g2_validate_graph_fails_when_final_has_outgoing_transition():
    admin = User.objects.create_user(
        email="admin2@example.com",
        name="Admin2",
        role=User.Role.ADMIN,
        phone="+79990000001",
        password="Passw0rd123",
    )

    final_status = OrderStatus.objects.get(code="completed")
    # Ensure there is only one final active: keep all other finals as is (seeded state)

    # Add outgoing transition from final -> accepted (should be invalid)
    accepted = OrderStatus.objects.get(code="accepted")
    OrderStatusTransition.objects.create(from_status=final_status, to_status=accepted, is_enabled=True)

    api = APIClient()
    _auth_admin(api, email="admin2@example.com", password="Passw0rd123")
    resp = api.post("/api/admin/order-statuses/validate/", {})
    assert resp.status_code == 400
    assert "valid" in resp.data and resp.data["valid"] is False


@pytest.mark.django_db
def test_tc_g2_non_admin_cannot_validate_graph():
    manager = User.objects.create_user(
        email="m@example.com",
        name="M",
        role=User.Role.MANAGER,
        phone="+79990000002",
        password="Passw0rd123",
    )
    api = APIClient()
    resp = api.post("/api/auth/token/", {"email": manager.email, "password": "Passw0rd123"}, format="json")
    token = resp.data["access"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    resp2 = api.post("/api/admin/order-statuses/validate/", {})
    assert resp2.status_code == 403


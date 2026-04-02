from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from freezegun import freeze_time
from rest_framework.test import APIClient

from clients.models import Client
from inventory.models import InventoryCategory, OrderUsedProduct, Product
from notifications.models import Notification
from orders.models import Order, OrderStatus


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
@freeze_time("2026-03-17 10:00:00")
def test_tc60_stage_i_full_staff_workflow_creates_notifications_and_exports():
    password = "Passw0rd123"

    admin = User.objects.create_user(email="admin_i@example.com", name="Admin", role=User.Role.ADMIN, phone="+79990000001", password=password)
    manager = User.objects.create_user(email="mgr_i@example.com", name="Manager", role=User.Role.MANAGER, phone="+79990000002", password=password)
    master = User.objects.create_user(email="m_i@example.com", name="Master", role=User.Role.MASTER, phone="+79990000003", password=password)

    cat = InventoryCategory.objects.create(name="Картриджи")
    product = Product.objects.create(
        name="HP",
        category=cat,
        sku="S-STAGE-I",
        unit="шт",
        purchase_price=Decimal("60"),
        min_stock=Decimal("5"),
        current_stock=Decimal("5"),
    )

    c = Client.objects.create(type="person", name="Иванов", phone="+70000000060")

    api_manager = APIClient()
    _auth(api_manager, email=manager.email, password=password)

    resp = api_manager.post(
        "/api/orders/",
        {
            "client": c.id,
            "device_type": "Принтер",
            "device_model": "HP 1018",
            "issue_description": "Не печатает",
            "received_date": "2026-03-17",
            "assigned_master": master.id,
        },
        format="json",
    )
    assert resp.status_code == 201
    oid = resp.data["id"]

    api_master = APIClient()
    _auth(api_master, email=master.email, password=password)

    for to_status in ["diagnostics", "negotiation", "repair"]:
        r = api_master.post(f"/api/orders/{oid}/change-status/", {"to_status": to_status, "comment": "stage-i"}, format="json")
        assert r.status_code == 200
    r_ready = api_master.post(
        f"/api/orders/{oid}/change-status/",
        {"to_status": "ready", "comment": "stage-i", "final_work_cost": "100.00", "used_products": {"items": []}},
        format="json",
    )
    assert r_ready.status_code == 200

    # SMS queuing: ready => client notification stored under system-admin, negotiation => managers notification stored on the manager user.
    assert Notification.objects.filter(type="order_ready", status=Notification.Status.QUEUED).exists()
    assert Notification.objects.filter(type="need_negotiation", status=Notification.Status.QUEUED, user=manager).exists()

    # Used products update triggers stock_out and low-stock notification.
    r2 = api_master.put(
        f"/api/orders/{oid}/used-products/",
        {"items": [{"product": product.id, "quantity": "1"}]},
        format="json",
    )
    assert r2.status_code == 200

    product.refresh_from_db()
    assert product.current_stock == Decimal("4")

    assert Notification.objects.filter(type="low_stock", status=Notification.Status.QUEUED, user=admin).exists()

    api_admin = APIClient()
    _auth(api_admin, email=admin.email, password=password)

    # Dashboard (admin)
    dash = api_admin.get("/api/reports/dashboard/")
    assert dash.status_code == 200
    assert any(x.get("id") == product.id for x in dash.data["low_stock"])

    # Orders report + XLSX export
    orr = api_admin.get("/api/reports/orders/?from=2026-03-01&to=2026-03-31")
    assert orr.status_code == 200
    assert orr.data["results"], "orders report should contain at least one row"
    xlsx_orders = api_admin.get("/api/reports/orders.xlsx?from=2026-03-01&to=2026-03-31")
    assert xlsx_orders.status_code == 200

    # Stock movements report + XLSX export
    sm = api_admin.get("/api/reports/stock-movements/")
    assert sm.status_code == 200
    sm_xlsx = api_admin.get("/api/reports/stock-movements.xlsx?from=2026-03-01&to=2026-03-31")
    assert sm_xlsx.status_code == 200

    # Finance report + totals correctness
    fin = api_admin.get("/api/reports/finance/?from=2026-03-01&to=2026-03-31")
    assert fin.status_code == 200
    assert fin.data["totals"]["revenue"] == "100"
    assert fin.data["totals"]["cost"] == "60"
    assert fin.data["totals"]["profit"] == "40"

    fin_xlsx = api_admin.get("/api/reports/finance.xlsx?from=2026-03-01&to=2026-03-31")
    assert fin_xlsx.status_code == 200


@pytest.mark.django_db
@freeze_time("2026-03-17 10:00:00")
def test_tc61_stage_i_finance_report_query_count_smoke():
    password = "Passw0rd123"

    admin = User.objects.create_user(email="admin_i2@example.com", name="Admin", role=User.Role.ADMIN, phone="+79990000011", password=password)
    manager = User.objects.create_user(email="mgr_i2@example.com", name="Manager", role=User.Role.MANAGER, phone="+79990000012", password=password)

    master = User.objects.create_user(email="m_i2@example.com", name="Master", role=User.Role.MASTER, phone="+79990000013", password=password)

    cat = InventoryCategory.objects.create(name="Картриджи")
    product = Product.objects.create(
        name="HP",
        category=cat,
        sku="S-STAGE-I-2",
        unit="шт",
        purchase_price=Decimal("60"),
        selling_price=Decimal("40"),
        min_stock=Decimal("1"),
        current_stock=Decimal("1"),
    )

    c = Client.objects.create(type="person", name="Иванов", phone="+70000000061")

    accepted = OrderStatus.objects.get(code="accepted")
    o = Order.objects.create(
        order_number="0317-9999",
        client=c,
        device_type="Принтер",
        issue_description="X",
        received_date="2026-03-17",
        status=accepted,
        created_by=admin,
        assigned_master=master,
        final_work_cost=Decimal("60"),
        final_materials_cost=Decimal("40"),
        total_amount=Decimal("100"),
        materials_cost_price=Decimal("60"),
        profit=Decimal("40"),
        final_cost=Decimal("100"),
    )

    # direct used-product link (avoid stock_out here)
    OrderUsedProduct.objects.create(
        order=o,
        product=product,
        quantity=Decimal("1"),
        selling_price_at_moment=Decimal("40"),
        purchase_price_at_moment=Decimal("60"),
    )

    api = APIClient()
    _auth(api, email=admin.email, password=password)

    with CaptureQueriesContext(connection) as ctx:
        resp = api.get("/api/reports/finance/?from=2026-03-01&to=2026-03-31")

    assert resp.status_code == 200
    # Should not be N+1 due to prefetch_related in finance view.
    assert len(ctx.captured_queries) <= 20


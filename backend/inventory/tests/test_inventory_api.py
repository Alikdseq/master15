import io
from decimal import Decimal
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APIClient

from clients.models import Client
from inventory.excel_import import parse_uploaded_inventory_excel
from inventory.models import InventoryCategory, Product
from notifications.models import Notification
from orders.models import Order, OrderStatus


User = get_user_model()


def _auth(client: APIClient, *, email: str, password: str) -> None:
    resp = client.post("/api/auth/token/", {"email": email, "password": password}, format="json")
    token = resp.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")


@pytest.mark.django_db
def test_tc16_add_category():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post("/api/inventory/categories/", {"name": "Картриджи", "parent": None}, format="json")
    assert resp.status_code == 201
    assert InventoryCategory.objects.filter(name="Картриджи").exists()


@pytest.mark.django_db
def test_tc17_add_product():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    cat = InventoryCategory.objects.create(name="Картриджи")
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post(
        "/api/inventory/products/",
        {"name": "Картридж HP 85A", "category": cat.id, "sku": "HP85A", "unit": "шт", "min_stock": "2"},
        format="json",
    )
    assert resp.status_code == 201
    p = Product.objects.get(sku="HP85A")
    assert p.current_stock == Decimal("0")


@pytest.mark.django_db
def test_tc18_stock_increases_on_in():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    cat = InventoryCategory.objects.create(name="Картриджи")
    p = Product.objects.create(name="HP", category=cat, sku="S1", unit="шт", min_stock=Decimal("2"))
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post("/api/inventory/movements/in/", {"product": p.id, "quantity": "10", "comment": "Поставка"}, format="json")
    assert resp.status_code == 201
    p.refresh_from_db()
    assert p.current_stock == Decimal("10")


@pytest.mark.django_db
def test_tc20_manual_write_off():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    cat = InventoryCategory.objects.create(name="Запчасти")
    p = Product.objects.create(name="Ролик", category=cat, sku="R1", unit="шт", min_stock=Decimal("1"), current_stock=Decimal("5"))
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post("/api/inventory/movements/out/", {"product": p.id, "quantity": "1", "comment": "испорчен"}, format="json")
    assert resp.status_code == 201
    p.refresh_from_db()
    assert p.current_stock == Decimal("4")


@pytest.mark.django_db
def test_tc19_write_off_in_order_used_products():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    master = User.objects.create_user(email="m@example.com", name="Master", role=User.Role.MASTER, password="Passw0rd123")
    cat = InventoryCategory.objects.create(name="Картриджи")
    p = Product.objects.create(name="HP", category=cat, sku="S1", unit="шт", min_stock=Decimal("1"), current_stock=Decimal("3"))
    c = Client.objects.create(type="person", name="A", phone="+70000000000")
    accepted = OrderStatus.objects.get(code="accepted")
    order = Order.objects.create(
        order_number="0317-0001",
        client=c,
        device_type="Принтер",
        issue_description="X",
        received_date="2026-03-17",
        status=accepted,
        assigned_master=master,
        created_by=admin,
    )

    api = APIClient()
    _auth(api, email=master.email, password="Passw0rd123")
    resp = api.put(
        f"/api/orders/{order.id}/used-products/",
        {"items": [{"product": p.id, "quantity": "1"}]},
        format="json",
    )
    assert resp.status_code == 200
    p.refresh_from_db()
    assert p.current_stock == Decimal("2")


@pytest.mark.django_db
def test_tc21_low_stock_notification_created():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    cat = InventoryCategory.objects.create(name="Картриджи")
    p = Product.objects.create(name="HP", category=cat, sku="S1", unit="шт", min_stock=Decimal("2"), current_stock=Decimal("2"))
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post("/api/inventory/movements/out/", {"product": p.id, "quantity": "1", "comment": "test"}, format="json")
    assert resp.status_code == 201
    assert Notification.objects.filter(user=admin, type="low_stock").exists()


@pytest.mark.django_db
def test_tc22_stock_report():
    admin = User.objects.create_user(email="admin@example.com", name="Admin", role=User.Role.ADMIN, password="Passw0rd123")
    cat = InventoryCategory.objects.create(name="Картриджи")
    Product.objects.create(name="HP", category=cat, sku="S1", unit="шт", min_stock=Decimal("2"), current_stock=Decimal("1"))
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.get("/api/inventory/products/stock-report/")
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["is_low_stock"] is True


@pytest.mark.django_db
def test_tc23_low_stock_not_triggered_on_equal_min_stock():
    admin = User.objects.create_user(
        email="admin@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    cat = InventoryCategory.objects.create(name="Картриджи")
    # After write-off new_stock == min_stock => должно НЕ триггерить
    p = Product.objects.create(
        name="HP",
        category=cat,
        sku="S1",
        unit="шт",
        min_stock=Decimal("2"),
        current_stock=Decimal("3"),
    )
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")
    resp = api.post(
        "/api/inventory/movements/out/",
        {"product": p.id, "quantity": "1", "comment": "test"},
        format="json",
    )
    assert resp.status_code == 201
    p.refresh_from_db()
    assert p.current_stock == Decimal("2")
    assert not Notification.objects.filter(user=admin, type="low_stock").exists()


@pytest.mark.django_db
def test_tc24_product_movements_endpoint_returns_history():
    admin = User.objects.create_user(
        email="admin@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    cat = InventoryCategory.objects.create(name="Картриджи")
    p = Product.objects.create(
        name="HP",
        category=cat,
        sku="S1",
        unit="шт",
        min_stock=Decimal("2"),
        current_stock=Decimal("5"),
    )
    api = APIClient()
    _auth(api, email=admin.email, password="Passw0rd123")

    api.post(
        "/api/inventory/movements/out/",
        {"product": p.id, "quantity": "1", "comment": "испорчен"},
        format="json",
    )
    resp = api.get(f"/api/inventory/products/{p.id}/movements/")
    assert resp.status_code == 200
    assert resp.data["results"]
    assert any(x["type"] == "out" for x in resp.data["results"])


def _xlsx_bytes(rows: list[list[object]]) -> bytes:
    buf = io.BytesIO()
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.django_db
def test_import_excel_creates_product_and_purchase_movement():
    admin = User.objects.create_user(
        email="admin-import@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    InventoryCategory.objects.create(name="Картриджи")
    api = APIClient()
    api.force_authenticate(user=admin)
    raw = _xlsx_bytes(
        [
            ["Артикул", "Товар", "Количество", "Ед.", "Цена"],
            ["IMP1", "Импорт тест", 2, "шт", 50],
        ]
    )
    up = SimpleUploadedFile(
        "test.xlsx",
        raw,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    resp = api.post("/api/inventory/products/import-excel/", {"file": up}, format="multipart")
    assert resp.status_code == 200
    assert resp.data["created"] == 1
    assert resp.data["stock_movements"] == 1
    p = Product.objects.get(sku="IMP1")
    assert p.current_stock == Decimal("2")
    assert p.purchase_price == Decimal("50.00")
    assert p.category.name == "Импорт Excel"


@pytest.mark.django_db
def test_import_excel_same_price_increments_stock():
    admin = User.objects.create_user(
        email="admin-import2@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    cat = InventoryCategory.objects.create(name="Картриджи")
    p = Product.objects.create(
        name="X",
        category=cat,
        sku="IMP2",
        unit="шт",
        min_stock=Decimal("0"),
        current_stock=Decimal("3"),
        purchase_price=Decimal("10.00"),
    )
    api = APIClient()
    api.force_authenticate(user=admin)
    raw = _xlsx_bytes(
        [
            ["Артикул", "Товар", "Количество", "Ед.", "Цена"],
            ["IMP2", "X", 5, "шт", 10],
        ]
    )
    up = SimpleUploadedFile("t.xlsx", raw, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp = api.post("/api/inventory/products/import-excel/", {"file": up}, format="multipart")
    assert resp.status_code == 200
    assert resp.data["created"] == 0
    p.refresh_from_db()
    assert p.current_stock == Decimal("8")


@pytest.mark.django_db
def test_import_excel_different_price_creates_second_sku():
    admin = User.objects.create_user(
        email="admin-import3@example.com",
        name="Admin",
        role=User.Role.ADMIN,
        password="Passw0rd123",
    )
    cat = InventoryCategory.objects.create(name="Картриджи")
    Product.objects.create(
        name="Y",
        category=cat,
        sku="IMP3",
        unit="шт",
        min_stock=Decimal("0"),
        current_stock=Decimal("1"),
        purchase_price=Decimal("10.00"),
    )
    api = APIClient()
    api.force_authenticate(user=admin)
    raw = _xlsx_bytes(
        [
            ["Артикул", "Товар", "Количество", "Ед.", "Цена"],
            ["IMP3", "Y", 4, "шт", 25],
        ]
    )
    up = SimpleUploadedFile("t.xlsx", raw, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp = api.post("/api/inventory/products/import-excel/", {"file": up}, format="multipart")
    assert resp.status_code == 200
    assert resp.data["created"] == 1
    assert Product.objects.filter(sku="IMP3").count() == 1
    variant = Product.objects.exclude(sku="IMP3").get()
    assert variant.purchase_price == Decimal("25.00")
    assert variant.current_stock == Decimal("4")


REPO_ROOT = Path(__file__).resolve().parents[3]
TD_SAMPLE_XLS = REPO_ROOT / "ТД000000600.xls"


@pytest.mark.skipif(not TD_SAMPLE_XLS.is_file(), reason="Нет файла ТД000000600.xls в корне репозитория")
def test_parse_td_invoice_xls_printed_form():
    """Реальная накладная: шапка, таблица с «Товары (работы, услуги)», подвал."""
    raw = TD_SAMPLE_XLS.read_bytes()
    parsed, errs = parse_uploaded_inventory_excel(io.BytesIO(raw), TD_SAMPLE_XLS.name)
    assert len(errs) == 0
    assert len(parsed) == 13
    assert parsed[0].sku == "AAHPLJ1010150"
    assert len(parsed[0].name) > 5
    assert "HP" in parsed[0].name
    assert parsed[0].quantity == Decimal("12")
    assert parsed[0].unit == "шт"
    assert parsed[0].purchase_price == Decimal("643.44")


@pytest.mark.django_db
def test_import_excel_forbidden_for_master():
    master = User.objects.create_user(
        email="m-import@example.com",
        name="M",
        role=User.Role.MASTER,
        password="Passw0rd123",
    )
    api = APIClient()
    api.force_authenticate(user=master)
    raw = _xlsx_bytes(
        [
            ["Артикул", "Товар", "Количество", "Ед.", "Цена"],
            ["M1", "N", 1, "шт", 1],
        ]
    )
    up = SimpleUploadedFile("t.xlsx", raw, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp = api.post("/api/inventory/products/import-excel/", {"file": up}, format="multipart")
    assert resp.status_code == 403


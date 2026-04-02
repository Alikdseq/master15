"""
Удаляет заказы, клиентов, движения склада, уведомления и аудит;
пересоздаёт демо-данные: пользователи, склад, клиенты, заказы в разных статусах.

Запуск: python manage.py reset_demo_data --force
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django_celery_beat.models import IntervalSchedule, PeriodicTask

from audit.models import AuditLog
from clients.models import Client, ClientNote
from inventory.models import InventoryCategory, OrderUsedProduct, Product, StockMovement
from inventory.services import stock_in
from notifications.models import Notification
from orders.models import Order, OrderStatus, OrderStatusHistory
from orders.finance import recalculate_order_finances
from orders.services import generate_order_number
from orders.used_products_service import replace_order_used_products_items
from system_settings.services import set_setting
from users.models import User


def _wipe_transactional_data() -> None:
    StockMovement.objects.all().delete()
    Order.objects.all().delete()
    ClientNote.objects.all().delete()
    Client.objects.all().delete()
    Product.objects.all().delete()
    InventoryCategory.objects.all().delete()
    Notification.objects.all().delete()
    AuditLog.objects.all().delete()


def _ensure_users() -> tuple[User, User, User, User]:
    admin, _ = User.objects.get_or_create(
        email="admin@example.com",
        defaults={
            "name": "Администратор",
            "role": User.Role.ADMIN,
            "phone": "+79990000000",
            "is_staff": True,
            "is_superuser": True,
        },
    )
    admin.name = admin.name or "Администратор"
    admin.role = User.Role.ADMIN
    admin.phone = admin.phone or "+79990000000"
    admin.is_staff = True
    admin.is_superuser = True
    admin.set_password("Passw0rd123")
    admin.save()

    manager, _ = User.objects.get_or_create(
        email="manager@example.com",
        defaults={"name": "Ольга Менеджер", "role": User.Role.MANAGER, "phone": "+79990000001"},
    )
    manager.name = manager.name or "Ольга Менеджер"
    manager.role = User.Role.MANAGER
    manager.phone = manager.phone or "+79990000001"
    manager.set_password("Passw0rd123")
    manager.save()

    master1, _ = User.objects.get_or_create(
        email="master@example.com",
        defaults={"name": "Игорь Мастеров", "role": User.Role.MASTER, "phone": "+79990000002"},
    )
    master1.name = master1.name or "Игорь Мастеров"
    master1.role = User.Role.MASTER
    master1.phone = master1.phone or "+79990000002"
    master1.set_password("Passw0rd123")
    master1.save()

    master2, _ = User.objects.get_or_create(
        email="master2@example.com",
        defaults={"name": "Сергей Ремонтный", "role": User.Role.MASTER, "phone": "+79990000003"},
    )
    master2.name = master2.name or "Сергей Ремонтный"
    master2.role = User.Role.MASTER
    master2.phone = master2.phone or "+79990000003"
    master2.set_password("Passw0rd123")
    master2.save()

    return admin, manager, master1, master2


def _ensure_sms_and_beat() -> None:
    set_setting(
        "sms.templates.order_ready",
        {"text": "Здравствуйте, {client_name}! Ваш заказ {order_number} готов к выдаче."},
    )
    set_setting("sms.templates.order_accepted", {"text": "{client_name}, заказ {order_number} принят в работу."})
    set_setting("sms.templates.new_order_staff", {"text": "Новый заказ {order_number} в системе."})
    set_setting(
        "sms.templates.prophylaxis_reminder",
        {
            "text": "Здравствуйте, {client_name}! Напоминаем о профилактике техники. Скидка 10% на заправку в этом месяце."
        },
    )
    set_setting("prophylaxis.reminder_interval_days", 180)

    schedule, _ = IntervalSchedule.objects.get_or_create(every=1, period=IntervalSchedule.DAYS)
    PeriodicTask.objects.update_or_create(
        name="prophylaxis_reminders_daily",
        defaults={
            "interval": schedule,
            "task": "config.tasks.queue_prophylaxis_reminders_task",
            "enabled": True,
        },
    )


class Command(BaseCommand):
    help = "Очистить заказы/клиентов/склад и загрузить демо-данные для просмотра системы"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Не спрашивать подтверждение",
        )

    def handle(self, *args, **options):
        if not options["force"]:
            self.stdout.write(
                self.style.WARNING(
                    "Будут удалены все заказы, клиенты, товары склада и связанные записи. "
                    "Пользователи сохранятся. Запустите с --force"
                )
            )
            return

        with transaction.atomic():
            _wipe_transactional_data()
            admin, manager, master1, master2 = _ensure_users()
            _ensure_sms_and_beat()

            cat_cart = InventoryCategory.objects.create(name="Картриджи и тонер")
            cat_paper = InventoryCategory.objects.create(name="Бумага и расходники")
            cat_parts = InventoryCategory.objects.create(name="Запчасти")
            cat_svc = InventoryCategory.objects.create(name="Услуги и комплектующие")

            products_spec: list[tuple[str, str, InventoryCategory, Decimal, Decimal, Decimal]] = [
                ("Картридж HP 85A CE285A", "HP-85A-CE285A", cat_cart, Decimal("1200"), Decimal("2"), Decimal("45")),
                ("Картридж Canon 725", "CANON-725", cat_cart, Decimal("980"), Decimal("3"), Decimal("40")),
                ("Тонер-кит Samsung MLT-D111S", "SAM-MLTD111S", cat_cart, Decimal("2100"), Decimal("2"), Decimal("25")),
                ("Бумага А4 80г 500л", "PAPER-A4-80-500", cat_paper, Decimal("320"), Decimal("5"), Decimal("120")),
                ("Фотобарабан Brother DR-2300", "BR-DR2300", cat_parts, Decimal("4500"), Decimal("1"), Decimal("8")),
                ("Печатающая головка Epson L805", "EPS-L805-HEAD", cat_parts, Decimal("8900"), Decimal("1"), Decimal("4")),
                ("Ролик захвата HP", "HP-PICK-RL", cat_parts, Decimal("650"), Decimal("2"), Decimal("15")),
                ("Кабель USB 2.0 1.8м", "USB-CBL-18", cat_svc, Decimal("180"), Decimal("5"), Decimal("60")),
                ("Салфетки для оргтехники", "WIPE-100", cat_svc, Decimal("90"), Decimal("10"), Decimal("80")),
                ("Чернила Epson 664 чёрные", "EPS-664-BK", cat_cart, Decimal("420"), Decimal("4"), Decimal("35")),
                ("Термопленка для принтера", "FUSER-FILM-GEN", cat_parts, Decimal("2800"), Decimal("1"), Decimal("6")),
                ("SSD 256GB для ПК", "SSD-256-SATA", cat_svc, Decimal("2100"), Decimal("2"), Decimal("12")),
            ]

            products: list[Product] = []
            for name, sku, cat, price, min_s, stock in products_spec:
                p = Product.objects.create(
                    name=name,
                    sku=sku,
                    category=cat,
                    unit="шт",
                    purchase_price=price,
                    selling_price=price * Decimal("1.15"),
                    min_stock=min_s,
                    current_stock=Decimal("0"),
                )
                products.append(p)
                stock_in(product=p, quantity=stock, created_by=admin, comment="Демо-поступление")

            clients_data: list[tuple[str, str, str, str]] = [
                ("person", "Смирнов Алексей", "+79001001001", "г. Москва, ул. Ленина, 10"),
                ("person", "Козлова Марина", "+79001001002", ""),
                ("company", 'ООО "ТехноПринт"', "+79001001003", "г. Москва, Нагатинская наб., 12"),
                ("person", "Волков Дмитрий", "+79001001004", ""),
                ("person", "Новикова Елена", "+79001001005", "МО, г. Химки"),
                ("company", 'ИП Орлов С.В.', "+79001001006", ""),
                ("person", "Фёдоров Павел", "+79001001007", ""),
                ("person", "Морозова Анна", "+79001001008", ""),
                ("company", 'ООО "ОфисСервис"', "+79001001009", "г. Москва, ул. Тверская, 5"),
                ("person", "Лебедев Константин", "+79001001010", ""),
                ("person", "Соколова Ирина", "+79001001011", ""),
                ("person", "Григорьев Никита", "+79001001012", ""),
                ("company", 'АО "Полиграф"', "+79001001013", "г. Москва, Сколково"),
                ("person", "Белова Татьяна", "+79001001014", ""),
                ("person", "Журавлёв Артём", "+79001001015", ""),
                ("person", "Комарова Ольга", "+79001001016", ""),
                ("company", 'ООО "КопиЦентр Юг"', "+79001001017", "г. Москва, Варшавское ш., 100"),
                ("person", "Титов Максим", "+79001001018", ""),
            ]

            clients: list[Client] = []
            for ctype, name, phone, addr in clients_data:
                c = Client.objects.create(type=ctype, name=name, phone=phone, address=addr, comment="")
                clients.append(c)

            ClientNote.objects.create(
                client=clients[0],
                text="Постоянный клиент, предпочитает оригинальные картриджи.",
                created_by=manager,
            )
            ClientNote.objects.create(
                client=clients[2],
                text="Закупка по счёту, отсрочка 14 дней.",
                created_by=admin,
            )

            today = timezone.localdate()
            masters_cycle = [master1, master2, None]

            device_issues: list[tuple[str, str, str, str]] = [
                ("Принтер", "HP LaserJet Pro M404dn", "Не тянет бумагу, шум при подаче"),
                ("МФУ", "Canon MF643Cdw", "Полосы при печати, подозрение на картридж"),
                ("Принтер", "Epson L805", "Засохли чернила после простоя"),
                ("МФУ", "Brother MFC-L2700DN", "Ошибка замены барабана"),
                ("Плоттер", "HP DesignJet T530", "Сбой калибровки"),
                ("Принтер", "Samsung Xpress M2020", "Не видит картридж после замены"),
                ("Сканер", "Canon CanoScan LiDE 300", "Полосы на скане"),
                ("МФУ", "Kyocera ECOSYS M2040dn", "Код ошибки C6000"),
                ("Принтер", "HP LaserJet 1020", "Печать смещена влево"),
                ("МФУ", "Xerox WorkCentre 3025", "Не выходит из спящего режима"),
            ]

            status_by_code = {s.code: s for s in OrderStatus.objects.filter(is_active=True)}

            # (days_ago, status_code, preliminary, final_or_none, assign_idx, dev_idx, accessories)
            order_plan: list[tuple[int, str, str, str | None, int, int, dict]] = [
                (0, "accepted", "2500", None, 0, 0, {}),
                (0, "diagnostics", "1800", None, 1, 1, {}),
                (1, "negotiation", "4200", None, 0, 2, {"кабель": True}),
                (1, "waiting_parts", "3100", None, 1, 3, {}),
                (2, "repair", "5500", None, 0, 4, {}),
                (2, "repair", "2900", None, 1, 5, {}),
                (3, "ready", "4800", "4500", 0, 6, {}),
                (3, "ready", "6200", "6000", 1, 7, {}),
                (4, "completed", "5100", "4900", 0, 8, {}),
                (4, "completed", "7300", "7100", 1, 9, {}),
                (5, "accepted", "1900", None, 0, 0, {}),
                (5, "diagnostics", "3300", None, 1, 1, {}),
                (6, "negotiation", "2800", None, 0, 2, {}),
                (6, "repair", "9100", None, 1, 3, {}),
                (7, "ready", "3400", "3200", 0, 4, {}),
                (7, "completed", "2600", "2500", 1, 5, {}),
                (8, "accepted", "4100", None, 0, 6, {}),
                (8, "waiting_parts", "5600", None, 1, 7, {}),
                (9, "repair", "3800", None, 0, 8, {}),
                (9, "diagnostics", "2200", None, 1, 9, {}),
                (10, "completed", "8400", "8200", 0, 0, {}),
                (10, "completed", "1500", "1450", 1, 1, {}),
                (11, "ready", "6700", "6500", 0, 2, {}),
                (12, "negotiation", "3000", None, 1, 3, {}),
                (13, "repair", "4700", None, 0, 4, {}),
                (14, "accepted", "2100", None, 1, 5, {}),
                (15, "completed", "9900", "9600", 0, 6, {}),
                (16, "diagnostics", "2750", None, 1, 7, {}),
                (17, "ready", "5200", "5000", 0, 8, {}),
                (20, "completed", "11200", "10800", 1, 9, {}),
                (25, "repair", "6400", None, 0, 0, {}),
            ]

            orders_with_materials: list[tuple[Order, list[tuple[Product, Decimal]]]] = []
            pending_finance: list[tuple[Order, Decimal]] = []

            for i, (days_ago, st_code, prelim, final, midx, didx, acc) in enumerate(order_plan):
                rd = today - timedelta(days=days_ago)
                on = generate_order_number(received_date=rd)
                dev_type, dev_model, issue = device_issues[didx % len(device_issues)]
                st = status_by_code[st_code]
                m = masters_cycle[midx % len(masters_cycle)]

                pre_d = Decimal(prelim)
                fin_d = Decimal(final) if final is not None else None

                ready_at = None
                completed_at = None
                if st_code in ("ready", "completed"):
                    ready_at = timezone.make_aware(datetime.combine(rd, time(14, 0)))
                if st_code == "completed":
                    completed_at = timezone.make_aware(datetime.combine(rd, time(18, 0)))

                o = Order.objects.create(
                    order_number=on,
                    client=clients[i % len(clients)],
                    device_type=dev_type,
                    device_model=dev_model,
                    serial_number=f"SN{100000 + i}",
                    issue_description=issue,
                    accessories=acc,
                    received_date=rd,
                    desired_completion_date=rd + timedelta(days=3),
                    preliminary_cost=pre_d,
                    final_cost=None,
                    final_work_cost=None,
                    total_amount=None,
                    status=st,
                    assigned_master=m,
                    created_by=admin,
                    refusal_mark="",
                    ready_at=ready_at,
                    completed_at=completed_at,
                )
                if fin_d is not None:
                    pending_finance.append((o, fin_d))

                OrderStatusHistory.objects.create(
                    order=o,
                    status=st,
                    changed_by=admin if i % 2 == 0 else manager,
                    comment="Демо-запись" if i % 3 else "",
                )

                # Материалы: ограниченно, чтобы не сорвать остатки; по 1 позиции, qty 1
                if (
                    st_code in ("repair", "ready", "completed")
                    and len(orders_with_materials) < 10
                    and i % 2 == 0
                ):
                    p1 = products[i % 6]
                    orders_with_materials.append((o, [(p1, Decimal("1"))]))

            for o, pairs in orders_with_materials:
                items = [{"product": pr, "quantity": q} for pr, q in pairs]
                replace_order_used_products_items(order=o, user=admin, items=items)

            for o, target_total in pending_finance:
                o.refresh_from_db()
                mats = o.final_materials_cost or Decimal("0")
                o.final_work_cost = target_total - mats
                if o.final_work_cost < 0:
                    o.final_work_cost = Decimal("0")
                recalculate_order_finances(o, save=True)

            for c in Client.objects.all():
                mx = Order.objects.filter(client=c).aggregate(m=Max("received_date"))["m"]
                if mx:
                    c.last_order_at = timezone.make_aware(datetime.combine(mx, time(12, 0)))
                    c.save(update_fields=["last_order_at"])

            # Низкий остаток для дашборда (позиция с малым расходом в демо)
            low = products[8]
            low.current_stock = max(Decimal("0"), low.min_stock - Decimal("1"))
            low.save(update_fields=["current_stock", "updated_at"])

            self.stdout.write(self.style.SUCCESS("Демо-данные загружены."))
            self.stdout.write("  Пользователи: admin@example.com, manager@example.com, master@example.com, master2@example.com")
            self.stdout.write("  Пароль: Passw0rd123")
            self.stdout.write(f"  Клиентов: {Client.objects.count()}, заказов: {Order.objects.count()}, товаров: {Product.objects.count()}")

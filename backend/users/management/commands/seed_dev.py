from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand

from clients.models import Client
from inventory.models import InventoryCategory, Product
from inventory.services import stock_in
from orders.models import Order, OrderStatus
from system_settings.services import set_setting
from users.models import User
from django_celery_beat.models import IntervalSchedule, PeriodicTask


class Command(BaseCommand):
    help = "Seed dev data: users, templates, clients, products, sample order"

    def handle(self, *args, **options):
        admin, _ = User.objects.get_or_create(
            email="admin@example.com",
            defaults={"name": "Администратор", "role": User.Role.ADMIN, "phone": "+79990000000", "is_staff": True, "is_superuser": True},
        )
        # Ensure credentials are always set (empty password may be treated as "usable").
        admin.name = admin.name or "Администратор"
        admin.role = User.Role.ADMIN
        admin.phone = admin.phone or "+79990000000"
        admin.is_staff = True
        admin.is_superuser = True
        admin.set_password("Passw0rd123")
        admin.save()

        manager, _ = User.objects.get_or_create(
            email="manager@example.com",
            defaults={"name": "Менеджер", "role": User.Role.MANAGER, "phone": "+79990000001"},
        )
        manager.name = manager.name or "Менеджер"
        manager.role = User.Role.MANAGER
        manager.phone = manager.phone or "+79990000001"
        manager.set_password("Passw0rd123")
        manager.save()

        master, _ = User.objects.get_or_create(
            email="master@example.com",
            defaults={"name": "Мастер", "role": User.Role.MASTER, "phone": "+79990000002"},
        )
        master.name = master.name or "Мастер"
        master.role = User.Role.MASTER
        master.phone = master.phone or "+79990000002"
        master.set_password("Passw0rd123")
        master.save()

        set_setting("sms.templates.order_ready", {"text": "Здравствуйте, {client_name}! Ваш заказ {order_number} готов."})
        set_setting("sms.templates.order_accepted", {"text": "{client_name}, заказ {order_number} принят."})
        set_setting("sms.templates.new_order_staff", {"text": "Новый заказ {order_number}"})
        set_setting(
            "sms.templates.prophylaxis_reminder",
            {"text": "Здравствуйте, {client_name}! Напоминаем о профилактике. Предложение: скидка 10% на заправку в этом месяце."},
        )
        set_setting("prophylaxis.reminder_interval_days", 180)

        # Ensure prophylaxis reminders task is scheduled (via django-celery-beat).
        # Beat will call `config.tasks.queue_prophylaxis_reminders_task` once per day,
        # while the task itself decides which clients are due by interval_days.
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=1, period=IntervalSchedule.DAYS
        )
        PeriodicTask.objects.update_or_create(
            name="prophylaxis_reminders_daily",
            defaults={
                "interval": schedule,
                "task": "config.tasks.queue_prophylaxis_reminders_task",
                "enabled": True,
            },
        )

        c, _ = Client.objects.get_or_create(type="person", name="Иванов Петр", phone="+70000000000")

        cat, _ = InventoryCategory.objects.get_or_create(name="Картриджи")
        p, _ = Product.objects.get_or_create(
            sku="HP85A",
            defaults={"name": "Картридж HP 85A", "category": cat, "unit": "шт", "min_stock": Decimal("2"), "purchase_price": Decimal("100")},
        )
        if p.current_stock == 0:
            stock_in(product=p, quantity=Decimal("10"), created_by=admin, comment="seed")

        accepted = OrderStatus.objects.filter(code="accepted").first()
        if accepted:
            Order.objects.get_or_create(
                order_number="0317-0001",
                defaults={
                    "client": c,
                    "device_type": "Принтер",
                    "issue_description": "Не печатает",
                    "received_date": "2026-03-17",
                    "status": accepted,
                    "created_by": admin,
                    "assigned_master": master,
                },
            )

        # Prophylaxis reminders (SMS)
        self.stdout.write(self.style.SUCCESS("Seed completed. Login: admin@example.com / Passw0rd123"))


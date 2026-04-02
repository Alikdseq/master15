from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


class OrderStatus(models.Model):
    """
    Configurable statuses. Admin will later be able to rename and reorder.
    """

    code = models.SlugField(max_length=32, unique=True)
    name = models.CharField(max_length=64)
    sort_index = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=7, default="#1A56A3", help_text="CSS hex, e.g. #2563EB")
    visible_to_client = models.BooleanField(default=True)
    is_final = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_index", "id")

    def __str__(self) -> str:
        return self.name


class OrderStatusTransition(models.Model):
    from_status = models.ForeignKey(
        OrderStatus, on_delete=models.CASCADE, related_name="transitions_from"
    )
    to_status = models.ForeignKey(
        OrderStatus, on_delete=models.CASCADE, related_name="transitions_to"
    )
    is_enabled = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["from_status", "to_status"], name="uq_status_transition")
        ]

    def __str__(self) -> str:
        return f"{self.from_status.code} -> {self.to_status.code}"


class Order(models.Model):
    class ServiceType(models.TextChoices):
        REPAIR = "repair", "Ремонт"
        PRINT = "print", "Печать"

    order_number = models.CharField(max_length=16, unique=True)

    client = models.ForeignKey(
        "clients.Client", on_delete=models.PROTECT, related_name="orders"
    )

    service_type = models.CharField(
        max_length=16,
        choices=ServiceType.choices,
        default=ServiceType.REPAIR,
        db_index=True,
    )

    device_type = models.CharField(max_length=255)
    device_model = models.CharField(max_length=255, blank=True, default="")
    serial_number = models.CharField(max_length=255, blank=True, default="")
    issue_description = models.TextField()
    accessories = models.JSONField(default=dict, blank=True)

    received_date = models.DateField(default=timezone.localdate)
    desired_completion_date = models.DateField(null=True, blank=True)

    preliminary_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    final_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Дублирует total_amount для обратной совместимости API/отчётов",
    )
    final_work_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Окончательная стоимость работ (без материалов по продажным ценам)",
    )
    final_materials_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Сумма продажных цен списанных материалов",
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Итого к оплате клиентом",
    )
    materials_cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Себестоимость материалов (закупка × кол-во)",
    )
    profit = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Расчётная прибыль по заказу",
    )
    other_costs = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
        help_text="Прочие затраты по заказу (учитываются в прибыли)",
    )

    status = models.ForeignKey(
        OrderStatus,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
    )
    assigned_master = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_orders",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_orders",
    )

    refusal_mark = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["received_date"]),
        ]

    @property
    def is_completed(self) -> bool:
        return bool(self.status_id and self.status and self.status.is_final)

    def __str__(self) -> str:
        return self.order_number


class PrintOrder(models.Model):
    """
    Детали заказа услуги «Печать» (1:1 с Order при service_type=print).
    """

    order = models.OneToOneField(
        Order, on_delete=models.CASCADE, related_name="print_order", primary_key=True
    )
    document_type = models.CharField(max_length=50)
    page_count = models.PositiveIntegerField()
    color_mode = models.CharField(max_length=10)
    urgent = models.BooleanField(default=False)
    special_requests = models.TextField(blank=True, default="")
    file_paths = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "print_orders"

    def __str__(self) -> str:
        return f"PrintOrder({self.order_id})"


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_history")
    status = models.ForeignKey(OrderStatus, on_delete=models.PROTECT)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    comment = models.TextField(blank=True, default="")
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-changed_at", "-id")


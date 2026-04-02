from __future__ import annotations

from decimal import Decimal

from django.db import models
from django.utils import timezone


class InventoryCategory(models.Model):
    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children"
    )

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=255)
    category = models.ForeignKey(
        InventoryCategory, on_delete=models.PROTECT, related_name="products"
    )
    sku = models.CharField(max_length=64, unique=True)
    unit = models.CharField(max_length=16)

    purchase_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    selling_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    min_stock = models.DecimalField(max_digits=12, decimal_places=3, default=Decimal("0"))
    current_stock = models.DecimalField(
        max_digits=12, decimal_places=3, default=Decimal("0")
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["sku"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.sku})"


class StockMovement(models.Model):
    class Type(models.TextChoices):
        IN = "in", "Поступление"
        OUT = "out", "Списание"

    class Reason(models.TextChoices):
        ORDER = "order", "Заказ"
        WRITE_OFF = "write_off", "Списание (ручное)"
        PURCHASE = "purchase", "Поступление"
        INITIAL = "initial", "Начальные остатки"

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    type = models.CharField(max_length=8, choices=Type.choices)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    reason = models.CharField(max_length=16, choices=Reason.choices)
    comment = models.TextField(blank=True, default="")
    order = models.ForeignKey(
        "orders.Order", on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_movements"
    )
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_movements"
    )
    created_at = models.DateTimeField(default=timezone.now)


class OrderUsedProduct(models.Model):
    order = models.ForeignKey("orders.Order", on_delete=models.CASCADE, related_name="used_products")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="used_in_orders")
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    selling_price_at_moment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Продажная цена единицы на момент списания",
    )
    purchase_price_at_moment = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Закупочная цена единицы на момент списания",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["order", "product"], name="uq_order_product")
        ]


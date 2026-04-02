from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction

from inventory.models import Product, StockMovement
from notifications.models import Notification


User = get_user_model()


def _notify_low_stock(*, product: Product) -> None:
    # "Ниже минимума" => строго < min_stock
    if product.current_stock >= product.min_stock:
        return
    admins = User.objects.filter(role=User.Role.ADMIN, is_active=True)
    for admin in admins:
        Notification.objects.create(
            user=admin,
            type="low_stock",
            title="Низкий остаток на складе",
            body=f"Товар «{product.name}» (SKU {product.sku}) ниже минимума: {product.current_stock} {product.unit} (порог {product.min_stock}).",
            data={"product_id": product.id, "sku": product.sku},
        )


@transaction.atomic
def stock_in(*, product: Product, quantity: Decimal, created_by, comment: str = "") -> StockMovement:
    product = Product.objects.select_for_update().get(pk=product.pk)
    product.current_stock = (product.current_stock or Decimal("0")) + quantity
    product.save(update_fields=["current_stock", "updated_at"])
    mv = StockMovement.objects.create(
        product=product,
        type=StockMovement.Type.IN,
        quantity=quantity,
        reason=StockMovement.Reason.PURCHASE,
        comment=comment,
        created_by=created_by,
    )
    return mv


@transaction.atomic
def stock_out(
    *,
    product: Product,
    quantity: Decimal,
    created_by,
    reason: str,
    comment: str = "",
    order=None,
) -> StockMovement:
    product = Product.objects.select_for_update().get(pk=product.pk)
    new_stock = (product.current_stock or Decimal("0")) - quantity
    if new_stock < 0:
        raise ValueError("Недостаточно товара на складе.")
    product.current_stock = new_stock
    product.save(update_fields=["current_stock", "updated_at"])
    mv = StockMovement.objects.create(
        product=product,
        type=StockMovement.Type.OUT,
        quantity=quantity,
        reason=reason,
        comment=comment,
        created_by=created_by,
        order=order,
    )
    _notify_low_stock(product=product)
    return mv


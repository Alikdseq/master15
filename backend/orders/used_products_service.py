from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from inventory.models import OrderUsedProduct
from inventory.services import stock_in, stock_out
from orders.finance import recalculate_order_finances


@transaction.atomic
def replace_order_used_products_items(*, order, user, items: list[dict[str, Any]]) -> list[OrderUsedProduct]:
    """
    Полная замена списка материалов заказа.
    Сначала возвращаем ранее списанное на склад (чтобы повторное сохранение не удваивало списание),
    затем списываем по новому списку.
    """
    existing = list(OrderUsedProduct.objects.filter(order=order).select_related("product"))
    for up in existing:
        stock_in(
            product=up.product,
            quantity=up.quantity,
            created_by=user,
            comment=f"Возврат на склад перед обновлением материалов заказа {order.order_number}",
        )
    OrderUsedProduct.objects.filter(order=order).delete()

    created: list[OrderUsedProduct] = []
    for item in items:
        product = item["product"]
        qty = item["quantity"]
        stock_out(
            product=product,
            quantity=qty,
            created_by=user,
            reason="order",
            comment=f"Списание по заказу {order.order_number}",
            order=order,
        )
        sp = product.selling_price if product.selling_price is not None else Decimal("0")
        pp = product.purchase_price if product.purchase_price is not None else Decimal("0")
        created.append(
            OrderUsedProduct.objects.create(
                order=order,
                product=product,
                quantity=qty,
                selling_price_at_moment=sp,
                purchase_price_at_moment=pp,
            )
        )
    recalculate_order_finances(order, save=True)
    return created

"""
Пересчёт финансовых полей заказа по строкам материалов и стоимости работ.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from orders.models import Order


@transaction.atomic
def recalculate_order_finances(order: Order, *, save: bool = True) -> Order:
    """Обновляет final_materials_cost, materials_cost_price, total_amount, profit и дублирует total_amount в final_cost."""
    from inventory.models import OrderUsedProduct

    materials_sell = Decimal("0")
    materials_buy = Decimal("0")
    qs = OrderUsedProduct.objects.filter(order_id=order.pk).select_related("product")
    for up in qs:
        sp = up.selling_price_at_moment
        if sp is None:
            sp = up.product.selling_price
        sp = sp if sp is not None else Decimal("0")
        pp = up.purchase_price_at_moment
        if pp is None:
            pp = up.product.purchase_price
        pp = pp if pp is not None else Decimal("0")
        materials_sell += up.quantity * sp
        materials_buy += up.quantity * pp

    order.final_materials_cost = materials_sell
    order.materials_cost_price = materials_buy

    fw = order.final_work_cost
    if fw is None:
        fw = Decimal("0")
    order.total_amount = fw + materials_sell
    other = order.other_costs if order.other_costs is not None else Decimal("0")
    order.profit = order.total_amount - materials_buy - other
    order.final_cost = order.total_amount

    if save:
        order.save(
            update_fields=[
                "final_materials_cost",
                "materials_cost_price",
                "total_amount",
                "profit",
                "final_cost",
                "updated_at",
            ]
        )
    return order

from __future__ import annotations

from django.db import transaction
from django.db.models import Max

from orders.models import Order


def generate_order_number(*, received_date) -> str:
    """
    Format: MMDD-XXXX, where XXXX increments per day.
    """
    mmdd = received_date.strftime("%m%d")
    with transaction.atomic():
        last = (
            Order.objects.select_for_update()
            .filter(received_date=received_date, order_number__startswith=f"{mmdd}-")
            .aggregate(m=Max("order_number"))
            .get("m")
        )
        if last:
            try:
                seq = int(last.split("-")[1])
            except Exception:
                seq = 0
        else:
            seq = 0
        return f"{mmdd}-{seq + 1:04d}"


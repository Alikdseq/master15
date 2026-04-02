from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from inventory.models import Product, StockMovement
from orders.models import Order
from reports.permissions import IsAdmin, IsAdminOrManager
from reports.xlsx import build_xlsx

User = get_user_model()


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def _fmt_money(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, Decimal):
        try:
            value = Decimal(str(value))
        except Exception:
            return str(value)
    s = f"{value:.2f}"
    s = s.rstrip("0").rstrip(".")
    return s


def _orders_report_rows(request) -> list[dict]:
    date_from = _parse_date(request.query_params.get("from"))
    date_to = _parse_date(request.query_params.get("to"))
    status_code = request.query_params.get("status")
    master_id = request.query_params.get("master")

    qs = Order.objects.select_related("client", "status", "assigned_master").all()
    if date_from:
        qs = qs.filter(received_date__gte=date_from)
    if date_to:
        qs = qs.filter(received_date__lte=date_to)
    if status_code:
        qs = qs.filter(status__code=status_code)
    if master_id:
        qs = qs.filter(assigned_master_id=master_id)

    return [
        {
            "order_number": o.order_number,
            "received_date": o.received_date,
            "client": o.client.name,
            "phone": o.client.phone,
            "device": o.device_type,
            "status": o.status.name if o.status else None,
            "status_code": o.status.code if o.status else None,
            "issue_description": (o.issue_description or "")[:500],
            "master": o.assigned_master.name if o.assigned_master else None,
            "preliminary_cost": _fmt_money(o.preliminary_cost),
            "final_cost": _fmt_money(o.final_cost),
        }
        for o in qs.order_by("-received_date", "-id")[:5000]
    ]


def _stock_movements_rows(request) -> list[dict]:
    date_from = _parse_date(request.query_params.get("from"))
    date_to = _parse_date(request.query_params.get("to"))
    product_id = request.query_params.get("product")

    qs = StockMovement.objects.select_related("product", "order").all()
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)
    if product_id:
        qs = qs.filter(product_id=product_id)

    return [
        {
            "created_at": o.created_at,
            "product": o.product.name,
            "sku": o.product.sku,
            "type": o.type,
            "quantity": str(o.quantity),
            "reason": o.reason,
            "order_number": o.order.order_number if o.order_id else None,
            "comment": o.comment,
        }
        for o in qs.order_by("-id")[:10000]
    ]


def _finance_rows(request) -> tuple[list[dict], dict]:
    date_from = _parse_date(request.query_params.get("from"))
    date_to = _parse_date(request.query_params.get("to"))

    qs = (
        Order.objects.select_related("status", "assigned_master")
        .prefetch_related("used_products__product")
        .all()
    )
    if date_from:
        qs = qs.filter(received_date__gte=date_from)
    if date_to:
        qs = qs.filter(received_date__lte=date_to)

    results = []
    total_revenue = Decimal("0")
    total_cost = Decimal("0")

    for o in qs.order_by("-received_date", "-id")[:5000]:
        revenue = o.total_amount if o.total_amount is not None else (o.final_cost or Decimal("0"))
        cost = o.materials_cost_price
        if cost is None:
            cost = Decimal("0")
            for up in o.used_products.all():
                pp = up.purchase_price_at_moment
                if pp is None and up.product.purchase_price is not None:
                    pp = up.product.purchase_price
                if pp is not None:
                    cost += up.quantity * pp
        other = o.other_costs or Decimal("0")
        profit = o.profit if o.profit is not None else (revenue - cost - other)
        row_cost = cost + other
        total_revenue += revenue
        total_cost += row_cost
        results.append(
            {
                "order_number": o.order_number,
                "received_date": o.received_date,
                "status": o.status.name if o.status else None,
                "master": o.assigned_master.name if o.assigned_master else None,
                "revenue": _fmt_money(revenue),
                "cost": _fmt_money(row_cost),
                "profit": _fmt_money(profit),
            }
        )

    totals = {
        "revenue": _fmt_money(total_revenue),
        "cost": _fmt_money(total_cost),
        "profit": _fmt_money(total_revenue - total_cost),
    }
    return results, totals


def _days_in_current_status(order: Order) -> int:
    if not order.updated_at:
        return 0
    upd = timezone.localtime(order.updated_at).date()
    return max(0, (timezone.localdate() - upd).days)


def _serialize_order_card(order: Order) -> dict:
    st = order.status
    c = order.client
    return {
        "id": order.id,
        "order_number": order.order_number,
        "client_name": c.name if c else "",
        "client_phone": c.phone if c else "",
        "device_type": order.device_type,
        "status_code": st.code if st else None,
        "status_name": st.name if st else None,
        "received_date": str(order.received_date) if order.received_date else None,
        "days_in_status": _days_in_current_status(order),
    }


def _orders_line_series(qs, *, today: date, days: int = 14) -> tuple[list[str], list[int]]:
    labels: list[str] = []
    values: list[int] = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        labels.append(d.strftime("%d.%m"))
        values.append(qs.filter(received_date=d).count())
    return labels, values


def _status_distribution(qs) -> list[dict]:
    rows = (
        qs.values(code=F("status__code"), name=F("status__name"))
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    return [{"code": x["code"], "name": x["name"], "count": x["count"]} for x in rows if x["code"]]


def _urgent_orders_list(qs) -> list[dict]:
    """Заказы в waiting_parts >7 дн. или negotiation >3 дн. (по updated_at)."""
    candidates = qs.filter(status__code__in=("waiting_parts", "negotiation")).select_related("status", "client")[:200]
    out: list[tuple[int, Order]] = []
    for o in candidates:
        d = _days_in_current_status(o)
        code = o.status.code if o.status else ""
        if code == "waiting_parts" and d >= 7:
            out.append((d, o))
        elif code == "negotiation" and d >= 3:
            out.append((d, o))
    out.sort(key=lambda x: -x[0])
    return [_serialize_order_card(o) for _, o in out[:25]]


def _top_services(qs, limit: int = 5) -> list[dict]:
    rows = (
        qs.exclude(issue_description__exact="")
        .values(name=F("issue_description"))
        .annotate(count=Count("id"))
        .order_by("-count")[:limit]
    )
    return [{"name": (x["name"] or "")[:200], "count": x["count"]} for x in rows]


def _avg_completion_hours_for_completed_orders(qs, *, date_from: date, date_to: date) -> float | None:
    """
    Среднее время от начала календарного дня приёма (received_date) до момента completed_at.

    Не используем completed_at - created_at: «создан в CRM» часто позже фактической даты приёма
    и завершения (импорт, демо-данные, поздний ввод) — тогда разность уходит в минус.
    """
    done = (
        qs.select_related(None)
        .filter(
            status__code="completed",
            completed_at__isnull=False,
            received_date__isnull=False,
            completed_at__date__gte=date_from,
            completed_at__date__lte=date_to,
        )
        .only("id", "completed_at", "received_date")
    )
    total_seconds = 0.0
    n = 0
    tz = timezone.get_current_timezone()
    for o in done:
        rd = o.received_date
        start = timezone.make_aware(datetime.combine(rd, time.min), tz)
        delta = o.completed_at - start
        if delta.total_seconds() >= 0:
            total_seconds += delta.total_seconds()
            n += 1
    if n == 0:
        return None
    return round((total_seconds / n) / 3600.0, 2)


def _low_stock_rows() -> list[dict]:
    return list(
        Product.objects.select_related("category")
        .filter(current_stock__lte=F("min_stock"))
        .values("id", "name", "sku", "unit", "current_stock", "min_stock")[:50]
    )


def _master_activity_week() -> list[dict]:
    """Мастера: завершённые заказы за 7 дней и среднее время выполнения (дней)."""
    today = timezone.localdate()
    week_ago = today - timedelta(days=6)
    masters = User.objects.filter(role=User.Role.MASTER, is_active=True).order_by("name")[:50]
    result = []
    for m in masters:
        done = Order.objects.filter(
            assigned_master=m,
            status__code="completed",
            completed_at__isnull=False,
            completed_at__date__gte=week_ago,
            completed_at__date__lte=today,
        )
        completed_n = done.count()
        if completed_n == 0:
            continue
        total_days = 0
        for o in done:
            if o.completed_at and o.received_date:
                total_days += (o.completed_at.date() - o.received_date).days
        avg_days = round(total_days / completed_n, 1) if completed_n else None
        result.append({"name": m.name or m.email, "completed": completed_n, "avg_days": avg_days})
    result.sort(key=lambda x: -x["completed"])
    return result[:15]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """
    Единая точка данных дашборда. Набор полей зависит от роли пользователя.
    """
    user = request.user
    role = getattr(user, "role", None)
    today = timezone.localdate()
    rolling_week_start = today - timedelta(days=6)
    rolling_month_start = today - timedelta(days=29)

    qs_all = Order.objects.select_related("status", "client", "assigned_master")

    if role == User.Role.MASTER:
        qs_scope = qs_all.filter(assigned_master_id=user.id)
    else:
        qs_scope = qs_all.all()

    orders_today = qs_scope.filter(received_date=today).count()
    orders_week = qs_scope.filter(received_date__gte=rolling_week_start, received_date__lte=today).count()
    orders_month = qs_scope.filter(received_date__gte=rolling_month_start, received_date__lte=today).count()

    # Линейный график: админ/менеджер — все заказы; мастер — только свои
    line_qs = qs_all if role != User.Role.MASTER else qs_scope
    orders_line_labels, orders_line_values = _orders_line_series(line_qs, today=today, days=14)

    pie_qs = line_qs.exclude(status__code="completed") if role == User.Role.MASTER else line_qs
    status_distribution = _status_distribution(pie_qs)

    low_stock_list = _low_stock_rows()
    low_stock_count = len(low_stock_list)

    top_services = _top_services(qs_scope if role == User.Role.MASTER else qs_all, limit=5)

    urgent_source = qs_all if role != User.Role.MASTER else qs_scope
    urgent_orders = _urgent_orders_list(urgent_source)

    payload: dict = {
        "role": role,
        "updated_at": timezone.now().isoformat(),
        "charts": {
            "orders_line": {"labels": orders_line_labels, "values": orders_line_values},
            "status_distribution": status_distribution,
        },
        "top_services": top_services,
    }

    if role == User.Role.ADMIN:
        revenue = (
            qs_all.filter(
                status__code="completed",
                completed_at__date__gte=rolling_month_start,
                completed_at__date__lte=today,
            )
            .filter(Q(total_amount__isnull=False) | Q(final_cost__isnull=False))
            .aggregate(
                sum=Sum(
                    Coalesce(
                        F("total_amount"),
                        F("final_cost"),
                        output_field=DecimalField(max_digits=12, decimal_places=2),
                    )
                )
            )
            .get("sum")
        )
        avg_completion_hours = _avg_completion_hours_for_completed_orders(
            qs_all, date_from=rolling_month_start, date_to=today
        )

        top_clients = (
            qs_all.values("client_id", "client__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        payload["stats"] = {
            "orders_today": orders_today,
            "orders_week": orders_week,
            "orders_month": orders_month,
            "revenue_month": _fmt_money(revenue),
            "avg_completion_hours": avg_completion_hours,
            "low_stock_count": low_stock_count,
        }
        payload["orders"] = {"today": orders_today, "week": orders_week, "month": orders_month}
        payload["avg_completion_hours"] = avg_completion_hours
        payload["revenue_sum"] = _fmt_money(revenue)
        payload["by_status"] = status_distribution
        payload["top_issues"] = top_services
        payload["top_clients"] = [
            {"client_id": x["client_id"], "client_name": x["client__name"], "count": x["count"]} for x in top_clients
        ]
        payload["low_stock"] = low_stock_list
        payload["urgent_orders"] = urgent_orders
        payload["activity"] = _master_activity_week()
        payload["negotiation_orders"] = None
        payload["ready_orders"] = None
        payload["master_orders"] = None
        payload["master_load"] = None

    elif role == User.Role.MANAGER:
        neg_qs = (
            qs_all.filter(status__code="negotiation")
            .select_related("client", "status")
            .order_by("-updated_at")[:15]
        )
        ready_qs = (
            qs_all.filter(status__code="ready")
            .select_related("client", "status")
            .order_by("-updated_at")[:15]
        )
        payload["stats"] = {
            "orders_today": orders_today,
            "orders_week": orders_week,
            "orders_month": orders_month,
            "pending_negotiation": qs_all.filter(status__code="negotiation").count(),
            "ready_pickup": qs_all.filter(status__code="ready").count(),
            "low_stock_count": low_stock_count,
        }
        payload["low_stock"] = low_stock_list
        payload["urgent_orders"] = urgent_orders
        payload["negotiation_orders"] = [_serialize_order_card(o) for o in neg_qs]
        payload["ready_orders"] = [_serialize_order_card(o) for o in ready_qs]
        payload["activity"] = None
        payload["master_orders"] = None
        payload["master_load"] = None

    else:
        # master
        in_repair = qs_scope.filter(status__code="repair").count()
        waiting_parts_n = qs_scope.filter(status__code="waiting_parts").count()
        completed_week = qs_scope.filter(
            status__code="completed",
            completed_at__date__gte=rolling_week_start,
            completed_at__date__lte=today,
        ).count()
        done_month = qs_scope.filter(
            status__code="completed",
            completed_at__isnull=False,
            completed_at__date__gte=rolling_month_start,
            completed_at__date__lte=today,
        )
        avg_days_repair = None
        if done_month.exists():
            total_d = 0
            n = 0
            for o in done_month:
                if o.completed_at and o.received_date:
                    total_d += (o.completed_at.date() - o.received_date).days
                    n += 1
            if n:
                avg_days_repair = round(total_d / n, 1)

        active_assign = (
            qs_scope.exclude(status__code="completed")
            .select_related("client", "status")
            .order_by("-updated_at")[:25]
        )

        payload["stats"] = {
            "in_repair": in_repair,
            "waiting_parts": waiting_parts_n,
            "completed_week": completed_week,
            "avg_repair_days": avg_days_repair,
            "active_orders": qs_scope.exclude(status__code="completed").count(),
        }
        payload["low_stock"] = None
        payload["urgent_orders"] = _urgent_orders_list(qs_scope)
        payload["negotiation_orders"] = None
        payload["ready_orders"] = None
        payload["master_orders"] = [_serialize_order_card(o) for o in active_assign]
        payload["activity"] = None
        payload["master_load"] = {
            "active": qs_scope.exclude(status__code="completed").count(),
            "waiting_parts": waiting_parts_n,
            "avg_repair_days": avg_days_repair,
        }

    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAdminOrManager])
def orders_report(request):
    return Response({"results": _orders_report_rows(request)})


@api_view(["GET"])
@permission_classes([IsAdminOrManager])
def orders_report_xlsx(request):
    data = _orders_report_rows(request)
    rows = [
        [
            x["order_number"],
            str(x["received_date"]),
            x["client"],
            x["phone"],
            x["device"],
            x["status"],
            x.get("issue_description") or "",
            x["master"],
            x["preliminary_cost"],
            x["final_cost"],
        ]
        for x in data
    ]
    content = build_xlsx(
        sheet_name="Заказы",
        headers=[
            "Номер заказа",
            "Дата приёма",
            "Клиент",
            "Телефон",
            "Устройство",
            "Статус",
            "Неисправность",
            "Мастер",
            "Предв. стоимость",
            "Итоговая стоимость",
        ],
        rows=rows,
    )
    r = HttpResponse(content, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    r["Content-Disposition"] = 'attachment; filename="orders_report.xlsx"'
    return r


@api_view(["GET"])
@permission_classes([IsAdmin])
def stock_movements_report(request):
    return Response({"results": _stock_movements_rows(request)})


@api_view(["GET"])
@permission_classes([IsAdmin])
def stock_movements_report_xlsx(request):
    data = _stock_movements_rows(request)
    rows = [
        [
            x["created_at"].strftime("%Y-%m-%d %H:%M:%S"),
            x["product"],
            x["sku"],
            x["type"],
            x["quantity"],
            x["reason"],
            x["order_number"],
            x["comment"],
        ]
        for x in data
    ]
    content = build_xlsx(
        sheet_name="Движение",
        headers=[
            "Дата",
            "Товар",
            "SKU",
            "Тип",
            "Количество",
            "Причина",
            "Заказ",
            "Комментарий",
        ],
        rows=rows,
    )
    r = HttpResponse(content, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    r["Content-Disposition"] = 'attachment; filename="stock_movements_report.xlsx"'
    return r


@api_view(["GET"])
@permission_classes([IsAdmin])
def finance_report(request):
    results, totals = _finance_rows(request)
    return Response({"results": results, "totals": totals})


@api_view(["GET"])
@permission_classes([IsAdmin])
def finance_report_xlsx(request):
    results, totals = _finance_rows(request)
    rows = [
        [
            x["order_number"],
            str(x["received_date"]),
            x["status"],
            x["master"],
            x["revenue"],
            x["cost"],
            x["profit"],
        ]
        for x in results
    ]
    # totals row
    rows.append([])
    rows.append(
        [
            "ИТОГО",
            "",
            "",
            "",
            totals["revenue"],
            totals["cost"],
            totals["profit"],
        ]
    )
    content = build_xlsx(
        sheet_name="Финансы",
        headers=["Номер заказа", "Дата", "Статус", "Мастер", "Доход", "Расход", "Прибыль"],
        rows=rows,
    )
    r = HttpResponse(content, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    r["Content-Disposition"] = 'attachment; filename="finance_report.xlsx"'
    return r

from django.shortcuts import render

# Create your views here.

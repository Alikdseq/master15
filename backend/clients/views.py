from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.services import log_action
from clients.models import Client, ClientNote
from clients.tag_filters import filter_clients_by_tags
from clients.pagination import ClientOrdersPagination
from clients.permissions import ClientAccessPermission
from clients.serializers import (
    ClientBulkTagsSerializer,
    ClientCreateUpdateSerializer,
    ClientNoteCreateSerializer,
    ClientNoteSerializer,
    ClientSerializer,
    ClientMassSmsSerializer,
)
from notifications.services import queue_mass_sms_to_clients
from orders.models import Order
from realtime.broadcast import broadcast_crm

User = get_user_model()


def _serialize_order_row(o: Order) -> dict:
    m = o.assigned_master
    return {
        "id": o.id,
        "order_number": o.order_number,
        "service_type": getattr(o, "service_type", "repair"),
        "received_date": o.received_date,
        "device_type": o.device_type,
        "device_model": o.device_model,
        "issue_description": (o.issue_description[:500] if o.issue_description else ""),
        "final_cost": str(o.final_cost) if o.final_cost is not None else None,
        "status": {"code": o.status.code, "name": o.status.name} if o.status else None,
        "assigned_master": {"id": o.assigned_master_id, "name": m.name if m else None},
        "completed_at": o.completed_at.isoformat() if o.completed_at else None,
    }


class ClientViewSet(viewsets.ModelViewSet):
    permission_classes = [ClientAccessPermission]
    search_fields = ("name",)
    ordering_fields = ("id", "name", "phone", "created_at", "updated_at", "last_order_at")
    ordering = ("-id",)

    def get_queryset(self):
        qs = Client.objects.all()
        qs = qs.annotate(orders_count=Count("orders", distinct=True))

        user = self.request.user
        if getattr(user, "role", None) == User.Role.MASTER:
            qs = qs.filter(orders__assigned_master_id=user.id).distinct()

        tags = self.request.query_params.getlist("tag")
        if tags:
            qs = filter_clients_by_tags(qs, tags)

        last_from = self.request.query_params.get("last_order_from")
        last_to = self.request.query_params.get("last_order_to")
        if last_from:
            qs = qs.filter(last_order_at__date__gte=last_from)
        if last_to:
            qs = qs.filter(last_order_at__date__lte=last_to)

        created_from = self.request.query_params.get("created_from")
        created_to = self.request.query_params.get("created_to")
        if created_from:
            qs = qs.filter(created_at__date__gte=created_from)
        if created_to:
            qs = qs.filter(created_at__date__lte=created_to)

        orders_min = self.request.query_params.get("orders_min")
        orders_max = self.request.query_params.get("orders_max")
        if orders_min is not None and orders_min != "":
            try:
                qs = qs.filter(orders_count__gte=int(orders_min))
            except ValueError:
                pass
        if orders_max is not None and orders_max != "":
            try:
                qs = qs.filter(orders_count__lte=int(orders_max))
            except ValueError:
                pass

        active_only = self.request.query_params.get("active_orders_only")
        if active_only in ("1", "true", "True"):
            qs = qs.filter(orders__status__isnull=False, orders__status__is_final=False).distinct()

        device_type = self.request.query_params.get("device_type")
        if device_type:
            qs = qs.filter(orders__device_type=device_type).distinct()

        search = (self.request.query_params.get("search") or "").strip().lower()
        if search:
            ids = set(qs.filter(name__icontains=search).values_list("id", flat=True))
            for c in qs.only("id", "phone", "email"):
                phone = (c.phone or "").lower()
                email = (c.email or "").lower()
                if search in phone or search in email:
                    ids.add(c.id)
            qs = qs.filter(id__in=ids)

        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ClientCreateUpdateSerializer
        return ClientSerializer

    def perform_create(self, serializer):
        client = serializer.save()
        log_action(actor=self.request.user, action="client_created", obj=client)
        return client

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client = self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        data = ClientSerializer(client).data
        broadcast_crm("client_created", {"client": data, "actor_id": request.user.id})
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        if response.status_code == 200:
            client = self.get_object()
            broadcast_crm(
                "client_updated",
                {"client": ClientSerializer(client).data, "client_id": client.pk, "actor_id": request.user.id},
            )
        return response

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        if response.status_code == 200:
            client = self.get_object()
            broadcast_crm(
                "client_updated",
                {"client": ClientSerializer(client).data, "client_id": client.pk, "actor_id": request.user.id},
            )
        return response

    def perform_update(self, serializer):
        client = serializer.save()
        log_action(actor=self.request.user, action="client_updated", obj=client)

    def perform_destroy(self, instance):
        super().perform_destroy(instance)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.orders.exists():
            return Response(
                {"detail": "Нельзя удалить клиента, у которого есть заказы."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cid = instance.pk
        log_action(actor=request.user, action="client_deleted", obj=instance)
        response = super().destroy(request, *args, **kwargs)
        if response.status_code in (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK):
            broadcast_crm("client_deleted", {"client_id": cid, "actor_id": request.user.id})
        return response

    @action(detail=True, methods=["get"], url_path="orders")
    def orders(self, request, pk=None):
        client = self.get_object()
        qs = client.orders.select_related("status", "assigned_master").order_by("-id")
        paginator = ClientOrdersPagination()
        page = paginator.paginate_queryset(qs, request)
        data = [_serialize_order_row(o) for o in page]
        return paginator.get_paginated_response(data)

    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        if getattr(request.user, "role", None) == User.Role.MASTER:
            return Response({"detail": "Статистика недоступна для роли «Мастер»."}, status=403)
        client = self.get_object()
        orders_qs = Order.objects.filter(client=client)
        total_orders = orders_qs.count()

        completed_qs = orders_qs.filter(status__is_final=True).filter(
            Q(total_amount__isnull=False) | Q(final_cost__isnull=False)
        )
        amt = Coalesce(
            F("total_amount"),
            F("final_cost"),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        )
        revenue_sum = completed_qs.aggregate(s=Sum(amt))["s"] or Decimal("0")
        avg_check = None
        if completed_qs.exists():
            avg_check = completed_qs.aggregate(a=Avg(amt))["a"]

        by_device = (
            orders_qs.values("device_type").annotate(c=Count("id")).order_by("-c")
        )
        device_types = [{"name": row["device_type"], "count": row["c"]} for row in by_device]

        # Use Python-side month grouping to avoid DB-specific edge cases with date truncation.
        month_counter: dict[str, int] = defaultdict(int)
        for recv_dt in orders_qs.values_list("received_date", flat=True):
            if not recv_dt:
                continue
            if isinstance(recv_dt, (datetime, date)):
                month_key = recv_dt.strftime("%Y-%m")
            else:
                month_key = str(recv_dt)[:7]
            if len(month_key) == 7:
                month_counter[month_key] += 1
        monthly_orders = [{"month": m, "count": month_counter[m]} for m in sorted(month_counter.keys())]

        issue_counter: Counter[str] = Counter()
        for o in orders_qs.only("issue_description"):
            key = (o.issue_description or "").strip()[:120]
            if key:
                issue_counter[key] += 1
        top_issues = [{"issue": k, "count": v} for k, v in issue_counter.most_common(3)]

        avg_completion_days: float | None = None
        days_list: list[int] = []
        for o in completed_qs.only("completed_at", "received_date"):
            if o.completed_at and o.received_date:
                days = (o.completed_at.date() - o.received_date).days
                if days >= 0:
                    days_list.append(days)
        if days_list:
            avg_completion_days = round(sum(days_list) / len(days_list), 1)

        return Response(
            {
                "total_orders": total_orders,
                "revenue_sum": str(revenue_sum),
                "avg_check": str(avg_check) if avg_check is not None else None,
                "avg_completion_days": avg_completion_days,
                "device_types": device_types,
                "monthly_orders": monthly_orders,
                "top_issues": top_issues,
            }
        )

    @action(detail=True, methods=["get", "post"], url_path="notes")
    def notes(self, request, pk=None):
        client = self.get_object()
        if request.method == "GET":
            qs = ClientNote.objects.filter(client=client).order_by("-id")
            return Response({"results": ClientNoteSerializer(qs, many=True).data})

        serializer = ClientNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = ClientNote.objects.create(
            client=client, text=serializer.validated_data["text"], created_by=request.user
        )
        log_action(
            actor=request.user,
            action="client_note_added",
            obj=client,
            meta={"note_id": note.id},
        )
        return Response(ClientNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="tags-count")
    def tags_count(self, request):
        qs = self.filter_queryset(self.get_queryset())
        counts: Counter[str] = Counter()
        for c in qs.only("tags"):
            for t in c.tags or []:
                if isinstance(t, str) and t.strip():
                    counts[t.strip()] += 1
        payload = [{"tag": t, "count": n} for t, n in counts.most_common(50)]
        return Response({"results": payload})

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        if getattr(request.user, "role", None) != User.Role.ADMIN:
            return Response({"detail": "Только администратор может выполнять массовые операции с тегами."}, status=403)

        serializer = ClientBulkTagsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        op = serializer.validated_data["operation"]
        tag_list = serializer.validated_data["tags"]
        client_ids = serializer.validated_data["client_ids"]

        updated = 0
        for client in Client.objects.filter(id__in=client_ids):
            tags = list(client.tags or [])
            if op == "add_tags":
                seen = {x.lower() for x in tags}
                for t in tag_list:
                    if t.lower() not in seen:
                        tags.append(t)
                        seen.add(t.lower())
            else:
                remove = {t.lower() for t in tag_list}
                tags = [x for x in tags if x.lower() not in remove]
            client.tags = tags
            client.save(update_fields=["tags", "updated_at"])
            updated += 1

        log_action(
            actor=request.user,
            action="client_bulk_tags",
            meta={"operation": op, "tags": tag_list, "client_ids": client_ids, "updated": updated},
        )
        return Response({"updated": updated})

    @action(detail=False, methods=["post"], url_path="mass-sms")
    def mass_sms(self, request):
        if getattr(request.user, "role", None) != "admin":
            return Response({"detail": "Только администратор может отправлять массовые SMS."}, status=403)

        serializer = ClientMassSmsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        client_ids = validated.get("client_ids") or []
        if client_ids:
            qs = Client.objects.filter(id__in=client_ids)
        else:
            qs = Client.objects.all()
            tags = validated.get("tags") or []
            if tags:
                qs = filter_clients_by_tags(qs, tags)

            last_from = validated.get("last_order_from")
            if last_from:
                qs = qs.filter(last_order_at__date__gte=last_from)

            last_to = validated.get("last_order_to")
            if last_to:
                qs = qs.filter(last_order_at__date__lte=last_to)

        total_selected = qs.count()
        queued = queue_mass_sms_to_clients(
            clients=qs,
            notif_type=validated["notif_type"],
            title=validated.get("title") or "",
            body=validated["body"],
            data={},
        )

        log_action(
            actor=request.user,
            action="client_mass_sms_queued",
            meta={
                "notif_type": validated["notif_type"],
                "queued": queued,
                "total_selected": total_selected,
                "tags": validated.get("tags") or [],
                "client_ids": client_ids,
            },
        )

        return Response({"queued": queued, "total_selected": total_selected})

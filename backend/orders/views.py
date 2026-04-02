import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from audit.services import log_action
from inventory.models import OrderUsedProduct
from inventory.serializers import (
    OrderUsedProductSerializer,
    OrderUsedProductsUpdateSerializer,
)
from notifications.services import queue_need_negotiation, queue_order_ready
from orders.filters import OrderFilter
from orders.models import Order, OrderStatus, OrderStatusHistory, OrderStatusTransition, PrintOrder
from orders.pagination import OrderPagination
from orders.permissions import OrderAccessPermission
from orders.serializers import (
    OrderChangeStatusSerializer,
    OrderCreateSerializer,
    OrderSerializer,
    OrderStatusHistorySerializer,
    OrderUpdateSerializer,
    PrintOrderSerializer,
)
from orders.finance import recalculate_order_finances
from orders.used_products_service import replace_order_used_products_items
from realtime.broadcast import broadcast_crm

User = get_user_model()


def _order_payload(request, order: Order) -> dict:
    return OrderSerializer(order, context={"request": request}).data


class OrderViewSet(viewsets.ModelViewSet):
    permission_classes = [OrderAccessPermission]
    pagination_class = OrderPagination
    filterset_class = OrderFilter
    search_fields = ("order_number", "device_type", "client__phone")
    ordering_fields = ("id", "received_date", "created_at", "updated_at", "order_number")
    ordering = ("-id",)

    def get_queryset(self):
        qs = Order.objects.select_related("client", "status", "assigned_master", "created_by", "print_order").all()
        user = self.request.user
        if getattr(user, "role", None) == User.Role.MASTER:
            qs = qs.filter(assigned_master_id=user.id)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return OrderCreateSerializer
        if self.action in ("update", "partial_update"):
            return OrderUpdateSerializer
        return OrderSerializer

    def perform_create(self, serializer):
        order = serializer.save()
        log_action(actor=self.request.user, action="order_created", obj=order)
        return order

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        data = OrderSerializer(order, context={"request": request}).data
        broadcast_crm("order_created", {"order": data, "actor_id": request.user.id})
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        if response.status_code == 200:
            order = self.get_object()
            broadcast_crm("order_updated", {"order": _order_payload(request, order), "actor_id": request.user.id})
        return response

    def partial_update(self, request, *args, **kwargs):
        response = super().partial_update(request, *args, **kwargs)
        if response.status_code == 200:
            order = self.get_object()
            broadcast_crm("order_updated", {"order": _order_payload(request, order), "actor_id": request.user.id})
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        oid = instance.pk
        client_id = getattr(instance, "client_id", None)
        response = super().destroy(request, *args, **kwargs)
        if response.status_code in (status.HTTP_204_NO_CONTENT, status.HTTP_200_OK):
            payload = {"order_id": oid, "actor_id": request.user.id}
            if client_id:
                payload["client_id"] = client_id
            broadcast_crm("order_deleted", payload)
        return response

    def perform_update(self, serializer):
        order = serializer.save()
        log_action(actor=self.request.user, action="order_updated", obj=order)

    @action(detail=False, methods=["get"], url_path="masters")
    def masters(self, request):
        """Список мастеров для назначения на заказ (админ и менеджер)."""
        if getattr(request.user, "role", None) not in (User.Role.ADMIN, User.Role.MANAGER):
            return Response({"detail": "Недостаточно прав"}, status=status.HTTP_403_FORBIDDEN)
        rows = User.objects.filter(role=User.Role.MASTER, is_active=True).order_by("name", "id")
        return Response(
            [{"id": u.id, "name": getattr(u, "name", "") or u.email, "email": u.email} for u in rows]
        )

    @action(detail=False, methods=["get"], url_path="status-options")
    def status_options(self, request):
        """
        Returns active statuses and enabled transitions for UI.
        """
        statuses = OrderStatus.objects.filter(is_active=True).order_by("sort_index", "id")
        transitions = (
            OrderStatusTransition.objects.filter(is_enabled=True)
            .select_related("from_status", "to_status")
            .all()
        )
        return Response(
            {
                "statuses": [
                    {
                        "id": s.id,
                        "code": s.code,
                        "name": s.name,
                        "sort_index": s.sort_index,
                        "is_final": s.is_final,
                    }
                    for s in statuses
                ],
                "transitions": [
                    {
                        "from": t.from_status.code,
                        "to": t.to_status.code,
                        "is_enabled": t.is_enabled,
                    }
                    for t in transitions
                ],
            }
        )

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        order = self.get_object()
        qs = OrderStatusHistory.objects.filter(order=order).select_related("status").order_by("-id")
        return Response({"results": OrderStatusHistorySerializer(qs, many=True).data})

    @action(detail=True, methods=["post"], url_path="change-status")
    @transaction.atomic
    def change_status(self, request, pk=None):
        order = self.get_object()
        serializer = OrderChangeStatusSerializer(
            data=request.data, context={"request": request, "order": order}
        )
        serializer.is_valid(raise_exception=True)
        to_status: OrderStatus = serializer.validated_data["to_status"]
        comment: str = serializer.validated_data.get("comment", "")

        if to_status.code == "ready":
            order.final_work_cost = serializer.validated_data["final_work_cost"]
            order.save(update_fields=["final_work_cost"])
            up_block = serializer.validated_data.get("used_products")
            if up_block is not None:
                if request.user.role == User.Role.MASTER and order.assigned_master_id != request.user.id:
                    return Response(
                        {"detail": "Мастер может списывать материалы только в назначенных ему заказах."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                try:
                    created = replace_order_used_products_items(
                        order=order, user=request.user, items=up_block["items"]
                    )
                except ValueError as e:
                    return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
                log_action(
                    actor=request.user,
                    action="order_used_products_updated",
                    obj=order,
                    meta={"items": [{"product_id": x.product_id, "qty": str(x.quantity)} for x in created]},
                )
            order.refresh_from_db()

        order.status = to_status
        update_fields = ["status", "updated_at"]
        if to_status.code == "ready" and not order.ready_at:
            order.ready_at = timezone.now()
            update_fields.append("ready_at")
        if to_status.code == "completed" and not order.completed_at:
            order.completed_at = timezone.now()
            update_fields.append("completed_at")
        order.save(update_fields=update_fields)
        OrderStatusHistory.objects.create(
            order=order, status=to_status, changed_by=request.user, comment=comment
        )

        if to_status.code == "ready":
            queue_order_ready(order=order)
        if to_status.code == "negotiation":
            queue_need_negotiation(order=order)

        log_action(
            actor=request.user,
            action="order_status_changed",
            obj=order,
            meta={"to_status": to_status.code},
        )
        order.refresh_from_db()
        data = OrderSerializer(order, context={"request": request}).data
        broadcast_crm("order_updated", {"order": data, "actor_id": request.user.id})
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "put"], url_path="used-products")
    def used_products(self, request, pk=None):
        order = self.get_object()
        if request.method == "GET":
            qs = OrderUsedProduct.objects.filter(order=order).select_related("product").order_by("product_id")
            return Response(
                {"results": OrderUsedProductSerializer(qs, many=True, context={"request": request}).data}
            )

        serializer = OrderUsedProductsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Only allow master to change used products for assigned order (checked in serializer/service).
        if request.user.role == "master" and order.assigned_master_id != request.user.id:
            return Response({"detail": "Мастер может списывать товары только в своих заказах."}, status=400)

        try:
            created = replace_order_used_products_items(
                order=order, user=request.user, items=serializer.validated_data["items"]
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)

        log_action(
            actor=request.user,
            action="order_used_products_updated",
            obj=order,
            meta={"items": [{"product_id": x.product_id, "qty": str(x.quantity)} for x in created]},
        )
        order.refresh_from_db()
        broadcast_crm("order_updated", {"order": _order_payload(request, order), "actor_id": request.user.id})
        return Response(
            {"results": OrderUsedProductSerializer(created, many=True, context={"request": request}).data}
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="upload-print-files",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_print_files(self, request, pk=None):
        order = self.get_object()
        if order.service_type != Order.ServiceType.PRINT:
            return Response({"detail": "Загрузка файлов доступна только для заказов печати."}, status=400)
        try:
            po = order.print_order
        except PrintOrder.DoesNotExist:
            return Response({"detail": "Нет записи печати по заказу."}, status=400)

        files = request.FILES.getlist("files")
        if not files:
            return Response({"detail": "Передайте файлы в поле files."}, status=400)

        media_root = Path(settings.MEDIA_ROOT)
        sub = f"print_orders/{order.pk}"
        dest_dir = media_root / sub
        dest_dir.mkdir(parents=True, exist_ok=True)

        paths = list(po.file_paths or [])
        base_url = settings.MEDIA_URL
        if not base_url.endswith("/"):
            base_url = base_url + "/"

        for f in files:
            safe_name = Path(f.name).name
            ext = Path(safe_name).suffix.lower()
            if ext not in settings.UPLOAD_ALLOWED_EXTENSIONS:
                return Response(
                    {"detail": f"Недопустимое расширение файла: {safe_name}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            content_type = (getattr(f, "content_type", "") or "").lower()
            if content_type not in settings.UPLOAD_ALLOWED_CONTENT_TYPES:
                return Response(
                    {"detail": f"Недопустимый MIME-тип файла: {safe_name}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if getattr(f, "size", 0) > settings.UPLOAD_MAX_FILE_SIZE_BYTES:
                return Response(
                    {"detail": f"Файл слишком большой: {safe_name}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Keep only random name + extension to avoid user-controlled names in storage.
            stored = f"{uuid.uuid4().hex}{ext}"
            full = dest_dir / stored
            with full.open("wb") as out:
                for chunk in f.chunks():
                    out.write(chunk)
            paths.append(f"{base_url}{sub}/{stored}")

        po.file_paths = paths
        po.save(update_fields=["file_paths"])
        order.refresh_from_db()
        broadcast_crm("order_updated", {"order": _order_payload(request, order), "actor_id": request.user.id})
        return Response({"file_paths": po.file_paths, "print": PrintOrderSerializer(po).data})

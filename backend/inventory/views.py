from django.db.models import F
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from users.models import User

from inventory.models import InventoryCategory, OrderUsedProduct, Product, StockMovement
from inventory.permissions import InventoryAccessPermission
from inventory.serializers import (
    InventoryCategorySerializer,
    ProductSerializer,
    StockInSerializer,
    StockMovementSerializer,
    StockOutSerializer,
)
from inventory.excel_import import apply_parsed_rows_to_db, parse_uploaded_inventory_excel
from inventory.services import stock_in, stock_out
from realtime.broadcast import broadcast_crm


class InventoryCategoryViewSet(viewsets.ModelViewSet):
    queryset = InventoryCategory.objects.all().order_by("id")
    serializer_class = InventoryCategorySerializer
    permission_classes = [InventoryAccessPermission]

    def perform_destroy(self, instance: InventoryCategory) -> None:
        if instance.products.exists():
            raise ValidationError({"detail": "Нельзя удалить категорию, пока к ней привязаны товары."})
        super().perform_destroy(instance)


class MovementPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").all().order_by("id")
    serializer_class = ProductSerializer
    permission_classes = [InventoryAccessPermission]
    search_fields = ("name", "sku")
    ordering_fields = ("id", "name", "sku", "category", "current_stock", "min_stock", "updated_at")
    ordering = ("name",)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        p = serializer.instance
        broadcast_crm(
            "product_created",
            {"product": ProductSerializer(p, context={"request": self.request}).data, "actor_id": self.request.user.id},
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        p = serializer.instance
        broadcast_crm(
            "product_updated",
            {
                "product": ProductSerializer(p, context={"request": self.request}).data,
                "product_id": p.pk,
                "actor_id": self.request.user.id,
            },
        )

    def perform_destroy(self, instance):
        pid = instance.pk
        super().perform_destroy(instance)
        broadcast_crm("product_deleted", {"product_id": pid, "actor_id": self.request.user.id})

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "role", None) == User.Role.MASTER:
            qs = qs.filter(used_in_orders__order__assigned_master_id=user.id).distinct()

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)

        low = self.request.query_params.get("low_stock_only")
        if low in ("1", "true", "True", "yes"):
            qs = qs.filter(current_stock__lt=F("min_stock"))

        return qs

    @action(detail=False, methods=["get"], url_path="stock-report")
    def stock_report(self, request):
        qs = self.filter_queryset(self.get_queryset())
        data = ProductSerializer(qs, many=True).data
        return Response({"results": data})

    @action(detail=True, methods=["get"], url_path="movements")
    def movements(self, request, pk=None):
        product = self.get_object()
        qs = (
            StockMovement.objects.filter(product=product)
            .select_related("product", "order", "created_by")
            .order_by("-created_at", "-id")
        )
        mv_type = request.query_params.get("type")
        if mv_type in ("in", "out"):
            qs = qs.filter(type=mv_type)

        date_from = request.query_params.get("date_from")
        if date_from:
            dt = parse_datetime(date_from)
            if dt:
                qs = qs.filter(created_at__gte=dt)
        date_to = request.query_params.get("date_to")
        if date_to:
            dt = parse_datetime(date_to)
            if dt:
                qs = qs.filter(created_at__lte=dt)

        paginator = MovementPagination()
        page = paginator.paginate_queryset(qs, request)
        if page is not None:
            ser = StockMovementSerializer(page, many=True)
            return paginator.get_paginated_response(ser.data)
        return Response({"results": StockMovementSerializer(qs, many=True).data})

    @action(detail=True, methods=["get"], url_path="used-in-orders")
    def used_in_orders(self, request, pk=None):
        product = self.get_object()
        rows = OrderUsedProduct.objects.filter(product=product).select_related("order")
        data = [
            {
                "order_id": r.order_id,
                "order_number": r.order.order_number,
                "quantity": str(r.quantity),
            }
            for r in rows
        ]
        return Response({"results": data})

    @action(detail=False, methods=["post"], url_path="import-excel")
    def import_excel(self, request):
        """
        Импорт накладной: multipart/form-data, поле `file` (.xlsx / .xls).
        Опционально `category_id` — категория для новых товаров (иначе «Импорт Excel»).
        """
        if "file" not in request.FILES:
            return Response({"detail": "Передайте файл в поле file."}, status=status.HTTP_400_BAD_REQUEST)
        upload = request.FILES["file"]
        parsed, parse_errors = parse_uploaded_inventory_excel(upload, upload.name)
        if not parsed:
            msg = "; ".join(parse_errors) if parse_errors else "Нет строк для импорта."
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        raw_cat = request.data.get("category_id")
        if raw_cat not in (None, "", "null"):
            try:
                default_category = InventoryCategory.objects.get(pk=int(raw_cat))
            except (ValueError, InventoryCategory.DoesNotExist):
                return Response({"detail": "Указана несуществующая категория."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            default_category, _ = InventoryCategory.objects.get_or_create(name="Импорт Excel")

        result = apply_parsed_rows_to_db(parsed, default_category=default_category, user=request.user)
        created_set = set(result.created_product_ids)
        for pid in result.product_ids_touched:
            p = Product.objects.select_related("category").get(pk=pid)
            if pid in created_set:
                broadcast_crm(
                    "product_created",
                    {
                        "product": ProductSerializer(p, context={"request": request}).data,
                        "actor_id": request.user.id,
                    },
                )
            broadcast_crm(
                "stock_movement",
                {
                    "product_id": p.id,
                    "new_stock": str(p.current_stock),
                    "product": ProductSerializer(p, context={"request": request}).data,
                    "actor_id": request.user.id,
                },
            )

        return Response(
            {
                "created": result.created_count,
                "stock_movements": result.stock_in_count,
                "skipped": result.skipped_rows,
                "parse_warnings": parse_errors,
                "row_errors": result.row_errors,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="bulk-update-min-stock")
    def bulk_update_min_stock(self, request):
        """
        Body: {"items":[{"product": <id>, "min_stock": "2.000"}, ...]}
        """
        items = request.data.get("items", [])
        if not isinstance(items, list):
            return Response({"detail": "items must be a list"}, status=400)
        updated = 0
        for it in items:
            pid = it.get("product")
            min_stock = it.get("min_stock")
            if not pid:
                continue
            try:
                p = Product.objects.get(pk=pid)
                p.min_stock = min_stock
                p.save(update_fields=["min_stock", "updated_at"])
                updated += 1
            except Exception:
                continue
        return Response({"updated": updated})


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related("product", "order", "created_by").all().order_by("-id")
    serializer_class = StockMovementSerializer
    permission_classes = [InventoryAccessPermission]

    @action(detail=False, methods=["post"], url_path="in")
    def stock_in(self, request):
        serializer = StockInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mv = stock_in(
            product=serializer.validated_data["product"],
            quantity=serializer.validated_data["quantity"],
            created_by=request.user,
            comment=serializer.validated_data.get("comment", ""),
        )
        mv = StockMovement.objects.select_related("product", "order", "created_by").get(pk=mv.pk)
        p = mv.product
        p.refresh_from_db()
        broadcast_crm(
            "stock_movement",
            {
                "product_id": p.id,
                "new_stock": str(p.current_stock),
                "product": ProductSerializer(p, context={"request": request}).data,
                "actor_id": request.user.id,
            },
        )
        return Response(StockMovementSerializer(mv).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="out")
    def stock_out(self, request):
        serializer = StockOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason_code = serializer.validated_data.get("reason_code", "other")
        label = StockOutSerializer.REASON_LABELS.get(reason_code, "Другое")
        comment = serializer.validated_data.get("comment", "") or ""
        if reason_code == "other":
            full_comment = comment
        else:
            full_comment = f"{label}: {comment}".strip() if comment else label
        try:
            mv = stock_out(
                product=serializer.validated_data["product"],
                quantity=serializer.validated_data["quantity"],
                created_by=request.user,
                reason="write_off",
                comment=full_comment,
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        mv = StockMovement.objects.select_related("product", "order", "created_by").get(pk=mv.pk)
        p = mv.product
        p.refresh_from_db()
        broadcast_crm(
            "stock_movement",
            {
                "product_id": p.id,
                "new_stock": str(p.current_stock),
                "product": ProductSerializer(p, context={"request": request}).data,
                "actor_id": request.user.id,
            },
        )
        return Response(StockMovementSerializer(mv).data, status=status.HTTP_201_CREATED)

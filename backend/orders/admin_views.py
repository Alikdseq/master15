from __future__ import annotations

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.services import log_action
from orders.models import OrderStatus, OrderStatusTransition
from reports.permissions import IsAdmin


class OrderStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatus
        fields = (
            "id",
            "code",
            "name",
            "sort_index",
            "color",
            "visible_to_client",
            "is_final",
            "is_active",
        )


class OrderStatusTransitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusTransition
        fields = ("id", "from_status", "to_status", "is_enabled")


def _validate_status_graph() -> list[str]:
    errors: list[str] = []
    finals = OrderStatus.objects.filter(is_final=True, is_active=True).count()
    if finals != 1:
        errors.append("Должен быть ровно один финальный активный статус.")

    final_status = OrderStatus.objects.filter(is_final=True, is_active=True).first()
    if final_status:
        if OrderStatusTransition.objects.filter(from_status=final_status, is_enabled=True).exists():
            errors.append("Из финального статуса не должно быть разрешённых переходов.")
    return errors


class OrderStatusAdminViewSet(viewsets.ModelViewSet):
    queryset = OrderStatus.objects.all().order_by("sort_index", "id")
    serializer_class = OrderStatusSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        obj = serializer.save()
        log_action(actor=self.request.user, action="order_status_created", obj=obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_action(actor=self.request.user, action="order_status_updated", obj=obj)

    def perform_destroy(self, instance):
        log_action(actor=self.request.user, action="order_status_deleted", obj=instance)
        instance.delete()

    @action(detail=False, methods=["post"], url_path="validate")
    def validate_graph(self, request):
        errors = _validate_status_graph()
        if errors:
            return Response({"valid": False, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"valid": True, "errors": []})


class OrderStatusTransitionAdminViewSet(viewsets.ModelViewSet):
    queryset = OrderStatusTransition.objects.select_related("from_status", "to_status").all().order_by("id")
    serializer_class = OrderStatusTransitionSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        obj = serializer.save()
        log_action(actor=self.request.user, action="order_status_transition_created", obj=obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_action(actor=self.request.user, action="order_status_transition_updated", obj=obj)

    def perform_destroy(self, instance):
        log_action(actor=self.request.user, action="order_status_transition_deleted", obj=instance)
        instance.delete()


from django.db import transaction
from rest_framework import serializers

from inventory.serializers import OrderUsedProductsUpdateSerializer
from orders.finance import recalculate_order_finances
from orders.models import Order, OrderStatus, OrderStatusHistory, OrderStatusTransition, PrintOrder
from orders.services import generate_order_number
from notifications.services import queue_new_order_to_staff, queue_order_accepted


class ClientMiniSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField()


class UserMiniSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(allow_blank=True, required=False)
    email = serializers.EmailField()


class OrderStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatus
        fields = ("id", "code", "name", "sort_index", "is_final", "is_active")


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    status = OrderStatusSerializer()

    class Meta:
        model = OrderStatusHistory
        fields = ("id", "status", "changed_by", "comment", "changed_at")


class PrintOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintOrder
        fields = ("document_type", "page_count", "color_mode", "urgent", "special_requests", "file_paths")


class OrderSerializer(serializers.ModelSerializer):
    status = OrderStatusSerializer(read_only=True)
    client = serializers.SerializerMethodField()
    assigned_master = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    print = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            "id",
            "order_number",
            "service_type",
            "client",
            "device_type",
            "device_model",
            "serial_number",
            "issue_description",
            "accessories",
            "received_date",
            "desired_completion_date",
            "preliminary_cost",
            "final_cost",
            "final_work_cost",
            "final_materials_cost",
            "total_amount",
            "materials_cost_price",
            "profit",
            "other_costs",
            "status",
            "assigned_master",
            "created_by",
            "refusal_mark",
            "created_at",
            "updated_at",
            "print",
        )
        read_only_fields = (
            "id",
            "order_number",
            "created_by",
            "created_at",
            "updated_at",
            "status",
            "final_cost",
            "final_materials_cost",
            "total_amount",
            "materials_cost_price",
            "profit",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        role = getattr(request.user, "role", None) if request and request.user.is_authenticated else None
        if role != "admin":
            data["materials_cost_price"] = None
            data["profit"] = None
            data["other_costs"] = None
        return data

    def get_client(self, obj: Order):
        if not getattr(obj, "client_id", None):
            return None
        c = obj.client
        return {"id": c.id, "name": c.name, "phone": c.phone}

    def get_assigned_master(self, obj: Order):
        if not getattr(obj, "assigned_master_id", None):
            return None
        u = obj.assigned_master
        return {"id": u.id, "name": getattr(u, "name", "") or "", "email": u.email}

    def get_created_by(self, obj: Order):
        if not getattr(obj, "created_by_id", None):
            return None
        u = obj.created_by
        return {"id": u.id, "name": getattr(u, "name", "") or "", "email": u.email}

    def get_print(self, obj: Order):
        if obj.service_type != Order.ServiceType.PRINT:
            return None
        try:
            po = obj.print_order
        except PrintOrder.DoesNotExist:
            return None
        return PrintOrderSerializer(po).data


def _build_print_issue_description(print_data: dict) -> str:
    lines = [
        f"Тип документа: {print_data['document_type']}",
        f"Количество страниц/копий: {print_data['page_count']}",
        "Цветность: цветная" if print_data["color_mode"] == "color" else "Цветность: ч/б",
    ]
    if print_data.get("urgent"):
        lines.append("Срочность: да")
    if print_data.get("special_requests"):
        lines.append(f"Особые пожелания: {print_data['special_requests']}")
    return "\n".join(lines)


class PrintOrderWriteSerializer(serializers.Serializer):
    document_type = serializers.CharField(max_length=50)
    page_count = serializers.IntegerField(min_value=1)
    color_mode = serializers.ChoiceField(choices=["bw", "color"])
    urgent = serializers.BooleanField(required=False, default=False)
    special_requests = serializers.CharField(allow_blank=True, required=False, default="")
    file_paths = serializers.ListField(child=serializers.CharField(max_length=512), required=False, default=list)


class OrderCreateSerializer(serializers.ModelSerializer):
    print = PrintOrderWriteSerializer(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "client",
            "service_type",
            "device_type",
            "device_model",
            "serial_number",
            "issue_description",
            "accessories",
            "received_date",
            "desired_completion_date",
            "preliminary_cost",
            "assigned_master",
            "print",
        )
        extra_kwargs = {
            "issue_description": {"required": False, "allow_blank": True},
            "device_type": {"required": False, "allow_blank": True},
        }

    def validate_accessories(self, value):
        if value is None:
            return {}
        if not isinstance(value, (dict, list)):
            raise serializers.ValidationError("accessories must be a JSON object/array")
        return value

    def validate(self, attrs):
        received_date = attrs.get("received_date")
        desired_completion_date = attrs.get("desired_completion_date")
        preliminary_cost = attrs.get("preliminary_cost")

        if (
            received_date
            and desired_completion_date
            and desired_completion_date < received_date
        ):
            raise serializers.ValidationError(
                {"desired_completion_date": "Желаемая дата готовности не может быть раньше даты приёма."}
            )

        if preliminary_cost is not None and preliminary_cost < 0:
            raise serializers.ValidationError(
                {"preliminary_cost": "Стоимость не может быть отрицательной."}
            )
        st = attrs.get("service_type", Order.ServiceType.REPAIR)
        print_payload = attrs.get("print")
        if st == Order.ServiceType.PRINT:
            if not print_payload:
                raise serializers.ValidationError(
                    {"print": "Для печати передайте данные в поле print."}
                )
            attrs["device_type"] = "Печать"
            attrs["issue_description"] = _build_print_issue_description(print_payload)
            attrs.setdefault("device_model", "")
            attrs.setdefault("serial_number", "")
            if attrs.get("accessories") is None:
                attrs["accessories"] = {}
        else:
            if print_payload is not None:
                raise serializers.ValidationError(
                    {"print": "Поле print допустимо только для service_type=print."}
                )
            if not (attrs.get("device_type") or "").strip():
                raise serializers.ValidationError(
                    {"device_type": "Укажите тип устройства"}
                )
            if not (attrs.get("issue_description") or "").strip():
                raise serializers.ValidationError(
                    {"issue_description": "Опишите неисправность"}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        default_status = OrderStatus.objects.filter(code="accepted").first()
        if not default_status:
            raise serializers.ValidationError("Default status 'accepted' is not configured")

        print_payload = validated_data.pop("print", None)
        service_type = validated_data.get("service_type", Order.ServiceType.REPAIR)

        received_date = validated_data.get("received_date")
        order_number = generate_order_number(received_date=received_date)

        order = Order.objects.create(
            order_number=order_number,
            status=default_status,
            created_by=request.user,
            **validated_data,
        )
        if service_type == Order.ServiceType.PRINT and print_payload:
            PrintOrder.objects.create(
                order=order,
                document_type=print_payload["document_type"],
                page_count=print_payload["page_count"],
                color_mode=print_payload["color_mode"],
                urgent=print_payload.get("urgent") or False,
                special_requests=print_payload.get("special_requests") or "",
                file_paths=list(print_payload.get("file_paths") or []),
            )
        OrderStatusHistory.objects.create(
            order=order, status=default_status, changed_by=request.user, comment="Создан заказ"
        )
        # Notifications: order accepted (client) + new order to staff
        queue_order_accepted(order=order)
        queue_new_order_to_staff(order=order)
        return order


class OrderUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = (
            "client",
            "device_type",
            "device_model",
            "serial_number",
            "issue_description",
            "accessories",
            "received_date",
            "desired_completion_date",
            "preliminary_cost",
            "final_cost",
            "final_work_cost",
            "other_costs",
            "assigned_master",
            "refusal_mark",
        )

    def validate(self, attrs):
        order: Order = self.instance
        if order.is_completed:
            raise serializers.ValidationError("Нельзя изменять заказ в финальном статусе.")

        request = self.context.get("request")
        role = getattr(request.user, "role", None) if request else None
        if attrs.get("other_costs") is not None and role != "admin":
            raise serializers.ValidationError({"other_costs": "Только администратор может задавать доп. расходы."})

        received_date = attrs.get("received_date", order.received_date)
        desired_completion_date = attrs.get(
            "desired_completion_date", order.desired_completion_date
        )
        preliminary_cost = attrs.get("preliminary_cost", order.preliminary_cost)
        final_cost = attrs.get("final_cost", order.final_cost)

        if (
            received_date
            and desired_completion_date
            and desired_completion_date < received_date
        ):
            raise serializers.ValidationError(
                {"desired_completion_date": "Желаемая дата готовности не может быть раньше даты приёма."}
            )
        if preliminary_cost is not None and preliminary_cost < 0:
            raise serializers.ValidationError(
                {"preliminary_cost": "Стоимость не может быть отрицательной."}
            )
        if final_cost is not None and final_cost < 0:
            raise serializers.ValidationError(
                {"final_cost": "Стоимость не может быть отрицательной."}
            )
        if attrs.get("final_work_cost") is not None and attrs["final_work_cost"] < 0:
            raise serializers.ValidationError(
                {"final_work_cost": "Стоимость работ не может быть отрицательной."}
            )
        oc = attrs.get("other_costs", order.other_costs)
        if oc is not None and oc < 0:
            raise serializers.ValidationError({"other_costs": "Не может быть отрицательной."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        order = super().update(instance, validated_data)
        if not any(
            k in validated_data for k in ("final_work_cost", "other_costs", "final_cost")
        ):
            return order
        if validated_data.get("final_cost") is not None and validated_data.get("final_work_cost") is None:
            order.refresh_from_db(fields=["final_materials_cost"])
            mats = order.final_materials_cost or 0
            fc = validated_data["final_cost"]
            order.final_work_cost = fc - mats
            if order.final_work_cost < 0:
                order.final_work_cost = 0
            order.save(update_fields=["final_work_cost"])
        recalculate_order_finances(order, save=True)
        return order


class OrderChangeStatusSerializer(serializers.Serializer):
    to_status = serializers.SlugField()
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    final_work_cost = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    used_products = OrderUsedProductsUpdateSerializer(required=False)

    def validate_to_status(self, value):
        status = OrderStatus.objects.filter(code=value, is_active=True).first()
        if not status:
            raise serializers.ValidationError("Unknown status")
        return status

    def validate(self, attrs):
        order: Order = self.context["order"]
        user = self.context["request"].user
        to_status: OrderStatus = attrs["to_status"]

        if order.is_completed:
            raise serializers.ValidationError("Заказ в финальном статусе и не может быть изменён.")

        if to_status.code == "ready":
            if attrs.get("final_work_cost") is None:
                raise serializers.ValidationError(
                    {"final_work_cost": "Для статуса «Готов» укажите окончательную стоимость работ (без материалов)."}
                )
            if attrs["final_work_cost"] < 0:
                raise serializers.ValidationError(
                    {"final_work_cost": "Стоимость работ не может быть отрицательной."}
                )
            if attrs.get("used_products") is None:
                raise serializers.ValidationError(
                    {
                        "used_products": "Передайте список материалов: заполните позиции или укажите пустой список, если материалы не использовались."
                    }
                )
        else:
            if attrs.get("final_work_cost") is not None:
                raise serializers.ValidationError(
                    {"final_work_cost": "Стоимость работ для «Готов» можно передать только при переводе в этот статус."}
                )
            if attrs.get("used_products") is not None:
                raise serializers.ValidationError(
                    {"used_products": "Список материалов можно передать только при переводе в статус «Готов»."}
                )

        # Admin can override transitions (поля «Готов» проверены выше).
        if getattr(user, "role", None) == "admin":
            return attrs

        # Non-admin: check transition table
        allowed = OrderStatusTransition.objects.filter(
            from_status=order.status, to_status=to_status, is_enabled=True
        ).exists()
        if not allowed:
            raise serializers.ValidationError("Недопустимый переход статуса.")

        # Master can change only assigned orders
        if getattr(user, "role", None) == "master" and order.assigned_master_id != user.id:
            raise serializers.ValidationError("Мастер может менять статус только назначенных ему заказов.")

        # Manager cannot close order; closing is done by master/admin.
        if getattr(user, "role", None) == "manager" and to_status.code == "completed":
            raise serializers.ValidationError("Менеджер не может переводить заказ в статус 'Выдан'.")

        return attrs


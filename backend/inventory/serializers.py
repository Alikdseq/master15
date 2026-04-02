from decimal import Decimal

from rest_framework import serializers

from inventory.models import InventoryCategory, OrderUsedProduct, Product, StockMovement


class InventoryCategorySerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = InventoryCategory
        fields = ("id", "name", "parent", "product_count")

    def get_product_count(self, obj: InventoryCategory) -> int:
        return obj.products.count()


class ProductSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "category",
            "category_name",
            "sku",
            "unit",
            "purchase_price",
            "selling_price",
            "min_stock",
            "current_stock",
            "is_low_stock",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "current_stock", "created_at", "updated_at", "is_low_stock", "category_name")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Артикул не меняется после создания (см. ТЗ склада).
        if self.instance is not None:
            self.fields["sku"].read_only = True

    def get_is_low_stock(self, obj: Product) -> bool:
        try:
            # "Ниже минимума" => строго < min_stock
            return obj.current_stock < obj.min_stock
        except Exception:
            return False


class StockInSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class StockOutSerializer(serializers.Serializer):
    REASON_LABELS = {
        "damage": "Порча",
        "loss": "Утеря",
        "inventory": "Инвентаризация",
        "other": "Другое",
    }

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    reason_code = serializers.ChoiceField(
        choices=["damage", "loss", "inventory", "other"],
        default="other",
    )


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    order_number = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = (
            "id",
            "product",
            "product_name",
            "product_sku",
            "type",
            "quantity",
            "reason",
            "comment",
            "order",
            "order_number",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = fields

    def get_order_number(self, obj: StockMovement) -> str | None:
        if obj.order_id and obj.order:
            return obj.order.order_number
        return None

    def get_created_by_name(self, obj: StockMovement) -> str | None:
        if obj.created_by_id and obj.created_by:
            return obj.created_by.name
        return None


class OrderUsedProductItemSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))


class OrderUsedProductsUpdateSerializer(serializers.Serializer):
    items = OrderUsedProductItemSerializer(many=True)


class OrderUsedProductSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    line_selling_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderUsedProduct
        fields = (
            "order",
            "product",
            "product_name",
            "product_sku",
            "quantity",
            "selling_price_at_moment",
            "purchase_price_at_moment",
            "line_selling_total",
        )
        read_only_fields = ("order",)

    def get_line_selling_total(self, obj: OrderUsedProduct):
        sp = obj.selling_price_at_moment
        if sp is None:
            sp = obj.product.selling_price
        sp = sp or Decimal("0")
        return obj.quantity * sp

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if request and getattr(request.user, "role", None) != "admin":
            data["purchase_price_at_moment"] = None
        return data


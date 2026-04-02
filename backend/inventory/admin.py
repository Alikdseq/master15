from django.contrib import admin

from inventory.models import InventoryCategory, OrderUsedProduct, Product, StockMovement


@admin.register(InventoryCategory)
class InventoryCategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "parent")
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "sku", "unit", "current_stock", "min_stock", "category")
    search_fields = ("name", "sku")
    list_filter = ("category",)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("id", "product", "type", "quantity", "reason", "order", "created_by", "created_at")
    list_filter = ("type", "reason")
    search_fields = ("product__name", "product__sku")


@admin.register(OrderUsedProduct)
class OrderUsedProductAdmin(admin.ModelAdmin):
    list_display = ("order", "product", "quantity")

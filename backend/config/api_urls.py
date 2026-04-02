from django.urls import include, path
from rest_framework.routers import DefaultRouter

from users.auth_views import MasterPrintTokenObtainPairView, MasterPrintTokenRefreshView, LogoutView
from users.views import me
from users.views import UserViewSet
from clients.views import ClientViewSet
from orders.views import OrderViewSet
from orders.admin_views import OrderStatusAdminViewSet, OrderStatusTransitionAdminViewSet
from inventory.views import InventoryCategoryViewSet, ProductViewSet, StockMovementViewSet
from notifications.views import NotificationViewSet
from system_settings.views import SystemSettingViewSet
from audit.views import AuditLogViewSet
from backups.views import BackupViewSet

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="users")
router.register(r"clients", ClientViewSet, basename="clients")
router.register(r"orders", OrderViewSet, basename="orders")
router.register(r"admin/order-statuses", OrderStatusAdminViewSet, basename="admin-order-statuses")
router.register(r"admin/order-status-transitions", OrderStatusTransitionAdminViewSet, basename="admin-order-status-transitions")
router.register(r"inventory/categories", InventoryCategoryViewSet, basename="inventory-categories")
router.register(r"inventory/products", ProductViewSet, basename="inventory-products")
router.register(r"inventory/movements", StockMovementViewSet, basename="inventory-movements")
router.register(r"notifications", NotificationViewSet, basename="notifications")
router.register(r"admin/settings", SystemSettingViewSet, basename="admin-settings")
router.register(r"admin/audit-logs", AuditLogViewSet, basename="admin-audit-logs")
router.register(r"admin/backups", BackupViewSet, basename="admin-backups")

urlpatterns = [
    path("auth/token/", MasterPrintTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", MasterPrintTokenRefreshView.as_view(), name="token_refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth_logout"),
    path("auth/me/", me, name="auth_me"),
    path("reports/", include("reports.urls")),
    path("", include(router.urls)),
]


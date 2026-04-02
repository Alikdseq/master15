from django.contrib.auth import get_user_model
from rest_framework.permissions import BasePermission, SAFE_METHODS


User = get_user_model()


class OrderAccessPermission(BasePermission):
    """
    Admin/Manager: full access.
    Master: read-only (status change is handled by a custom action).
    """

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if user.role in (User.Role.ADMIN, User.Role.MANAGER):
            return True
        if user.role == User.Role.MASTER:
            if request.method in SAFE_METHODS:
                return True
            # Allow master to change status via dedicated action.
            if getattr(view, "action", "") == "change_status" and request.method == "POST":
                return True
            # Allow master to manage used products for assigned orders.
            if getattr(view, "action", "") in ("used_products",) and request.method in ("GET", "PUT"):
                return True
            return False
        return False


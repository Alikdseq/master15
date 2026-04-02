from django.contrib.auth import get_user_model
from rest_framework.permissions import BasePermission, SAFE_METHODS


User = get_user_model()


class InventoryAccessPermission(BasePermission):
    """
    Admin/Manager: full access.
    Master: read-only.
    """

    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if user.role in (User.Role.ADMIN, User.Role.MANAGER):
            return True
        if user.role == User.Role.MASTER:
            return request.method in SAFE_METHODS
        return False


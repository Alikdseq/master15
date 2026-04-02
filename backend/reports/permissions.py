from django.contrib.auth import get_user_model
from rest_framework.permissions import BasePermission


User = get_user_model()


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and user.role == User.Role.ADMIN)


class IsAdminOrManager(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and user.role in (User.Role.ADMIN, User.Role.MANAGER)
        )


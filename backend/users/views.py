import secrets
import string

from django.contrib.auth import get_user_model
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from audit.models import AuditLog
from audit.services import log_action
from users.permissions import IsAdmin
from users.serializers import (
    PasswordResetSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated


User = get_user_model()


class UserPagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 100


def _generate_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    permission_classes = [IsAdmin]
    pagination_class = UserPagination
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["role"]
    search_fields = ["email", "name"]
    ordering_fields = ["id", "email", "name", "last_login", "created_at", "role"]
    ordering = ["id"]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("update", "partial_update"):
            return UserUpdateSerializer
        if self.action == "reset_password":
            return PasswordResetSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        log_action(actor=self.request.user, action="user_created", obj=user)

    def perform_update(self, serializer):
        user = serializer.save()
        log_action(actor=self.request.user, action="user_updated", obj=user)

    def perform_destroy(self, instance):
        log_action(actor=self.request.user, action="user_deleted", obj=instance)
        instance.delete()

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        user = self.get_object()
        temp_password = _generate_temporary_password()
        user.set_password(temp_password)
        user.save(update_fields=["password"])
        log_action(actor=request.user, action="user_password_reset", obj=user)
        return Response({"temporary_password": temp_password}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({"id": u.id, "email": u.email, "name": u.name, "role": u.role})

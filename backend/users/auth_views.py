from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.throttling import ScopedRateThrottle


class MasterPrintTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = getattr(user, "role", None)
        token["email"] = getattr(user, "email", None)
        token["user_id"] = getattr(user, "id", None)
        return token


class MasterPrintTokenObtainPairView(TokenObtainPairView):
    serializer_class = MasterPrintTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code != status.HTTP_200_OK:
            return response
        access = response.data.get("access")
        refresh = response.data.get("refresh")
        if access:
            _set_access_cookie(response, access)
        if refresh:
            _set_refresh_cookie(response, refresh)
        return response


class MasterPrintTokenRefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        data = dict(request.data) if isinstance(request.data, dict) else {}
        if not data.get("refresh"):
            cookie_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
            if cookie_refresh:
                data["refresh"] = cookie_refresh

        serializer = TokenRefreshSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        response = Response(validated, status=status.HTTP_200_OK)
        access = validated.get("access")
        refresh = validated.get("refresh")
        if access:
            _set_access_cookie(response, access)
        if refresh:
            _set_refresh_cookie(response, refresh)
        return response


class LogoutView(APIView):
    def post(self, request, *args, **kwargs):
        response = Response({"detail": "Logged out"}, status=status.HTTP_200_OK)
        response.delete_cookie(
            settings.JWT_ACCESS_COOKIE_NAME,
            path=settings.JWT_COOKIE_PATH,
            domain=settings.JWT_COOKIE_DOMAIN,
            samesite=settings.JWT_COOKIE_SAMESITE,
        )
        response.delete_cookie(
            settings.JWT_REFRESH_COOKIE_NAME,
            path=settings.JWT_COOKIE_PATH,
            domain=settings.JWT_COOKIE_DOMAIN,
            samesite=settings.JWT_COOKIE_SAMESITE,
        )
        return response


def _set_access_cookie(response, token: str) -> None:
    response.set_cookie(
        settings.JWT_ACCESS_COOKIE_NAME,
        token,
        max_age=settings.JWT_ACCESS_COOKIE_AGE_SECONDS,
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        path=settings.JWT_COOKIE_PATH,
        domain=settings.JWT_COOKIE_DOMAIN,
    )


def _set_refresh_cookie(response, token: str) -> None:
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE_NAME,
        token,
        max_age=settings.JWT_REFRESH_COOKIE_AGE_SECONDS,
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        path=settings.JWT_COOKIE_PATH,
        domain=settings.JWT_COOKIE_DOMAIN,
    )


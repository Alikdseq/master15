from __future__ import annotations

from rest_framework import serializers, status, viewsets
from rest_framework.response import Response

from audit.services import log_action
from reports.permissions import IsAdmin
from system_settings.models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ("key", "value")


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all().order_by("key")
    serializer_class = SystemSettingSerializer
    permission_classes = [IsAdmin]
    lookup_field = "key"

    def create(self, request, *args, **kwargs):
        # Upsert by key
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj, _ = SystemSetting.objects.update_or_create(
            key=serializer.validated_data["key"], defaults={"value": serializer.validated_data["value"]}
        )
        log_action(actor=request.user, action="system_setting_upsert", obj=obj)
        return Response(SystemSettingSerializer(obj).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_action(actor=self.request.user, action="system_setting_updated", obj=obj)

    def perform_destroy(self, instance):
        log_action(actor=self.request.user, action="system_setting_deleted", obj=instance)
        instance.delete()

from django.shortcuts import render

# Create your views here.

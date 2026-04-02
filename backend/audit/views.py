from __future__ import annotations

import json
from io import BytesIO

from django.http import FileResponse
from openpyxl import Workbook
from rest_framework import serializers, viewsets
from rest_framework.decorators import action

from audit.models import AuditLog
from reports.permissions import IsAdmin


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    actor_name = serializers.CharField(source="actor.name", read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "created_at",
            "action",
            "object_type",
            "object_id",
            "meta",
            "actor",
            "actor_email",
            "actor_name",
        )
        read_only_fields = fields


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor").all().order_by("-id")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        q_action = self.request.query_params.get("action")
        q_actor = self.request.query_params.get("actor")
        q_object_type = self.request.query_params.get("object_type") or self.request.query_params.get("type")
        date_from = self.request.query_params.get("from")
        date_to = self.request.query_params.get("to")
        search = self.request.query_params.get("search")

        if search:
            qs = qs.filter(action__icontains=search)

        if q_action:
            qs = qs.filter(action=q_action)
        if q_actor:
            qs = qs.filter(actor_id=q_actor)
        if q_object_type:
            qs = qs.filter(object_type=q_object_type)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        qs = self.get_queryset()[:5000]
        wb = Workbook()
        ws = wb.active
        ws.title = "audit"
        ws.append(
            ["id", "created_at", "action", "object_type", "object_id", "actor_id", "actor_email", "actor_name", "meta"]
        )
        for row in qs:
            meta = row.meta
            meta_str = json.dumps(meta, ensure_ascii=False) if meta is not None else ""
            ws.append(
                [
                    row.id,
                    row.created_at.isoformat() if row.created_at else "",
                    row.action,
                    row.object_type,
                    row.object_id,
                    row.actor_id,
                    getattr(row.actor, "email", "") if row.actor_id else "",
                    getattr(row.actor, "name", "") if row.actor_id else "",
                    meta_str,
                ]
            )
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return FileResponse(
            buf,
            as_attachment=True,
            filename="audit_logs.xlsx",
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

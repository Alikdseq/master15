from __future__ import annotations

from typing import Any

from django.contrib.contenttypes.models import ContentType

from audit.models import AuditLog


def log_action(
    *,
    actor,
    action: str,
    obj=None,
    meta: dict[str, Any] | None = None,
) -> AuditLog:
    object_type = ""
    object_id = ""
    if obj is not None:
        ct = ContentType.objects.get_for_model(obj.__class__)
        object_type = f"{ct.app_label}.{ct.model}"
        object_id = str(getattr(obj, "pk", "") or "")

    return AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        object_type=object_type,
        object_id=object_id,
        meta=meta or {},
    )


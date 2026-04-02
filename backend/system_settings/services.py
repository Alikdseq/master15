from __future__ import annotations

from typing import Any

from system_settings.models import SystemSetting


def get_setting(key: str, default: Any = None) -> Any:
    obj = SystemSetting.objects.filter(key=key).first()
    if not obj:
        return default
    return obj.value


def set_setting(key: str, value: Any) -> SystemSetting:
    obj, _ = SystemSetting.objects.update_or_create(key=key, defaults={"value": value})
    return obj


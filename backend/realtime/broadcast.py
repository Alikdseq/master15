"""
Синхронная отправка событий в группу WebSocket-подписчиков.
Безопасно вызывать из view / signal в том же процессе, что и ASGI (InMemory) или Redis.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

CRM_GROUP = "crm_staff"


def broadcast_crm(event_type: str, payload: dict[str, Any]) -> None:
    """
    event_type: order_created | order_updated | order_deleted | client_created | ...
    payload: произвольный JSON-serializable dict (рекомендуется actor_id для фильтра на клиенте).
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    message = {"type": event_type, "payload": payload}
    try:
        async_to_sync(channel_layer.group_send)(
            CRM_GROUP,
            {
                "type": "crm.event",
                "text": json.dumps(message, default=str),
            },
        )
    except Exception:
        logger.exception("broadcast_crm failed: %s", event_type)

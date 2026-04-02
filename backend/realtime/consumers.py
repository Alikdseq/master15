from __future__ import annotations

import json
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()


@database_sync_to_async
def _get_user_from_token(raw: str):
    if not raw:
        return None
    try:
        token = AccessToken(raw)
        uid = token.get("user_id")
        if uid is None:
            return None
        return User.objects.filter(pk=uid, is_active=True).first()
    except (TokenError, User.DoesNotExist, ValueError, TypeError):
        return None


class CrmConsumer(AsyncWebsocketConsumer):
    """
    Подключение: ws://host/ws/crm/?token=<JWT access>
    """

    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        raw_tokens = query.get("token") or []
        raw = raw_tokens[0] if raw_tokens else ""
        if not raw:
            raw = _read_cookie_token(self.scope, settings.JWT_ACCESS_COOKIE_NAME)
        user = await _get_user_from_token(raw)
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4401)
            return
        self.user = user
        self.group_name = "crm_staff"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def crm_event(self, event):
        # group_send from channel layer
        await self.send(text_data=event["text"])


def _read_cookie_token(scope, cookie_name: str) -> str:
    headers = dict(scope.get("headers") or [])
    cookie_header = headers.get(b"cookie", b"").decode("utf-8", errors="ignore")
    if not cookie_header:
        return ""
    chunks = [part.strip() for part in cookie_header.split(";") if part.strip()]
    for item in chunks:
        if "=" not in item:
            continue
        k, v = item.split("=", 1)
        if k.strip() == cookie_name:
            return v.strip()
    return ""

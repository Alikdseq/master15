from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models, transaction
from django.utils import timezone

from clients.models import Client
from notifications.models import Notification
from notifications.sms_providers import DummySmsProvider, SmsProvider
from system_settings.services import get_setting


User = get_user_model()


def _provider() -> SmsProvider:
    # Pluggable by env later.
    if getattr(settings, "SMS_PROVIDER", "dummy") == "dummy":
        return DummySmsProvider()
    return DummySmsProvider()


def _is_disabled_for_user(user: User, notif_type: str) -> bool:
    disabled = getattr(user, "notifications_disabled_types", []) or []
    return notif_type in disabled


def _is_disabled_for_client(client: Client, notif_type: str) -> bool:
    disabled = getattr(client, "notifications_disabled_types", []) or []
    return notif_type in disabled


def render_template(template_key: str, context: dict[str, Any]) -> str:
    tpl = get_setting(template_key, default="")
    if not tpl:
        return ""
    if isinstance(tpl, dict) and "text" in tpl:
        tpl = tpl["text"]
    if not isinstance(tpl, str):
        return ""
    try:
        return tpl.format(**context)
    except Exception:
        # If template placeholders mismatch, fallback to raw template.
        return tpl


@transaction.atomic
def queue_sms_to_user(*, user: User, notif_type: str, title: str, body: str, data: dict[str, Any] | None = None) -> Notification | None:
    if _is_disabled_for_user(user, notif_type):
        return None
    if not getattr(user, "phone", ""):
        return None
    return Notification.objects.create(
        user=user,
        type=notif_type,
        title=title,
        body=body,
        data=data or {},
        status=Notification.Status.QUEUED,
    )


@transaction.atomic
def queue_sms_to_client(*, client: Client, notif_type: str, title: str, body: str, data: dict[str, Any] | None = None) -> Notification | None:
    if _is_disabled_for_client(client, notif_type):
        return None
    if not getattr(client, "phone", ""):
        return None
    # For now we store client notifications attached to the creating staff user? No:
    # We need notifications for staff UI history. For client-SMS we will store them under the actor user (admin) later.
    # In this project we store client notifications under a technical "system" admin if exists, else skip UI history.
    system_admin = User.objects.filter(role=User.Role.ADMIN).order_by("id").first()
    if not system_admin:
        return None
    return Notification.objects.create(
        user=system_admin,
        type=notif_type,
        title=title,
        body=body,
        data={"client_id": client.id, "client_phone": client.phone, **(data or {})},
        status=Notification.Status.QUEUED,
    )


@transaction.atomic
def queue_mass_sms_to_clients(
    *,
    clients,
    notif_type: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> int:
    """
    Bulk queueing SMS notifications for a segment of clients.
    Returns number of created Notification rows.
    """
    system_admin = User.objects.filter(role=User.Role.ADMIN).order_by("id").first()
    if not system_admin:
        return 0

    created = 0
    for client in clients:
        if _is_disabled_for_client(client, notif_type):
            continue
        if not getattr(client, "phone", ""):
            continue
        Notification.objects.create(
            user=system_admin,
            type=notif_type,
            title=title,
            body=body,
            data={
                "client_id": client.id,
                "client_phone": client.phone,
                **(data or {}),
            },
            status=Notification.Status.QUEUED,
        )
        created += 1
    return created


PROPHYLAXIS_NOTIF_TYPE = "prophylaxis_reminder"


def _get_prophylaxis_interval_days() -> int:
    """
    Interval for prophylaxis reminders (days).
    Admin can change it via SystemSetting key `prophylaxis.reminder_interval_days`.
    """
    raw = get_setting("prophylaxis.reminder_interval_days", default=180)
    try:
        return int(raw)
    except Exception:
        return 180


@transaction.atomic
def queue_prophylaxis_reminders(*, now: datetime | None = None, limit: int | None = None) -> int:
    """
    Queues SMS reminders for clients whose `last_prophylaxis_reminder_at` is older than configured interval.
    Returns number of created Notification rows (status=queued).
    """
    now = now or timezone.now()
    interval_days = _get_prophylaxis_interval_days()
    cutoff = now - timezone.timedelta(days=interval_days)

    qs = Client.objects.all()
    qs = qs.filter(
        phone__isnull=False,
    ).filter(
        models.Q(last_prophylaxis_reminder_at__isnull=True)
        | models.Q(last_prophylaxis_reminder_at__lte=cutoff)
    )
    if limit:
        qs = qs[:limit]

    created = 0
    for client in qs:
        # Respect per-client notification disabling and missing phone.
        if _is_disabled_for_client(client, PROPHYLAXIS_NOTIF_TYPE):
            continue
        if not getattr(client, "phone", ""):
            continue

        text = render_template(
            "sms.templates.prophylaxis_reminder",
            {"client_name": client.name, "interval_days": interval_days},
        ) or f"Здравствуйте, {client.name}! Напоминаем о профилактике."

        n = queue_sms_to_client(
            client=client,
            notif_type=PROPHYLAXIS_NOTIF_TYPE,
            title="Профилактика",
            body=text,
            data={},
        )
        if n:
            client.last_prophylaxis_reminder_at = now
            client.save(update_fields=["last_prophylaxis_reminder_at"])
            created += 1
    return created


def deliver_notification(notification: Notification) -> Notification:
    to_phone = notification.data.get("client_phone") or getattr(notification.user, "phone", "")
    if not to_phone:
        notification.status = Notification.Status.FAILED
        notification.sent_at = timezone.now()
        notification.save(update_fields=["status", "sent_at"])
        return notification

    if getattr(settings, "SMS_DRY_RUN", True):
        notification.status = Notification.Status.SENT
        notification.sent_at = timezone.now()
        notification.save(update_fields=["status", "sent_at"])
        return notification

    provider = _provider()
    provider.send_sms(to_phone=to_phone, text=notification.body or notification.title)
    notification.status = Notification.Status.SENT
    notification.sent_at = timezone.now()
    notification.save(update_fields=["status", "sent_at"])
    return notification


def queue_order_accepted(*, order) -> None:
    client = order.client
    text = render_template(
        "sms.templates.order_accepted",
        {
            "client_name": client.name,
            "order_number": order.order_number,
            "device_type": order.device_type,
        },
    ) or f"{client.name}, заказ {order.order_number} принят."
    queue_sms_to_client(client=client, notif_type="order_accepted", title="Заказ принят", body=text, data={"order_id": order.id})


def queue_order_ready(*, order) -> None:
    client = order.client
    text = render_template(
        "sms.templates.order_ready",
        {
            "client_name": client.name,
            "order_number": order.order_number,
            "device_type": order.device_type,
        },
    ) or f"{client.name}, заказ {order.order_number} готов."
    queue_sms_to_client(client=client, notif_type="order_ready", title="Заказ готов", body=text, data={"order_id": order.id})


def queue_new_order_to_staff(*, order) -> None:
    text = render_template(
        "sms.templates.new_order_staff",
        {
            "order_number": order.order_number,
            "client_phone": order.client.phone,
            "device_type": order.device_type,
        },
    ) or f"Новый заказ {order.order_number}: {order.device_type} ({order.client.phone})"
    qs = User.objects.filter(role__in=[User.Role.MASTER, User.Role.MANAGER], is_active=True)
    for u in qs:
        queue_sms_to_user(user=u, notif_type="new_order_staff", title="Новый заказ", body=text, data={"order_id": order.id})


def queue_need_negotiation(*, order) -> None:
    # Notify managers when order moves to negotiation.
    text = render_template(
        "sms.templates.need_negotiation",
        {"order_number": order.order_number, "client_phone": order.client.phone},
    ) or f"Заказ {order.order_number} требует согласования с клиентом ({order.client.phone})."
    managers = User.objects.filter(role=User.Role.MANAGER, is_active=True)
    for m in managers:
        queue_sms_to_user(user=m, notif_type="need_negotiation", title="Требуется согласование", body=text, data={"order_id": order.id})


from celery import shared_task
from django.utils import timezone

from notifications.models import Notification
from notifications.services import deliver_notification, queue_prophylaxis_reminders


@shared_task
def healthcheck() -> str:
    return "ok"


@shared_task(bind=True, max_retries=5)
def deliver_queued_notifications(self, limit: int = 100) -> int:
    qs = (
        Notification.objects.filter(status=Notification.Status.QUEUED)
        .order_by("id")[:limit]
    )
    delivered = 0
    for n in qs:
        try:
            deliver_notification(n)
            delivered += 1
        except Exception as exc:
            n.status = Notification.Status.FAILED
            n.sent_at = timezone.now()
            n.save(update_fields=["status", "sent_at"])
            raise self.retry(exc=exc, countdown=10)
    return delivered


@shared_task
def queue_prophylaxis_reminders_task(limit: int | None = None) -> int:
    """
    Queues prophylaxis reminder SMS notifications for due clients.
    Intended to be scheduled by Celery beat / django-celery-beat.
    """
    return queue_prophylaxis_reminders(limit=limit)


from django.conf import settings
from django.db import models
from django.utils import timezone
from security.encrypted_fields import EncryptedCharField, pii_digest


class Client(models.Model):
    class Type(models.TextChoices):
        PERSON = "person", "Частное лицо"
        COMPANY = "company", "Организация"

    type = models.CharField(max_length=16, choices=Type.choices, default=Type.PERSON)
    name = models.CharField(max_length=255)
    phone = EncryptedCharField(unique=True)
    # Not unique at DB-level during migration bootstrap; uniqueness is enforced after backfill.
    phone_digest = models.CharField(max_length=64, db_index=True, editable=False, default="")
    email = EncryptedCharField(blank=True, default="")
    email_digest = models.CharField(max_length=64, db_index=True, editable=False, default="")
    address = EncryptedCharField(blank=True, default="")
    comment = models.TextField(blank=True, default="")
    tags = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    last_order_at = models.DateTimeField(null=True, blank=True)
    notifications_disabled_types = models.JSONField(default=list, blank=True)
    last_prophylaxis_reminder_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["phone_digest"]),
            models.Index(fields=["email_digest"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.phone})"

    def save(self, *args, **kwargs):
        self.phone_digest = pii_digest(self.phone or "") or ""
        self.email_digest = pii_digest(self.email or "") or ""
        super().save(*args, **kwargs)


class ClientNote(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="notes")
    text = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self) -> str:
        return f"Note for client_id={self.client_id}"


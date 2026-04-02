import base64
import binascii
import hashlib
import hmac
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.db import models

_ENC_PREFIX = "enc1:"
_AAD = b"master-print-client-pii-v1"


def _get_key_bytes() -> bytes:
    raw = (getattr(settings, "PII_ENCRYPTION_KEY", "") or "").strip()
    if raw:
        try:
            key = base64.urlsafe_b64decode(raw.encode("utf-8"))
        except (binascii.Error, ValueError) as exc:
            raise RuntimeError("Invalid PII_ENCRYPTION_KEY (must be base64url)") from exc
        if len(key) != 32:
            raise RuntimeError("PII_ENCRYPTION_KEY must decode to 32 bytes")
        return key
    # Dev fallback to keep app bootable without explicit env value.
    return hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()


def _normalize_text(value: str) -> str:
    return value.strip()


def encrypt_text(value: str) -> str:
    value = _normalize_text(value)
    if not value:
        return value
    if value.startswith(_ENC_PREFIX):
        return value
    key = _get_key_bytes()
    nonce = hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()[:12]
    ciphertext = AESGCM(key).encrypt(nonce, value.encode("utf-8"), _AAD)
    token = base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")
    return f"{_ENC_PREFIX}{token}"


def decrypt_text(value: str) -> str:
    if not value:
        return value
    if not isinstance(value, str):
        return value
    if not value.startswith(_ENC_PREFIX):
        return value
    key = _get_key_bytes()
    token = value[len(_ENC_PREFIX) :]
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8"))
    except (binascii.Error, ValueError):
        return value
    if len(raw) < 13:
        return value
    nonce, ciphertext = raw[:12], raw[12:]
    try:
        plain = AESGCM(key).decrypt(nonce, ciphertext, _AAD)
    except Exception:
        return value
    return plain.decode("utf-8")


def pii_digest(value: str) -> str:
    value = _normalize_text(value)
    if not value:
        return ""
    digest_key = hashlib.sha256(_get_key_bytes() + b"pii-digest").digest()
    return hmac.new(digest_key, value.encode("utf-8"), hashlib.sha256).hexdigest()


class EncryptedCharField(models.TextField):
    """
    Encrypted at-rest text field with transparent decrypt on read.
    """

    def from_db_value(self, value: Any, expression, connection):
        if value is None:
            return value
        return decrypt_text(value)

    def to_python(self, value: Any):
        if value is None:
            return value
        if isinstance(value, str):
            return decrypt_text(value)
        return value

    def get_prep_value(self, value: Any):
        if value is None:
            return value
        if not isinstance(value, str):
            value = str(value)
        return encrypt_text(value)

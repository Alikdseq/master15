from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SmsSendResult:
    provider_message_id: str | None = None


class SmsProvider(Protocol):
    def send_sms(self, *, to_phone: str, text: str) -> SmsSendResult: ...


class DummySmsProvider:
    """
    Dev/test provider: does not call external APIs.
    """

    def send_sms(self, *, to_phone: str, text: str) -> SmsSendResult:
        return SmsSendResult(provider_message_id=f"dummy:{to_phone}")


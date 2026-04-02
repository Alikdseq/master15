from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from django.conf import settings
from django.core import management
from django.utils import timezone


BackupMode = Literal["dumpdata"]


@dataclass(frozen=True)
class BackupResult:
    path: Path


def _backup_dir() -> Path:
    root = Path(getattr(settings, "BACKUP_DIR", Path(settings.BASE_DIR) / "backups"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def create_backup(*, mode: BackupMode = "dumpdata") -> BackupResult:
    ts = timezone.now().strftime("%Y%m%d_%H%M%S")
    out = _backup_dir() / f"backup_{ts}.json"
    if mode == "dumpdata":
        with out.open("w", encoding="utf-8") as f:
            management.call_command("dumpdata", "--natural-foreign", "--natural-primary", stdout=f)
        return BackupResult(path=out)
    raise ValueError("Unknown backup mode")


def restore_backup(*, path: Path) -> None:
    management.call_command("loaddata", str(path))


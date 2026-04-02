from __future__ import annotations

import re
from pathlib import Path

from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from backups.services import create_backup, restore_backup
from reports.permissions import IsAdmin
from django.conf import settings


class BackupViewSet(viewsets.ViewSet):
    permission_classes = [IsAdmin]
    MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024

    def _backup_dir(self) -> Path:
        root = Path(getattr(settings, "BACKUP_DIR", Path(settings.BASE_DIR) / "backups"))
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _sanitize_name(self, raw_name: str) -> str:
        base = Path(raw_name).name
        # Keep names filesystem-safe and predictable.
        return re.sub(r"[^A-Za-z0-9._-]", "_", base)

    @action(detail=False, methods=["post"], url_path="run")
    def run_backup(self, request):
        res = create_backup(mode="dumpdata")
        return Response({"path": str(res.path.name)}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="download")
    def download(self, request):
        name = request.query_params.get("name")
        if not name:
            return Response({"detail": "name is required"}, status=400)
        safe_name = self._sanitize_name(name)
        path = self._backup_dir() / safe_name
        if not path.exists():
            return Response({"detail": "not found"}, status=404)
        return FileResponse(path.open("rb"), as_attachment=True, filename=safe_name)

    @action(detail=False, methods=["post"], url_path="restore")
    def restore(self, request):
        name = request.data.get("name")
        upload = request.FILES.get("file")

        if not name and not upload:
            return Response({"detail": "name or file is required"}, status=400)

        if upload is not None:
            if upload.size and upload.size > self.MAX_UPLOAD_SIZE_BYTES:
                return Response(
                    {"detail": f"file is too large (max {self.MAX_UPLOAD_SIZE_BYTES} bytes)"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            safe_name = self._sanitize_name(upload.name or "uploaded_backup.json")
            if not safe_name.lower().endswith(".json"):
                return Response({"detail": "only .json backups are supported"}, status=status.HTTP_400_BAD_REQUEST)
            path = self._backup_dir() / safe_name
            with path.open("wb") as dst:
                for chunk in upload.chunks():
                    dst.write(chunk)
        else:
            safe_name = self._sanitize_name(str(name))
            path = self._backup_dir() / safe_name

        if not path.exists():
            return Response({"detail": "not found"}, status=404)
        restore_backup(path=path)
        return Response({"restored": True, "path": safe_name})


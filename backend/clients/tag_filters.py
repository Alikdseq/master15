"""Tag filtering that works on SQLite (tests) and PostgreSQL (production)."""

from __future__ import annotations

from django.db import connection
from django.db.models import QuerySet


def filter_clients_by_tags(qs: QuerySet, tags: list[str]) -> QuerySet:
    if not tags:
        return qs
    normalized_in = [str(t).strip() for t in tags if str(t).strip()]
    if not normalized_in:
        return qs

    if connection.vendor != "sqlite":
        return qs.filter(tags__contains=normalized_in)

    tags_set = {t.lower() for t in normalized_in}
    matching: list[int] = []
    for row in qs.only("id", "tags"):
        raw = row.tags or []
        if not isinstance(raw, list):
            continue
        have = {str(x).strip().lower() for x in raw if isinstance(x, str)}
        if tags_set.issubset(have):
            matching.append(row.id)
    return qs.filter(id__in=matching)

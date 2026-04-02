from rest_framework import serializers

from clients.models import Client, ClientNote


class ClientSerializer(serializers.ModelSerializer):
    orders_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Client
        fields = (
            "id",
            "type",
            "name",
            "phone",
            "email",
            "address",
            "comment",
            "tags",
            "created_at",
            "updated_at",
            "last_order_at",
            "orders_count",
        )
        read_only_fields = ("id", "created_at", "updated_at", "last_order_at", "orders_count")


class ClientCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ("type", "name", "phone", "email", "address", "comment", "tags")

    def validate_tags(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("tags must be a JSON array")
        for t in value:
            if not isinstance(t, str) or not t.strip():
                raise serializers.ValidationError("each tag must be a non-empty string")
        # normalize and de-dup
        seen = set()
        normalized = []
        for t in value:
            t2 = t.strip()
            if t2.lower() in seen:
                continue
            seen.add(t2.lower())
            normalized.append(t2)
        return normalized


class ClientNoteSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClientNote
        fields = ("id", "client", "text", "created_by", "created_by_name", "created_at")
        read_only_fields = ("id", "client", "created_by", "created_by_name", "created_at")

    def get_created_by_name(self, obj: ClientNote) -> str | None:
        return obj.created_by.name if obj.created_by_id and obj.created_by else None


class ClientNoteCreateSerializer(serializers.Serializer):
    text = serializers.CharField(min_length=1, max_length=5000)


class ClientMassSmsSerializer(serializers.Serializer):
    """
    Admin-only bulk SMS to clients by segment or explicit client_ids.
    """

    notif_type = serializers.CharField(min_length=1, max_length=64)
    title = serializers.CharField(allow_blank=True, required=False, default="")
    body = serializers.CharField(min_length=1, max_length=5000)

    client_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_null=True,
        default=list,
    )
    tags = serializers.ListField(
        child=serializers.CharField(min_length=1, max_length=64),
        required=False,
        allow_null=True,
        default=list,
    )
    last_order_from = serializers.DateField(required=False, allow_null=True)
    last_order_to = serializers.DateField(required=False, allow_null=True)

    def validate_tags(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("tags must be a JSON array")
        seen = set()
        normalized: list[str] = []
        for t in value:
            t2 = (t or "").strip()
            if not t2:
                continue
            if t2.lower() in seen:
                continue
            seen.add(t2.lower())
            normalized.append(t2)
        return normalized

    def validate(self, attrs):
        client_ids = attrs.get("client_ids") or []
        if client_ids:
            return attrs
        tags = attrs.get("tags") or []
        from_dt = attrs.get("last_order_from")
        to_dt = attrs.get("last_order_to")
        if not tags and not from_dt and not to_dt:
            raise serializers.ValidationError(
                "Segment is required: provide client_ids, tags, or last_order_from/last_order_to."
            )
        if from_dt and to_dt and to_dt < from_dt:
            raise serializers.ValidationError({"last_order_to": "last_order_to must be >= last_order_from"})
        return attrs


class ClientBulkTagsSerializer(serializers.Serializer):
    operation = serializers.ChoiceField(choices=("add_tags", "remove_tags"))
    tags = serializers.ListField(
        child=serializers.CharField(min_length=1, max_length=64),
        min_length=1,
    )
    client_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1)

    def validate_tags(self, value):
        seen: set[str] = set()
        out: list[str] = []
        for t in value:
            t2 = (t or "").strip()
            if not t2 or t2.lower() in seen:
                continue
            seen.add(t2.lower())
            out.append(t2)
        if not out:
            raise serializers.ValidationError("tags must contain at least one non-empty tag")
        return out


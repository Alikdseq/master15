import django_filters

from orders.models import Order


class OrderFilter(django_filters.FilterSet):
    received_date_from = django_filters.DateFilter(field_name="received_date", lookup_expr="gte")
    received_date_to = django_filters.DateFilter(field_name="received_date", lookup_expr="lte")
    status = django_filters.CharFilter(field_name="status__code")
    client = django_filters.NumberFilter(field_name="client_id")
    master = django_filters.NumberFilter(field_name="assigned_master_id")
    service_type = django_filters.CharFilter(field_name="service_type")

    class Meta:
        model = Order
        fields = ("status", "client", "master", "service_type", "received_date_from", "received_date_to")


from django.urls import re_path

from realtime.consumers import CrmConsumer

websocket_urlpatterns = [
    re_path(r"ws/crm/$", CrmConsumer.as_asgi()),
]

from django.contrib import admin

from clients.models import Client, ClientNote


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "phone", "type", "email", "created_at", "last_order_at")
    search_fields = ("name", "phone_digest", "email_digest")
    list_filter = ("type",)


@admin.register(ClientNote)
class ClientNoteAdmin(admin.ModelAdmin):
    list_display = ("id", "client", "created_by", "created_at")
    search_fields = ("client__name", "client__phone_digest", "text")

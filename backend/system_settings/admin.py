from django.contrib import admin

from system_settings.models import SystemSetting


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ("key",)
    search_fields = ("key",)

from django.contrib import admin

# Register your models here.

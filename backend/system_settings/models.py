from django.db import models


class SystemSetting(models.Model):
    key = models.CharField(max_length=128, primary_key=True)
    value = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.key


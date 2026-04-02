# Generated manually for financial snapshots

from decimal import Decimal

from django.db import migrations, models


def fill_price_snapshots(apps, schema_editor):
    OrderUsedProduct = apps.get_model("inventory", "OrderUsedProduct")
    for up in OrderUsedProduct.objects.all().select_related("product"):
        p = up.product
        up.selling_price_at_moment = p.selling_price if p.selling_price is not None else Decimal("0")
        up.purchase_price_at_moment = p.purchase_price if p.purchase_price is not None else Decimal("0")
        up.save(update_fields=["selling_price_at_moment", "purchase_price_at_moment"])


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="orderusedproduct",
            name="selling_price_at_moment",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Продажная цена на момент списания (снимок)",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="orderusedproduct",
            name="purchase_price_at_moment",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Закупочная цена на момент списания (снимок)",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.RunPython(fill_price_snapshots, migrations.RunPython.noop),
    ]

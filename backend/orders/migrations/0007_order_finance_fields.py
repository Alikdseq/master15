# Generated manually — финансовые поля заказа и бэкап из legacy final_cost

from decimal import Decimal

from django.db import migrations, models


def backfill_finance_from_legacy(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    OrderUsedProduct = apps.get_model("inventory", "OrderUsedProduct")

    for o in Order.objects.all():
        materials_sell = Decimal("0")
        materials_buy = Decimal("0")
        for up in OrderUsedProduct.objects.filter(order_id=o.pk).select_related("product"):
            pr = up.product
            sp = up.selling_price_at_moment
            if sp is None:
                sp = getattr(pr, "selling_price", None) or Decimal("0")
            pp = up.purchase_price_at_moment
            if pp is None:
                pp = getattr(pr, "purchase_price", None) or Decimal("0")
            materials_sell += up.quantity * sp
            materials_buy += up.quantity * pp

        o.final_materials_cost = materials_sell
        o.materials_cost_price = materials_buy
        oc = getattr(o, "other_costs", None) or Decimal("0")
        if o.final_cost is not None:
            o.total_amount = o.final_cost
            fw = o.final_cost - materials_sell
            o.final_work_cost = fw if fw >= 0 else Decimal("0")
        else:
            o.total_amount = None
            o.final_work_cost = None
        o.profit = (o.total_amount or Decimal("0")) - materials_buy - oc
        o.save(
            update_fields=[
                "final_work_cost",
                "final_materials_cost",
                "total_amount",
                "materials_cost_price",
                "profit",
                "other_costs",
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0006_orderstatus_color_visibility"),
        ("inventory", "0002_orderusedproduct_price_snapshots"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="final_work_cost",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Окончательная стоимость работ (без материалов по продажным ценам)",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="final_materials_cost",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Сумма продажных цен использованных материалов",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="total_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Итого к оплате клиентом (работа + материалы по продажным ценам)",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="materials_cost_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Себестоимость материалов (закупка × количество)",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="profit",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Расчётная прибыль: total_amount − materials_cost_price − other_costs",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="other_costs",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0"),
                help_text="Доп. расходы по заказу (транспорт, накладные и т.п.)",
                max_digits=12,
            ),
        ),
        migrations.RunPython(backfill_finance_from_legacy, migrations.RunPython.noop),
    ]

from django.urls import path

from reports import views


urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("orders/", views.orders_report, name="orders_report"),
    path("orders.xlsx", views.orders_report_xlsx, name="orders_report_xlsx"),
    path("stock-movements/", views.stock_movements_report, name="stock_movements_report"),
    path("stock-movements.xlsx", views.stock_movements_report_xlsx, name="stock_movements_report_xlsx"),
    path("finance/", views.finance_report, name="finance_report"),
    path("finance.xlsx", views.finance_report_xlsx, name="finance_report_xlsx"),
]


from django.contrib import admin
from django.urls import path,include
from .views import AdminDashboardKPIView,OrderLogsByOrderView, OrdersByUserView,AdminDashboardChartsView,OrderStatusList,BranchView,PartyView,DispatchLocationListView,UpdateOrderStatusView,PartyAddressesView,ProductFiltersView,ProductListView,PartyProductsView,CreateOrderView,OrderListView,RejectOrderView,ApproveOrderView

urlpatterns=[

    path('parties/',PartyView.as_view(),name='parties'),
    path('dispatches/',DispatchLocationListView.as_view(),name='dispatches'),
    path('addresses/', PartyAddressesView.as_view(), name='party-addresses'),
    path('product-filters/', ProductFiltersView.as_view(), name='product-filters'),
    path('products/', ProductListView.as_view(), name='products'),
    path('create/', CreateOrderView.as_view(), name='create-order'),
    path('list/', OrderListView.as_view(), name='order_list'),
    path('<int:order_id>/approve/', ApproveOrderView.as_view(), name='approve_list'),
    path('<int:order_id>/reject/', RejectOrderView.as_view(), name='reject_list'),
    path('party-products/<str:card_code>/', PartyProductsView.as_view(), name='party-products'),
    path('status/',OrderStatusList.as_view(),name='status'),
    path('branch/',BranchView.as_view(),name='branch'),
    path('<int:order_id>/update-status/',UpdateOrderStatusView.as_view(),name='update-status'),
    path('dashboard/admin/', AdminDashboardKPIView.as_view(), name='dashboard'),
    path('dashboard/admin/charts/', AdminDashboardChartsView.as_view(), name='dashboard-charts'),
    path("<int:order_id>/orderdetails/",OrderLogsByOrderView.as_view(),name="order-logs-by-orderid"),
    path("<int:user_id>/orderbyuserid/",OrdersByUserView.as_view(),name="order-logs-by-userid"),

]
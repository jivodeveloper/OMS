from django.urls import path
from .views import (
    LoginView,
    ProfileView,
    StateListView,
    CompanyListView,
    MainGroupListView,
    CreateUserView,
    RoleListView,
    UserListForAssignmentView,
    # Party assignment
    UserPartiesView,
    AssignPartiesView,
    RemovePartyAssignmentView,
    PartyUsersView,
    # Product assignment
    PartyProductsView,
    AssignProductToPartyView,
    BulkAssignProductsToPartyView,
    UpdateProductRateView,
    RemoveProductFromPartyView,
)
urlpatterns = [
    
    path('login/', LoginView.as_view(), name='login'),
    path('profile/', ProfileView.as_view(), name='profile'),

    # Master data APIS
    path('states/',StateListView.as_view(),name='states'),
    path('companies/',CompanyListView.as_view(),name='companies'),
    path('mainGroup/', MainGroupListView.as_view(), name='mainGroup'),
    path('users/create/', CreateUserView.as_view(), name='create-user'),
    path('roles/', RoleListView.as_view(), name='roles-list'),
    path('users/list/', UserListForAssignmentView.as_view(), name='users-list'),

    # Party assignment APIs (using card_code)
    path('users/<int:user_id>/parties/', UserPartiesView.as_view(), name='user-parties'),
    path('parties/<str:card_code>/users/', PartyUsersView.as_view(), name='party-users'),
    path('assign-parties/', AssignPartiesView.as_view(), name='assign-parties'),
    path('remove-party/', RemovePartyAssignmentView.as_view(), name='remove-party'),

    # Party-Product assignment (with basic_rate)
    path('parties/<str:card_code>/products/', PartyProductsView.as_view(), name='party-products'),
    path('party-product/add/', AssignProductToPartyView.as_view(), name='add-product-to-party'),
    path('party-product/bulk-add/', BulkAssignProductsToPartyView.as_view(), name='bulk-add-products-to-party'),
    path('party-product/update-rate/', UpdateProductRateView.as_view(), name='update-product-rate'),
    path('party-product/remove/', RemoveProductFromPartyView.as_view(), name='remove-product-from-party'),
    
]
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import LoginSerializer, UpdateUserSerializer, UserSerializer,StateSerializer, CompanySerializer,MainGroupSerializer,CreateUserSerializer
from rest_framework.generics import ListAPIView
from .models import State, Company, MainGroup,UserRole,User, UserPartyAssignment,PartyProductAssignment
from sap_sync.models import Party, Product
from decimal import Decimal

class PartyUsersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, card_code):
        party = Party.objects.filter(card_code=card_code).first()
        if not party:
            return Response({'success': False, 'message': 'Party not found'}, status=status.HTTP_404_NOT_FOUND)

        assignments = UserPartyAssignment.objects.filter(card_code=card_code, is_active=True).select_related('user')
        users = [{'id': a.user.id, 'username': a.user.username, 'name': a.user.name, 'role': a.user.role, 'assigned_at': a.assigned_at} for a in assignments]

        return Response({
            'success': True,
            'data': {
                'party': {'card_code': party.card_code, 'card_name': party.card_name},
                'users': users, 'total_assigned': len(users)
            }
        })
    
class RoleListView(APIView):
    def get(self, request):
        roles = UserRole.objects.filter(is_active=True).values('id', 'name', 'display_name')
        return Response(list(roles))

class UserPartiesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        assignments = UserPartyAssignment.objects.filter(user=user, is_active=True)
        assigned_card_codes = [a.card_code for a in assignments]
        parties = Party.objects.filter(card_code__in=assigned_card_codes)
        assignment_dict = {a.card_code: a.assigned_at for a in assignments}

        parties_list = [{
            'id': p.id, 'card_code': p.card_code, 'card_name': p.card_name,
            'state': p.state, 'main_group': p.main_group,
            'assigned_at': assignment_dict.get(p.card_code),
        } for p in parties]

        return Response({
            'success': True,
            'data': {
                'user': {'id': user.id, 'username': user.username, 'name': user.name},
                'parties': parties_list, 'card_codes': assigned_card_codes,
                'total_assigned': len(parties_list)
            }
        })

class AssignPartiesView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = request.data.get('user_id')
        card_codes = request.data.get('card_codes', [])

        if not user_id:
            return Response({'success': False, 'message': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        existing = set(UserPartyAssignment.objects.filter(user=user, is_active=True).values_list('card_code', flat=True))
        new_card_codes = set(card_codes)
        to_add = new_card_codes - existing
        to_remove = existing - new_card_codes

        added_count = 0
        for card_code in to_add:
            if Party.objects.filter(card_code=card_code).exists():
                UserPartyAssignment.objects.update_or_create(
                    user=user, card_code=card_code,
                    defaults={'is_active': True, 'assigned_by': request.user}
                )
                added_count += 1

        removed_count = UserPartyAssignment.objects.filter(user=user, card_code__in=to_remove).update(is_active=False)

        return Response({
            'success': True,
            'message': f'Added: {added_count}, Removed: {removed_count}',
            'data': {'added': added_count, 'removed': removed_count, 'total_assigned': len(new_card_codes)}
        })

class PartyProductsView(APIView):
    """Get all products assigned to a party with their basic_rate"""
    permission_classes = [IsAuthenticated]

    def get(self, request, card_code):
        party = Party.objects.filter(card_code=card_code).first()
        if not party:
            return Response({'success': False, 'message': 'Party not found'}, status=status.HTTP_404_NOT_FOUND)

        category_filter = request.query_params.get('category', None)

        assignments = PartyProductAssignment.objects.filter(card_code=card_code, is_active=True)
        if category_filter:
            assignments = assignments.filter(category=category_filter)

        products_list = []
        for a in assignments:
            product = Product.objects.filter(item_code=a.item_code, category=a.category).first()
            if product:
                products_list.append({
                    'id': product.id,
                    'item_code': product.item_code,
                    'item_name': product.item_name,
                    'category': product.category,
                    'brand': product.brand,
                    'variety': product.variety,
                    'sal_pack_unit': product.sal_pack_unit,
                    'basic_rate': float(a.basic_rate),
                    'assigned_at': a.assigned_at,
                })

        return Response({
            'success': True,
            'data': {
                'party': {
                    'card_code': party.card_code,
                    'card_name': party.card_name,
                    'state': party.state,
                    'main_group': party.main_group,
                },
                'products': products_list,
                'total_assigned': len(products_list)
            }
        })

class AssignProductToPartyView(APIView):
    """
    Add single product to party with basic_rate
    Body: {"card_code": "C001", "item_code": "FG001", "category": "OIL", "basic_rate": 150.50}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        card_code = request.data.get('card_code')
        item_code = request.data.get('item_code')
        category = request.data.get('category')
        basic_rate = request.data.get('basic_rate', 0)

        if not all([card_code, item_code, category]):
            return Response({
                'success': False,
                'message': 'card_code, item_code and category are required'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not Party.objects.filter(card_code=card_code).exists():
            return Response({'success': False, 'message': 'Party not found'}, status=status.HTTP_404_NOT_FOUND)

        if not Product.objects.filter(item_code=item_code, category=category).exists():
            return Response({'success': False, 'message': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)

        obj, created = PartyProductAssignment.objects.update_or_create(
            card_code=card_code,
            item_code=item_code,
            category=category,
            defaults={
                'basic_rate': Decimal(str(basic_rate)),
                'is_active': True,
                'assigned_by': request.user
            }
        )

        return Response({
            'success': True,
            'message': 'Product added' if created else 'Product updated',
            'data': {
                'item_code': item_code,
                'category': category,
                'basic_rate': float(obj.basic_rate)
            }
        })

class BulkAssignProductsToPartyView(APIView):
    """
    Add multiple products to a party
    Body: {
        "card_code": "C001",
        "products": [
            {"item_code": "FG001", "category": "OIL", "basic_rate": 150.50},
            {"item_code": "FG002", "category": "BEVERAGES", "basic_rate": 120.00}
        ]
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        card_code = request.data.get('card_code')
        products = request.data.get('products', [])

        if not card_code:
            return Response({'success': False, 'message': 'card_code is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not Party.objects.filter(card_code=card_code).exists():
            return Response({'success': False, 'message': 'Party not found'}, status=status.HTTP_404_NOT_FOUND)

        added = 0
        updated = 0
        errors = []

        for prod in products:
            item_code = prod.get('item_code')
            category = prod.get('category')
            basic_rate = prod.get('basic_rate', 0)

            if not item_code or not category:
                errors.append(f"Missing item_code or category")
                continue

            if not Product.objects.filter(item_code=item_code, category=category).exists():
                errors.append(f"Product {item_code}|{category} not found")
                continue

            obj, created = PartyProductAssignment.objects.update_or_create(
                card_code=card_code,
                item_code=item_code,
                category=category,
                defaults={
                    'basic_rate': Decimal(str(basic_rate)),
                    'is_active': True,
                    'assigned_by': request.user
                }
            )
            if created:
                added += 1
            else:
                updated += 1

        return Response({
            'success': True,
            'message': f'Added: {added}, Updated: {updated}',
            'data': {'added': added, 'updated': updated, 'errors': errors}
        })

class UpdateProductRateView(APIView):
    """Update basic_rate for a party-product"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        card_code = request.data.get('card_code')
        item_code = request.data.get('item_code')
        category = request.data.get('category')
        basic_rate = request.data.get('basic_rate')

        if not all([card_code, item_code, category]) or basic_rate is None:
            return Response({
                'success': False,
                'message': 'card_code, item_code, category and basic_rate are required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = PartyProductAssignment.objects.get(
                card_code=card_code, item_code=item_code, category=category, is_active=True
            )
            assignment.basic_rate = Decimal(str(basic_rate))
            assignment.save()

            return Response({
                'success': True,
                'message': 'Rate updated',
                'data': {'basic_rate': float(assignment.basic_rate)}
            })
        except PartyProductAssignment.DoesNotExist:
            return Response({'success': False, 'message': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

class RemoveProductFromPartyView(APIView):
    """Remove a product from party"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        card_code = request.data.get('card_code')
        item_code = request.data.get('item_code')
        category = request.data.get('category')

        if not all([card_code, item_code, category]):
            return Response({
                'success': False,
                'message': 'card_code, item_code and category are required'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = PartyProductAssignment.objects.get(
                card_code=card_code, item_code=item_code, category=category, is_active=True
            )
            assignment.is_active = False
            assignment.save()
            return Response({'success': True, 'message': 'Product removed from party'})
        except PartyProductAssignment.DoesNotExist:
            return Response({'success': False, 'message': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

class RemovePartyAssignmentView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = request.data.get('user_id')
        card_code = request.data.get('card_code')

        if not user_id or not card_code:
            return Response({'success': False, 'message': 'user_id and card_code are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = UserPartyAssignment.objects.get(user_id=user_id, card_code=card_code, is_active=True)
            assignment.is_active = False
            assignment.save()
            return Response({'success': True, 'message': 'Party removed from user'})
        except UserPartyAssignment.DoesNotExist:
            return Response({'success': False, 'message': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

class UserPartiesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        assignments = UserPartyAssignment.objects.filter(user=user, is_active=True)
        assigned_card_codes = [a.card_code for a in assignments]
        parties = Party.objects.filter(card_code__in=assigned_card_codes)
        assignment_dict = {a.card_code: a.assigned_at for a in assignments}

        parties_list = [{
            'id': p.id, 'card_code': p.card_code, 'card_name': p.card_name,
            'state': p.state, 'main_group': p.main_group,
            'assigned_at': assignment_dict.get(p.card_code),
        } for p in parties]

        return Response({
            'success': True,
            'data': {
                'user': {'id': user.id, 'username': user.username, 'name': user.name},
                'parties': parties_list, 'card_codes': assigned_card_codes,
                'total_assigned': len(parties_list)
            }
        })

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
                
            return Response({
                'success': True,
                'message': 'Login successful',
                'data': {
                    'user': UserSerializer(user).data,
                    'tokens': {
                        'access': str(refresh.access_token),
                        'refresh': str(refresh),
                    }
                }
            })

        return Response({
            'success': False,
            'message': 'Login failed',
            'errors': serializer.errors
        }, status=status.HTTP_401_UNAUTHORIZED)
    
class UserListForAssignmentView(APIView):
    permission_classes = [AllowAny]

   
    def get(self, request):
        users = (
            User.objects.filter(is_active=True)
            .select_related('role', 'company', 'main_group', 'state')
            .prefetch_related('main_groups', 'user_states__state')
            .order_by('id')
        )
        data = UserSerializer(users, many=True).data
        return Response({'success': True, 'data': data})

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'success': True,
            'data': UserSerializer(request.user).data
        })

class StateListView(ListAPIView):
    """Get all active states"""
    permission_classes = [AllowAny]  # Or [IsAuthenticated] if login required
    serializer_class = StateSerializer
    queryset = State.objects.filter(is_active=True).order_by('name')

class CompanyListView(ListAPIView):
    """Get all active companies"""
    permission_classes = [AllowAny]
    serializer_class = CompanySerializer
    queryset = Company.objects.filter(is_active=True).order_by('name')
    
class MainGroupListView(ListAPIView):
    """Get all active main groups"""
    permission_classes = [AllowAny]
    serializer_class = MainGroupSerializer
    queryset = MainGroup.objects.filter(is_active=True).order_by('name')

#Creating User
class CreateUserView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CreateUserSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()
            return Response({
                'success': True,
                'message': 'User created successfully',
                'data': UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)

        return Response({
            'success': False,
            'message': 'Failed to create user',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)

    permission_classes = [AllowAny]


class UserDetailView(APIView):
    permission_classes = [AllowAny] # Tusi IsAuthenticated bhi rakh sakde ho

    def get(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
            serializer = UserSerializer(user)
            return Response({
                'success': True,
                'data': serializer.data
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({
                'success': False,
                'message': 'User not found'
            }, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, user_id):
 
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({
                'success': False,
          'message': 'User not found'
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateUserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            updated_user = serializer.save()
            return Response({
 
                'success': True,
                'message': 'User updated successfully',
                'data': UserSerializer(updated_user).data
            }, status=status.HTTP_200_OK)

        return Response({
            'success': False,
            'message': 'Failed to update user',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
class UserDetailView(APIView):
    permission_classes = [AllowAny] # Tusi IsAuthenticated bhi rakh sakde ho

    def get(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
            serializer = UserSerializer(user)
            return Response({
                'success': True,
                'data': serializer.data
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({
                'success': False,
                'message': 'User not found'
            }, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({
                'success': False,
                'message': 'User not found'
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = UpdateUserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            updated_user = serializer.save()
            return Response({
                'success': True,
                'message': 'User updated successfully',
                'data': UserSerializer(updated_user).data
            }, status=status.HTTP_200_OK)

        return Response({
            'success': False,
            'message': 'Failed to update user',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    

class BulkAssignPartyToProductView(APIView):
    """
    Assign multiple products to multiple parties
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        card_codes = request.data.get('card_codes', [])
        products = request.data.get('products', [])

        if not card_codes:
            return Response({'success': False, 'message': 'card_codes is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not products:
            return Response({'success': False, 'message': 'products is required'}, status=status.HTTP_400_BAD_REQUEST)

        added = 0
        updated = 0
        errors = []

        for card_code in card_codes:
            for prod in products:
                item_code = prod.get('item_code')
                category = prod.get('category')
                basic_rate = prod.get('basic_rate', 0)

                if not item_code or not category:
                    errors.append(f"{card_code}: Missing item_code/category")
                    continue

                # Validate product exists
                if not Product.objects.filter(item_code=item_code, category=category).exists():
                    errors.append(f"{card_code}: {item_code}|{category} not found")
                    continue

                obj, created = PartyProductAssignment.objects.update_or_create(
                    card_code=card_code,
                    item_code=item_code,
                    category=category,
                    defaults={
                        'basic_rate': Decimal(str(basic_rate)),
                        'is_active': True,
                        'assigned_by': request.user
                    }
                )

                if created:
                    added += 1
                else:
                    updated += 1

        return Response({
            'success': True,
            'message': f'Added: {added}, Updated: {updated}',
            'data': {
                'added': added,
                'updated': updated,
                'errors': errors
            }
        }, status=status.HTTP_200_OK)


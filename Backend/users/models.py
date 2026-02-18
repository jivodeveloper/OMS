from django.db import models
from django.contrib.auth.models import AbstractUser
# Create your models here.

class Company(models.Model):
    name = models.CharField(max_length= 100,unique = True)
    is_active = models.BooleanField(default = True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta: 
        verbose_name_plural = "Companies"
    
    def __str__(self):
        return self.name

class MainGroup(models.Model):
    name = models.CharField(max_length= 35 ,unique = True)
    is_active = models.BooleanField(default = True)
    created_at = models.DateTimeField(auto_now_add = True)
    
    class Meta:
        verbose_name = "Main Group"
        verbose_name_plural = "Main Groups"

    def __str__(self):
        return self.name

class State(models.Model):
    name = models.CharField(max_length= 20,unique = True)
    code = models.CharField(max_length = 10,unique = True)
    is_active = models.BooleanField(default=True) 

    class Meta:
        verbose_name = "State"
        verbose_name_plural = "States"

    def __str__(self):
        return self.name    

class UserRole(models.Model):
    name = models.CharField(max_length=50, unique=True)  # e.g. admin, manager, operator
    display_name = models.CharField(max_length=100)       # e.g. Admin, Manager, Operator
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'users_role'
        ordering = ['name']

    def __str__(self):
        return self.display_name        

class User(AbstractUser):
    first_name = None
    last_name = None
    
    name = models.CharField(max_length = 150)
    email = models.EmailField(max_length=15, blank=True, null=True)
    phone = models.CharField(max_length = 15, blank = True, null= True)
    role = models.ForeignKey(
    'users.UserRole',
    on_delete=models.PROTECT,
    related_name='users',
    null=True,
    blank=True,
    )
    
    company = models.ManyToManyField(Company, blank=True, related_name='users')
    main_group = models.ManyToManyField(MainGroup, blank=True, related_name='users')
    state = models.ManyToManyField(State, blank=True, related_name='users')
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):  
        return self.username

class UserPartyAssignment(models.Model):
    """Maps users to parties using card_code"""
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='party_assignments'
    )
    card_code = models.CharField(max_length=50, db_index=True)
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assignments_made'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'user_party_assignments'
        unique_together = ['user', 'card_code']
        ordering = ['-assigned_at']

    def __str__(self):
        return f"{self.user.username} - {self.card_code}"

class PartyProductAssignment(models.Model):
    """
    Maps parties to products with pricing
    - One party can have many products
    - Same item_code can exist in different categories (OIL, BEVERAGES, MART)
    - Each party-product combination has its own basic_rate
    """
    
    CATEGORY_CHOICES = [
        ('OIL', 'Oil'),
        ('BEVERAGES', 'Beverages'),
        ('MART', 'Mart'),
    ]
    
    card_code = models.CharField(max_length=50, db_index=True)  # Party identifier
    item_code = models.CharField(max_length=50, db_index=True)  # Product identifier
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, db_index=True)
    basic_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)  # Price for this party
    
    assigned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    assigned_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='party_product_assignments_made'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'party_product_assignments'
        unique_together = ['card_code', 'item_code', 'category']
        ordering = ['card_code', 'item_code', 'category']

    def __str__(self):
        return f"{self.card_code} - {self.item_code} ({self.category}) - ₹{self.basic_rate}"
    
from django.db import models

class Parties(models.Model):
    card_code = models.CharField(max_length=100,primary_key=True)
    card_name = models.CharField(max_length=100)
    address = models.CharField(max_length=200,null=True)
    state = models.CharField(max_length=10,blank=True,null=True)
    main_group = models.CharField(max_length=20,blank=True,null=True)
    chain = models.CharField(max_length= 20,blank=True,null=True)
    country = models.CharField(max_length=20,blank=True,null=True)
    card_type = models.CharField(max_length=200,blank=True,null=True)

    class Meta:
        managed = False
        db_table = 'sap_parties'
    
    def __str__(self):
        return self.card_name
    
class UserPartyAssignment(models.Model):
    assigned_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    assigned_by_id = models.BigIntegerField(blank=True, null=True)
    user_id = models.BigIntegerField()
    card_code = models.CharField(max_length=50)
    
    class Meta:
        managed = False
        db_table = 'user_party_assignments'
    
    def __str__(self):
        return f"{self.user_id} - {self.card_code}"

class DispatchLocation(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    city = models.CharField(max_length=10)
    state = models.CharField(max_length=20)

    class Meta:
        managed = False
        db_table='dispatch_locations'

    def __str__(self):
        return self.name    

class PartyAddress(models.Model):
    card_code = models.CharField(max_length=50)
    # address_id = models.CharField(max_length=100, blank=True, null=True)
    address_type = models.CharField(max_length=1, blank=True, null=True)
    gst_number = models.CharField(max_length=20, blank=True, null=True)
    full_address = models.TextField(blank=True, null=True)
    address_name = models.TextField(blank=True,null=True)
    synced_at = models.DateTimeField()
    # created_at = models.DateTimeField()
    # party_id = models.BigIntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'sap_party_addresses'
    
    def __str__(self):
        return f"{self.card_code} ({self.address_type})"

class ProductDetails(models.Model):
    item_code = models.CharField(max_length=100)
    item_name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, null=True)
    brand = models.CharField(max_length=100, blank=True, null=True)
    variety = models.CharField(max_length=100, blank=True, null=True)
    sal_factor2 = models.DecimalField(max_digits=10, decimal_places=3, blank=True, null=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=3, blank=True, null=True)
    sal_pack_unit = models.CharField(max_length=50, blank=True, null=True)
    is_deleted = models.BooleanField(default=False)
    synced_at = models.DateTimeField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'sap_products'

    def __str__(self):
        return self.item_name

class Order(models.Model):
    
    order_number = models.CharField(max_length= 50,unique=False)
    card_code = models.CharField(max_length=100)
    card_name = models.CharField(max_length=100)
    bill_to_id = models.IntegerField(blank=True, null=True)
    bill_to_address = models.TextField(blank=True, null=True)  # ADD THIS
    ship_to_id = models.CharField(blank=True, null=True)
    ship_to_address = models.TextField(blank=True, null=True)
    dispatch_from_id = models.IntegerField(blank=True, null=True)
    dispatch_from_name = models.CharField(max_length=255, blank=True, null=True)
    company = models.CharField(max_length=255, blank=True, null=True)
    po_number = models.CharField(max_length=100, blank=True, null=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.ForeignKey('OrderStatus', on_delete=models.PROTECT, default=1, related_name='orders', db_column='status')
    created_by = models.IntegerField(blank=True, null=True)
    approved_by = models.IntegerField(blank=True, null=True)
    approved_at = models.DateTimeField(blank=True, null=True)
    rejected_by = models.IntegerField(blank=True, null=True)
    rejected_at = models.DateTimeField(blank=True, null=True)
    rejection_reason = models.TextField(blank=True, null=True)
    sap_doc_number = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    delivery_date = models.CharField(max_length=255)

    class Meta:
        db_table = 'orders'

    def __str__(self):
        return self.order_number    

class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    item_code = models.CharField(max_length=100)
    item_name = models.CharField(max_length=255, blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)
    brand = models.CharField(max_length=100, blank=True, null=True)
    variety = models.CharField(max_length=100, blank=True, null=True)
    item_type = models.CharField(max_length=50, blank=True, null=True)
    qty = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pcs = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    boxes = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    ltrs = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    market_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    basic_price = models.DecimalField(max_digits=10,decimal_places=2,default=0)

    class Meta:
        db_table = 'order_items'

    def __str__(self):
        return f"{self.item_name} x {self.qty}"

class OrdersLog(models.Model):
    order = models.ForeignKey('Order', on_delete=models.CASCADE, related_name='order_logs')
    action = models.ForeignKey('OrderStatus', on_delete=models.PROTECT, related_name='+')
    performed_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    
    class Meta:
        managed = False
        db_table = 'order_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.order.order_number}] {self.action.name}"
    
class OrderStatus(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    # display_name = models.CharField(max_length=100)
    # is_active = models.BooleanField(default=True)

    class Meta:
        managed = False  # Django won't create/alter the table
        db_table = 'order_statuses'

    def __str__(self):
        return self.name    
    
class Branches(models.Model):
    bpl_id = models.CharField(max_length=100,blank=True,null=True)
    bpl_name = models.CharField(max_length=100,blank=True,null=True)
    category = models.CharField(max_length=100,blank=True,null=True)
    
    class Meta:
        managed:True
        db_table = 'branches'

    def __str__(self):
        return self.bpl_name

# Helper function
def log_order_action(order, action_name, user=None, remarks=''):
    action = OrderStatus.objects.get(name=action_name)
    return OrdersLog.objects.create(
        order=order,
        action=action,
        performed_by=user if user and user.is_authenticated else None,
        remarks=remarks
    )   

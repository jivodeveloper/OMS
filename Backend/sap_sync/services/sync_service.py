import logging
from django.utils import timezone
from ..models import Product, Party, PartyAddress, Branch, SyncLog
from .connection import SAPConnection
import requests
from django.conf import settings
from ..models import SalesQuotationLog

logger = logging.getLogger(__name__)

class SyncService:
    def __init__(self, triggered_by='manual'):
        self.triggered_by = triggered_by
        self.connection = SAPConnection()
    
    def sync_all(self):
        log = SyncLog.objects.create(
            sync_type='ALL',
            status='STARTED',
            triggered_by=self.triggered_by
        )
        
        total_processed = 0
        total_created = 0
        total_updated = 0
        errors = []
        
        try:
            # Sync Products
            result = self.sync_products()
            total_processed += result['processed']
            total_created += result['created']
            total_updated += result['updated']
            if result.get('error'):
                errors.append(f"Products: {result['error']}")
            
            # Sync Parties
            result = self.sync_parties()
            total_processed += result['processed']
            total_created += result['created']
            total_updated += result['updated']
            if result.get('error'):
                errors.append(f"Parties: {result['error']}")
            
            # Sync Party Addresses
            result = self.sync_party_addresses()
            total_processed += result['processed']
            total_created += result['created']
            total_updated += result['updated']
            if result.get('error'):
                errors.append(f"Party Addresses: {result['error']}")
            
            # Sync Branches
            result = self.sync_branches()
            total_processed += result['processed']
            total_created += result['created']
            total_updated += result['updated']
            if result.get('error'):
                errors.append(f"Branches: {result['error']}")
            
            log.status = 'SUCCESS' if not errors else 'FAILED'
            log.records_processed = total_processed
            log.records_created = total_created
            log.records_updated = total_updated
            log.error_message = '\n'.join(errors) if errors else None
            log.completed_at = timezone.now()
            log.save()
            
            return {
                'success': not errors,
                'processed': total_processed,
                'created': total_created,
                'updated': total_updated,
                'errors': errors
            }
            
        except Exception as e:
            log.status = 'FAILED'
            log.error_message = str(e)
            log.completed_at = timezone.now()
            log.save()
            raise
    
    def sync_products(self):
        log = SyncLog.objects.create(
            sync_type='PRODUCT',
            status='STARTED',
            triggered_by=self.triggered_by
        )
        
        created_count = 0
        updated_count = 0
        processed_count = 0
        
        try:
            with self.connection as conn:
                query = SAPConnection.get_products_query()
                results = conn.execute_query(query)
                
                for row in results:
                    processed_count += 1
                    item_code = row.get('ItemCode')
                    category = row.get('Category')  # OIL, BEVERAGES, or MART
                    
                    if not item_code:
                        continue
                    
                    # Data to update (excluding lookup fields)
                    product_data = {
                        'item_name': row.get('ItemName'),
                        'sal_factor2': row.get('SalFactor2'),
                        'tax_rate': row.get('U_Rev_tax_Rate'),
                        #'tax_code': row.get('TaxCode'),
                        'is_deleted': row.get('Deleted', 'N'),
                        'variety': row.get('U_Variety'),
                        'sal_pack_unit': row.get('SalPackUn'),
                        'brand': row.get('U_Brand'),
                    }
                    
                    # Lookup by BOTH item_code AND category
                    product, created = Product.objects.update_or_create(
                        item_code=item_code,
                        category=category,
                        defaults=product_data
                    )
                    
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1
            
            log.status = 'SUCCESS'
            log.records_processed = processed_count
            log.records_created = created_count
            log.records_updated = updated_count
            log.completed_at = timezone.now()
            log.save()
            
            return {
                'success': True,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count
            }
            
        except Exception as e:
            log.status = 'FAILED'
            log.error_message = str(e)
            log.completed_at = timezone.now()
            log.save()
            
            return {
                'success': False,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count,
                'error': str(e)
            }
    
    def sync_parties(self):
        log = SyncLog.objects.create(
            sync_type='PARTY',
            status='STARTED',
            triggered_by=self.triggered_by
        )

        created_count = 0
        updated_count = 0
        processed_count = 0

        try:
            with self.connection as conn:
                query = SAPConnection.get_parties_query()
                results = conn.execute_query(query)

                for row in results:
                    processed_count += 1
                    card_code = row.get('CardCode')
                    category = row.get('Category')  # ✅ OIL/BEVERAGES/MART

                    if not card_code:
                        continue

                    party_data = {
                        'card_name': row.get('CardName') or '',
                        'address': row.get('Address') or '',
                        'state': row.get('State1') or '',
                        'main_group': row.get('U_Main_Group') or '',
                        'chain': row.get('U_Chain') or '',
                        'country': row.get('Country') or '',
                        'card_type': row.get('CardType') or 'C',                        
                        'category': category or '',                     
                    }

                    party, created = Party.objects.update_or_create(
                        card_code=card_code,
                        category=category,  # ✅ Lookup by both
                        defaults=party_data
                    )

                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

            log.status = 'SUCCESS'
            log.records_processed = processed_count
            log.records_created = created_count
            log.records_updated = updated_count
            log.completed_at = timezone.now()
            log.save()

            return {
                'success': True,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count
            }

        except Exception as e:
            log.status = 'FAILED'
            log.error_message = str(e)
            log.completed_at = timezone.now()
            log.save()

            return {
                'success': False,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count,
                'error': str(e)
            }

    def sync_party_addresses(self):
        log = SyncLog.objects.create(
            sync_type='PARTY_ADDRESS',
            status='STARTED',
            triggered_by=self.triggered_by
        )

        created_count = 0
        updated_count = 0
        processed_count = 0

        try:
            with self.connection as conn:
                query = SAPConnection.get_party_addresses_query()
                results = conn.execute_query(query)

                for row in results:
                    processed_count += 1
                    card_code = row.get('CardCode')
                    address_name = row.get('Address')   # ✅ SAP column name is "Address"
                    category = row.get('Category')       # ✅ OIL/BEVERAGES/MART

                    if not card_code:
                        continue

                    address_data = {
                        'address_type': row.get('AdresType') or 'B',
                        'gst_number': row.get('GSTRegnNo') or '',
                        'state': row.get('State') or '',              # ✅ ADD
                        'city': row.get('City') or '',                # ✅ ADD
                        'zip_code': row.get('ZipCode') or '',         # ✅ ADD
                        'country': row.get('Country') or '',          # ✅ ADD
                        'full_address': (row.get('MainAddress') or '').strip(),
                        'category': category or '',                    # ✅ ADD
                    }

                    party_address, created = PartyAddress.objects.update_or_create(
                        card_code=card_code,
                        address_name=address_name or '',  # ✅ FIXED
                        category=category or '',           # ✅ ADD to lookup
                        defaults=address_data
                    )

                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

            log.status = 'SUCCESS'
            log.records_processed = processed_count
            log.records_created = created_count
            log.records_updated = updated_count
            log.completed_at = timezone.now()
            log.save()

            return {
                'success': True,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count
            }

        except Exception as e:
            log.status = 'FAILED'
            log.error_message = str(e)
            log.completed_at = timezone.now()
            log.save()

            return {
                'success': False,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count,
                'error': str(e)
            }

    def sync_branches(self):
        """Sync branches from SAP OBPL table"""
        log = SyncLog.objects.create(
            sync_type='BRANCH',
            status='STARTED',
            triggered_by=self.triggered_by
        )
        
        created_count = 0
        updated_count = 0
        processed_count = 0
        
        try:
            with self.connection as conn:
                query = SAPConnection.get_branches_query()
                results = conn.execute_query(query)
                
                for row in results:
                    processed_count += 1
                    bpl_id = row.get('BPLId')
                    category = row.get('Category')  # OIL, BEVERAGES, or MART
                    
                    if bpl_id is None:
                        continue
                    
                    branch_data = {
                        'bpl_name': row.get('BPLName'),
                    }
                    
                    # Lookup by BOTH bpl_id AND category (same item can exist in multiple DBs)
                    branch, created = Branch.objects.update_or_create(
                        bpl_id=bpl_id,
                        category=category,
                        defaults=branch_data
                    )
                    
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1
            
            log.status = 'SUCCESS'
            log.records_processed = processed_count
            log.records_created = created_count
            log.records_updated = updated_count
            log.completed_at = timezone.now()
            log.save()
            
            return {
                'success': True,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count
            }
            
        except Exception as e:
            log.status = 'FAILED'
            log.error_message = str(e)
            log.completed_at = timezone.now()
            log.save()
            
            return {
                'success': False,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count,
                'error': str(e)
            }

        # ---------------- SAP LOGIN ---------------- #

    def sap_login(self):
        login_url = f"{settings.HANA_SERVICE_LAYER_URL}/Login"

        payload = {
            "CompanyDB": settings.HANA_COMPANY_DB,
            "UserName": settings.HANA_USERNAME,
            "Password": settings.HANA_PASSWORD
        }

        self.sap_session = requests.Session()
        response = self.sap_session.post(login_url, json=payload, verify=False)

        if response.status_code != 200:
            raise Exception(f"SAP Login Failed: {response.text}")

        return response.json()
    
    # ---------------- MAP ORDER ---------------- #

    def map_order_to_sap(self, order):
        return {
            "CardCode": order.card_code,
            "DocDate": order.created_at.strftime("%Y-%m-%d"),
            "DocDueDate": str(order.delivery_date) if order.delivery_date else order.created_at.strftime("%Y-%m-%d"),
            "TaxDate": order.created_at.strftime("%Y-%m-%d"),
            "NumAtCard": order.po_number or "",
            "Comments": "",
            "ShipToCode": order.ship_to_address,  # ← directly string use karo
            "PayToCode": order.bill_to_address,   # ← directly string use karo
            "BPL_IDAssignedToInvoice": int(order.dispatch_from_id) if order.dispatch_from_id else 1,
            "DocumentLines": [
                {
                    "ItemCode": item.item_code,
                    "Quantity": float(item.qty),
                    "UnitPrice": float(item.basic_price),
                    "WarehouseCode": "GP-FG"
                }
                for item in order.items.all()
            ]
        }

# example 
# def map_order_to_sap(self, order):
#         return {
#                 "CardCode": "CUSTA000486",
#                 "DocDate": "2026-02-10",
#                 "DocDueDate": "2026-02-15",
#                 "TaxDate": "2026-02-10",
#                 "NumAtCard": "7801514523",
#                 "Comments": " ",
#                 "ShipToCode": "WAL MART INDIA PVT LTD LUDHIANA 4717",
#                 "PayToCode": "WAL MART INDIA PVT LTD LUDHIANA 4717",
#                 "BPL_IDAssignedToInvoice" : 2,
#                 "DocumentLines": [
#                   {
#                     "ItemCode": "FG0000145",
#                     "Quantity": 84,
#                     "UnitPrice": 1286,
#                     "WarehouseCode": "GP-FG"
#                   }
#                 ]
#         }

    # ---------------- CREATE SALES QUOTATION ---------------- #

    def create_sales_quotation(self, order):
        quotation_payload = self.map_order_to_sap(order)
 
        log = SalesQuotationLog.objects.create(
            order_id=order.id,
            status='STARTED',
            request_data=quotation_payload
        )

        try:
            if not hasattr(self, 'sap_session'):
                self.sap_login()
     
            url = f"{settings.HANA_SERVICE_LAYER_URL}/Quotations"

            response = self.sap_session.post(
                url,
                json=quotation_payload,
                verify=False
            )

            if response.status_code == 201:
                response_data = response.json()

                log.status = 'SUCCESS'
                log.response_data = response_data
                log.sap_doc_entry = response_data.get("DocEntry")
                log.sap_doc_num = response_data.get("DocNum")
                log.completed_at = timezone.now()
                log.save()

                return response_data

            else:
                log.status = 'FAILED'
                log.response_data = response.text
                log.error_message = response.text
                log.completed_at = timezone.now()
                log.save()

                raise Exception(response.text)

        except Exception as e:
            log.status = 'FAILED'
            log.error_message = str(e)
            log.completed_at = timezone.now()
            log.save()
            raise

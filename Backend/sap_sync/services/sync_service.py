import logging
import json
import re
import urllib3
from datetime import date, datetime
from django.db.models import Q
from django.utils import timezone
from ..models import Product, Party, PartyAddress, Branch, SyncLog
from .connection import SAPConnection
import requests
from django.conf import settings
from ..models import SalesQuotationLog
from orders.scheme_rules import (
    get_party_state_code,
    get_party_product_scheme,
    should_mirror_punjab_combo_scheme_qty,
)
from users.models import PartyProductAssignment, SchemeProduct

logger = logging.getLogger(__name__)


def get_scheme_item_code_raw(scheme_id):
    if not scheme_id:
        return None

    return (
        SchemeProduct.objects
        .filter(scheme_id=scheme_id)
        .values_list('item_code', flat=True)
        .first()
    )


def _state_code_candidates(state_code):
    raw_state_code = str(state_code or "").strip()
    if not raw_state_code:
        return []

    normalized = raw_state_code.upper()
    candidates = [raw_state_code, normalized]
    if normalized in {"PB", "PUNJAB"} or "PUNJAB" in normalized:
        candidates.extend(["PB", "Punjab", "PUNJAB"])

    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def _filter_by_state_code(queryset, state_code):
    state_filter = Q()
    for candidate in _state_code_candidates(state_code):
        state_filter |= Q(state_code__iexact=candidate)

    if not state_filter:
        return queryset.none()

    return queryset.filter(state_filter)


def _get_state_matched_scheme_ids(scheme_name, state_code):
    if not scheme_name or not state_code:
        return []

    queryset = SchemeProduct.objects.filter(
        scheme_name=scheme_name,
        is_active=True,
    )
    queryset = _filter_by_state_code(queryset, state_code)

    scheme_ids = []
    seen = set()
    for scheme_id in queryset.order_by("scheme_id").values_list("scheme_id", flat=True):
        if not scheme_id or scheme_id in seen:
            continue
        seen.add(scheme_id)
        scheme_ids.append(scheme_id)

    return scheme_ids


def get_scheme_item_codes_for_combo(scheme_id, state_code=None):
    if not scheme_id:
        return []

    seed = (
        SchemeProduct.objects
        .filter(scheme_id=scheme_id)
        .values("scheme_name", "state_code")
        .first()
    )
    if not seed or not seed.get("scheme_name"):
        item_code = get_scheme_item_code_raw(scheme_id)
        return [item_code] if item_code else []

    queryset = SchemeProduct.objects.filter(
        scheme_name=seed["scheme_name"],
        is_active=True,
    )
    preferred_state_code = state_code or seed.get("state_code")
    if preferred_state_code:
        state_queryset = _filter_by_state_code(queryset, preferred_state_code)
        if state_queryset.exists():
            queryset = state_queryset
        elif seed.get("state_code"):
            queryset = _filter_by_state_code(queryset, seed["state_code"])

    item_codes = []
    seen = set()
    for item_code in queryset.order_by("scheme_id").values_list("item_code", flat=True):
        if not item_code or item_code in seen:
            continue
        seen.add(item_code)
        item_codes.append(item_code)

    return item_codes


def get_party_combo_item_codes(card_code, scheme_id, category=None, state_code=None):
    if not card_code or not scheme_id:
        return []

    scheme_ids = [scheme_id]
    if state_code:
        seed = (
            SchemeProduct.objects
            .filter(scheme_id=scheme_id)
            .values("scheme_name")
            .first()
        )
        state_scheme_ids = _get_state_matched_scheme_ids(
            seed.get("scheme_name") if seed else None,
            state_code,
        )
        if state_scheme_ids:
            scheme_ids = list(dict.fromkeys(state_scheme_ids + [scheme_id]))

    queryset = PartyProductAssignment.objects.filter(
        card_code=card_code,
        scheme_id__in=scheme_ids,
        is_active=True,
    )
    if category:
        queryset = queryset.filter(category=category)

    item_codes = []
    seen = set()
    for item_code in queryset.order_by("id").values_list("item_code", flat=True):
        if not item_code or item_code in seen:
            continue
        seen.add(item_code)
        item_codes.append(item_code)

    return item_codes


def _normalize_combo_component_name(value):
    text = str(value or "").upper()
    text = re.sub(r"\b\d+(?:\.\d+)?\s*PCS?\b", " ", text)
    text = re.sub(r"\bPCS?\b", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def get_party_combo_component_item_codes(card_code, item_name, category=None, exclude_item_code=None):
    if not card_code or not item_name or "+" not in str(item_name):
        return []

    components = [
        _normalize_combo_component_name(part)
        for part in str(item_name).split("+")
        if _normalize_combo_component_name(part)
    ]
    if not components:
        return []

    exclude_normalized = str(exclude_item_code).strip().upper() if exclude_item_code else None

    assignments = PartyProductAssignment.objects.filter(
        card_code=card_code,
        is_active=True,
    )
    if category:
        assignments = assignments.filter(category=category)

    item_codes = []
    seen = set()
    for assignment in assignments.order_by("item_code"):
        code = str(assignment.item_code or "").strip()
        if not code:
            continue
        # Explicitly skip the main combo item code
        if exclude_normalized and code.upper() == exclude_normalized:
            continue

        product = Product.objects.filter(
            item_code=assignment.item_code,
            category=assignment.category,
        ).first()
        product_name = _normalize_combo_component_name(
            getattr(product, "item_name", None)
        )
        logger.warning(
            "COMBO_COMPONENT_DEBUG | code=%r product=%r product_name=%r",
            code, getattr(product, "item_name", None), product_name,
        )
        if not product_name:
            continue

        # Skip products that are themselves combo items
        if "+" in getattr(product, "item_name", "") or "+" in product_name:
            continue

        matched = [c for c in components if c and c in product_name]
        unmatched = [c for c in components if c and c not in product_name]
        logger.warning(
            "COMBO_COMPONENT_DEBUG | code=%r matched=%r unmatched=%r",
            code, matched, unmatched,
        )
        if matched and unmatched:
            if code in seen:
                continue
            seen.add(code)
            item_codes.append(code)

    logger.warning("COMBO_COMPONENT_DEBUG | final item_codes=%r", item_codes)
    return item_codes


def print_sap_payload(label, payload):
    formatted_payload = json.dumps(payload, indent=2, default=str)
    print(f"{label}\n{formatted_payload}")
    logger.warning("%s\n%s", label, formatted_payload)


def _to_float(value, default=0.0):
    try:
        if value in (None, ""):
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _get_sap_line_quantity(item):
    if isinstance(item, dict):
        return _to_float(item.get("qty"), 0)
    return _to_float(getattr(item, "qty", None), 0)


def _get_sap_unit_price(item):
    basic_price = _to_float(getattr(item, "basic_price", None), 0)
    market_price = _to_float(getattr(item, "market_price", None), 0)

    if market_price > 0:
        return market_price

    return basic_price


def get_party_item_unit_price(card_code, item_code, category=None, default=0.0):
    if not card_code or not item_code:
        return float(default)

    queryset = PartyProductAssignment.objects.filter(
        card_code=card_code,
        item_code=item_code,
        is_active=True,
    )
    if category:
        queryset = queryset.filter(category=category)

    assignment = queryset.order_by("id").first()
    if assignment:
        return _to_float(getattr(assignment, "basic_rate", None), default)

    return float(default)


class SyncService:
    def __init__(self, triggered_by='manual'):
        self.triggered_by = triggered_by
        self.connection = SAPConnection()
        self.sap_timeout = (
            getattr(settings, "HANA_CONNECT_TIMEOUT", None) or 15,
            getattr(settings, "HANA_READ_TIMEOUT", None) or 120,
        )

    def _post_with_ssl_fallback(self, url, payload):
        try:
            return self.sap_session.post(
                url,
                json=payload,
                verify=self.sap_verify,
                timeout=self.sap_timeout,
            )
        except requests.exceptions.SSLError:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            self.sap_verify = False
            self.sap_session.verify = False
            return self.sap_session.post(
                url,
                json=payload,
                verify=False,
                timeout=self.sap_timeout,
            )

    @staticmethod
    def _as_trimmed(value, max_len=None):
        text = '' if value is None else str(value).strip()
        if max_len and len(text) > max_len:
            return text[:max_len]
        return text
    
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
        row_errors = []

        try:
            with self.connection as conn:
                query = SAPConnection.get_party_addresses_query()
                results = conn.execute_query(query)

                for row in results:
                    processed_count += 1
                    card_code = self._as_trimmed(row.get('CardCode'), 50)
                    address_name = self._as_trimmed(row.get('Address'), 100)
                    category = self._as_trimmed(row.get('Category'), 20)

                    if not card_code:
                        continue

                    try:
                        address_data = {
                            'address_type': self._as_trimmed(row.get('AdresType') or 'B', 1) or 'B',
                            'gst_number': self._as_trimmed(row.get('GSTRegnNo'), 50),
                            'state': self._as_trimmed(row.get('State'), 100),
                            'city': self._as_trimmed(row.get('City'), 100),
                            'zip_code': self._as_trimmed(row.get('ZipCode'), 20),
                            'country': self._as_trimmed(row.get('Country'), 50),
                            'full_address': self._as_trimmed(row.get('MainAddress')),
                            'category': category,
                        }

                        _, created = PartyAddress.objects.update_or_create(
                            card_code=card_code,
                            address_name=address_name,
                            category=category,
                            defaults=address_data
                        )

                        if created:
                            created_count += 1
                        else:
                            updated_count += 1
                    except Exception as row_error:
                        row_errors.append(
                            f"{card_code}/{address_name or '-'}: {str(row_error)}"
                        )

            log.status = 'SUCCESS'
            log.records_processed = processed_count
            log.records_created = created_count
            log.records_updated = updated_count
            if row_errors:
                log.error_message = '\n'.join(row_errors[:25])
            log.completed_at = timezone.now()
            log.save()

            return {
                'success': True,
                'processed': processed_count,
                'created': created_count,
                'updated': updated_count,
                'warnings': row_errors[:25]
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
        self.sap_verify = (
            settings.HANA_SSL_CA_BUNDLE
            if getattr(settings, "HANA_SSL_CA_BUNDLE", "")
            else getattr(settings, "HANA_SSL_VERIFY", True)
        )
        if self.sap_verify is False:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        self.sap_session.verify = self.sap_verify
        
        try:
            response = self._post_with_ssl_fallback(login_url, payload)
        except requests.RequestException as e:
            raise Exception(
                f"SAP Login connection failed ({login_url}, timeout={self.sap_timeout}): {str(e)}"
            )

        if response.status_code != 200:
            raise Exception(f"SAP Login Failed: {response.text}")

        login_data = response.json()
        logger.info(
            "SAP Login success | CompanyDB=%s | User=%s | SessionId=%s",
            settings.HANA_COMPANY_DB,
            settings.HANA_USERNAME,
            login_data.get("SessionId", "N/A"),
        )
        return login_data
    
    # ---------------- MAP ORDER ---------------- #

    def map_order_to_sap(self, order):
        def _as_iso_date(value, fallback):
            if isinstance(value, datetime):
                return value.date().isoformat()
            if isinstance(value, date):
                return value.isoformat()
            if isinstance(value, str):
                try:
                    return datetime.fromisoformat(value).date().isoformat()
                except ValueError:
                    return fallback.isoformat()
            return fallback.isoformat()

        document_lines = []
            
        for item in order.items.all():
            order_qty = _get_sap_line_quantity(item)
            item_unit_price = _get_sap_unit_price(item)
            card_code = getattr(order, "card_code", "")
            party_state_code = None
            item_code = getattr(item, "item_code", "")
            category = getattr(item, "category", "")
            scheme_obj = getattr(item, "scheme", None)
            raw_scheme_id = item.__dict__.get("scheme_id") or getattr(scheme_obj, "scheme_id", None)
            scheme_qty = float(getattr(item, "qty_scheme", 0) or 0)
            should_mirror_combo_qty = should_mirror_punjab_combo_scheme_qty(
                card_code,
                item_name=getattr(item, "item_name", None),
                scheme_name=getattr(scheme_obj, "scheme_name", None),
            )

            if raw_scheme_id in (None, "") and (scheme_qty > 0 or should_mirror_combo_qty):
                scheme_obj = get_party_product_scheme(
                    card_code=card_code,
                    item_code=item_code,
                    category=category,
                )
                raw_scheme_id = getattr(scheme_obj, "scheme_id", None)
                should_mirror_combo_qty = should_mirror_punjab_combo_scheme_qty(
                    card_code,
                    item_name=getattr(item, "item_name", None),
                    scheme_name=getattr(scheme_obj, "scheme_name", None),
                )

            scheme_item_codes = []
            combo_component_codes = []
            if should_mirror_combo_qty:
                party_state_code = get_party_state_code(card_code)
                combo_component_codes = get_party_combo_component_item_codes(
                    card_code,
                    getattr(item, "item_name", ""),
                    category,
                    exclude_item_code=item_code,
                )
                logger.warning(
                    "MAP_ORDER_DEBUG | item_code=%r combo_component_codes=%r",
                    item_code, combo_component_codes,
                )
                if raw_scheme_id not in (None, ""):
                    try:
                        raw_scheme_id_int = int(raw_scheme_id)
                        scheme_item_codes = get_scheme_item_codes_for_combo(
                            raw_scheme_id_int,
                            party_state_code,
                        )
                    except (SchemeProduct.DoesNotExist, TypeError, ValueError):
                        logger.warning(
                            "Skipping invalid scheme mapping for order item %s with raw scheme_id=%r",
                            getattr(item, "id", None),
                            raw_scheme_id,
                        )
                scheme_item_codes = list(dict.fromkeys(code for code in scheme_item_codes if code))
            elif raw_scheme_id not in (None, ""):
                try:
                    raw_scheme_id_int = int(raw_scheme_id)
                    scheme_item_code = get_scheme_item_code_raw(raw_scheme_id_int)
                    scheme_item_codes = [scheme_item_code] if scheme_item_code else []
                except (SchemeProduct.DoesNotExist, TypeError, ValueError):
                    logger.warning(
                        "Skipping invalid scheme mapping for order item %s with raw scheme_id=%r",
                        getattr(item, "id", None),
                        raw_scheme_id,
                    )

            # Line 1: always the ordered item at its price
            document_lines.append(
                {
                    "ItemCode": item_code,
                    "Quantity": order_qty,
                    "UnitPrice": item_unit_price,
                    "WarehouseCode": "GP-FG",
                }
            )

            if should_mirror_combo_qty:
                scheme_qty = order_qty

            if should_mirror_combo_qty:
                if combo_component_codes:
                    # Explicit component assignments — add each at party price
                    for comp_code in combo_component_codes:
                        document_lines.append(
                            {
                                "ItemCode": comp_code,
                                "Quantity": order_qty,
                                "UnitPrice": get_party_item_unit_price(
                                    card_code, comp_code, category, item_unit_price
                                ),
                                "WarehouseCode": "GP-FG",
                            }
                        )
                elif len(scheme_item_codes) == 1:
                    # Single scheme item, no separate component found — use it as
                    # the combo component proxy at party price (then also added free below)
                    comp_code = scheme_item_codes[0]
                    if comp_code != item_code:
                        document_lines.append(
                            {
                                "ItemCode": comp_code,
                                "Quantity": order_qty,
                                "UnitPrice": get_party_item_unit_price(
                                    card_code, comp_code, category, item_unit_price
                                ),
                                "WarehouseCode": "GP-FG",
                            }
                        )

            if scheme_item_codes and scheme_qty > 0:
                for scheme_item_code in scheme_item_codes:
                    if scheme_item_code == item_code:
                        continue

                    document_lines.append(
                        {
                            "ItemCode": scheme_item_code,
                            "Quantity": scheme_qty,
                            "UnitPrice": 0.0,
                            "WarehouseCode": "GP-FG",
                        }
                    )


        posting_date = timezone.localdate()
        due_date = _as_iso_date(getattr(order, "delivery_date", None), posting_date)

        payload = {
            "CardCode": order.card_code,
            "DocDate": posting_date.isoformat(),
            "DocDueDate": due_date,
            "TaxDate": posting_date.isoformat(),
            "Comments": " ",
            "ShipToCode": order.ship_to_address,
            "PayToCode": order.bill_to_address,
            "BPL_IDAssignedToInvoice": order.dispatch_from_id,
            "DocumentLines": document_lines,
        }
        print_sap_payload(
            f"SAP quotation payload for order {getattr(order, 'id', 'N/A')}:",
            payload,
        )
    
        return payload

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
            print(f"SAP quotation URL: {url}")
            logger.warning("SAP quotation URL: %s", url)

            response = self._post_with_ssl_fallback(url, quotation_payload)
            logger.info(
                "SAP Quotations response | status=%s | body=%s",
                response.status_code,
                response.text[:500],
            )
            if response.status_code == 201:
                response_data = response.json()

                # order.status = 6
                order.save(update_fields=['status'])  
                
                order.sap_created = True
                order.save(update_fields=['sap_created'])

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

from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from sap_sync.services.sync_service import SyncService


class SyncServiceMapOrderToSapTests(SimpleTestCase):
    def test_map_order_to_sap_uses_ordered_qty_instead_of_litres(self):
        item = SimpleNamespace(
            item_code="FG0000003",
            qty=10,
            boxes=240,
            ltrs=240,
            basic_price=1202,
            qty_scheme=0,
        )
        order = SimpleNamespace(
            id=63,
            card_code="CUSTA001070",
            delivery_date=date(2026, 4, 13),
            ship_to_address="SAKSHI SALES DELHI",
            bill_to_address="SAKSHI SALES DELHI",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(payload["DocumentLines"][0]["ItemCode"], "FG0000003")
        self.assertEqual(payload["DocumentLines"][0]["Quantity"], 10.0)
        self.assertEqual(payload["DocumentLines"][0]["UnitPrice"], 1202.0)
        self.assertEqual(payload["DocDate"], "2026-04-11")
        self.assertEqual(payload["DocDueDate"], "2026-04-13")

    def test_map_order_to_sap_falls_back_when_qty_is_missing(self):
        item = SimpleNamespace(
            item_code="FG0000005",
            qty=0,
            boxes=12,
            ltrs=24,
            basic_price=0,
            market_price=0,
            qty_scheme=0,
        )
        order = SimpleNamespace(
            id=64,
            card_code="CUSTA001070",
            delivery_date=date(2026, 4, 13),
            ship_to_address="SAKSHI SALES DELHI",
            bill_to_address="SAKSHI SALES DELHI",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(payload["DocumentLines"][0]["Quantity"], 12.0)

    def test_map_order_to_sap_uses_market_price_when_basic_price_is_zero(self):
        item = SimpleNamespace(
            item_code="FG0000007",
            qty=5,
            boxes=5,
            ltrs=10,
            basic_price=0,
            market_price=975.5,
            qty_scheme=0,
        )
        order = SimpleNamespace(
            id=65,
            card_code="CUSTA001070",
            delivery_date=date(2026, 4, 13),
            ship_to_address="SAKSHI SALES DELHI",
            bill_to_address="SAKSHI SALES DELHI",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(payload["DocumentLines"][0]["UnitPrice"], 975.5)

    def test_map_order_to_sap_adds_multiple_scheme_lines_with_zero_price(self):
        item = SimpleNamespace(
            item_code="FG0000007",
            item_name="Jivo Mustard Oil 1 LTR",
            category="OIL",
            qty=5,
            boxes=5,
            ltrs=5,
            basic_price=975.5,
            market_price=0,
            qty_scheme=3,
            schemes=[
                SimpleNamespace(scheme_id=201, scheme=None, qty_scheme=2),
                SimpleNamespace(scheme_id=202, scheme=None, qty_scheme=1),
            ],
        )
        order = SimpleNamespace(
            id=72,
            card_code="CUSTA001070",
            delivery_date=date(2026, 4, 13),
            ship_to_address="SAKSHI SALES DELHI",
            bill_to_address="SAKSHI SALES DELHI",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch(
            "sap_sync.services.sync_service.get_scheme_item_code_raw",
            side_effect=lambda scheme_id: {201: "FG-SCHEME-A", 202: "FG-SCHEME-B"}[scheme_id],
        ), patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(len(payload["DocumentLines"]), 3)
        self.assertEqual(payload["DocumentLines"][0]["ItemCode"], "FG0000007")
        self.assertEqual(payload["DocumentLines"][1]["ItemCode"], "FG-SCHEME-A")
        self.assertEqual(payload["DocumentLines"][1]["Quantity"], 2.0)
        self.assertEqual(payload["DocumentLines"][1]["UnitPrice"], 0.0)
        self.assertEqual(payload["DocumentLines"][2]["ItemCode"], "FG-SCHEME-B")
        self.assertEqual(payload["DocumentLines"][2]["Quantity"], 1.0)
        self.assertEqual(payload["DocumentLines"][2]["UnitPrice"], 0.0)

    def test_map_order_to_sap_normalizes_legacy_web_quantity_shape(self):
        item = SimpleNamespace(
            item_code="FG0000003",
            item_name="Jivo Kachi Ghani 1 LTR",
            qty=240,
            pcs=20,
            boxes=12,
            ltrs=240,
            basic_price=1202,
            qty_scheme=0,
        )
        order = SimpleNamespace(
            id=63,
            card_code="CUSTA001070",
            delivery_date=date(2026, 4, 13),
            ship_to_address="SAKSHI SALES DELHI",
            bill_to_address="SAKSHI SALES DELHI",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(payload["DocumentLines"][0]["Quantity"], 12.0)

    def test_map_order_to_sap_sends_punjab_scheme_like_other_states(self):
        item = SimpleNamespace(
            item_code="FG-COMBO",
            item_name="Jivo 1 LTR + 1 LTR Combo",
            qty=240,
            pcs=20,
            boxes=12,
            ltrs=240,
            basic_price=1202,
            market_price=0,
            qty_scheme=60,
            scheme_id=99,
        )
        order = SimpleNamespace(
            id=66,
            card_code="PUNJAB-CUSTOMER",
            delivery_date=date(2026, 4, 13),
            ship_to_address="PUNJAB SHIP",
            bill_to_address="PUNJAB BILL",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.get_scheme_item_code_raw", return_value="FG-SCHEME"), \
            patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(len(payload["DocumentLines"]), 2)
        self.assertEqual(payload["DocumentLines"][0]["ItemCode"], "FG-COMBO")
        self.assertEqual(payload["DocumentLines"][0]["Quantity"], 12.0)
        self.assertEqual(payload["DocumentLines"][0]["UnitPrice"], 1202.0)
        self.assertEqual(payload["DocumentLines"][1]["ItemCode"], "FG-SCHEME")
        self.assertEqual(payload["DocumentLines"][1]["Quantity"], 60.0)
        self.assertEqual(payload["DocumentLines"][1]["UnitPrice"], 0.0)

    def test_map_order_to_sap_does_not_auto_resolve_punjab_combo_without_scheme_qty(self):
        item = SimpleNamespace(
            item_code="FG-COMBO",
            item_name="Jivo 1 LTR + 1 LTR Combo",
            category="OIL",
            qty=240,
            pcs=20,
            boxes=12,
            ltrs=240,
            basic_price=1202,
            market_price=0,
            qty_scheme=0,
        )
        order = SimpleNamespace(
            id=68,
            card_code="PUNJAB-CUSTOMER",
            delivery_date=date(2026, 4, 13),
            ship_to_address="PUNJAB SHIP",
            bill_to_address="PUNJAB BILL",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.get_party_product_scheme") as party_scheme, \
            patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 11)):
            payload = service.map_order_to_sap(order)

        party_scheme.assert_not_called()
        self.assertEqual(len(payload["DocumentLines"]), 1)
        self.assertEqual(payload["DocumentLines"][0]["ItemCode"], "FG-COMBO")
        self.assertEqual(payload["DocumentLines"][0]["Quantity"], 12.0)
        self.assertEqual(payload["DocumentLines"][0]["UnitPrice"], 1202.0)

    def test_map_order_to_sap_keeps_selected_scheme_quantity_for_punjab_combo(self):
        item = SimpleNamespace(
            item_code="FG0000003",
            item_name="COLD PRESS 5 LTR + EXTRA LIGHT OLIVE 1 LTR 4 PCS",
            category="OIL",
            qty=20,
            pcs=4,
            boxes=5,
            ltrs=100,
            basic_price=1255,
            market_price=0,
            qty_scheme=2,
            scheme_id=7,
        )
        item.__dict__["scheme_id"] = 7

        order = SimpleNamespace(
            id=22,
            card_code="CUSTA000007",
            delivery_date=date(2026, 4, 23),
            ship_to_address="PUNJAB SHIP",
            bill_to_address="PUNJAB BILL",
            dispatch_from_id=2,
            items=SimpleNamespace(all=lambda: [item]),
        )

        service = SyncService(triggered_by="test")

        with patch("sap_sync.services.sync_service.get_scheme_item_code_raw", return_value="FG0000005"), \
            patch("sap_sync.services.sync_service.timezone.localdate", return_value=date(2026, 4, 22)):
            payload = service.map_order_to_sap(order)

        self.assertEqual(len(payload["DocumentLines"]), 2)
        self.assertEqual(payload["DocumentLines"][0]["ItemCode"], "FG0000003")
        self.assertEqual(payload["DocumentLines"][0]["Quantity"], 5.0)
        self.assertEqual(payload["DocumentLines"][0]["UnitPrice"], 1255.0)
        self.assertEqual(payload["DocumentLines"][1]["ItemCode"], "FG0000005")
        self.assertEqual(payload["DocumentLines"][1]["Quantity"], 2.0)
        self.assertEqual(payload["DocumentLines"][1]["UnitPrice"], 0.0)

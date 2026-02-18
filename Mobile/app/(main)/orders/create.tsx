import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text, Surface, TextInput } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, RADIUS, GRADIENTS } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import {
  orderService,
  dispatchService,
  PartyAddress,
  productService,
  Product,
  CreateOrderPayload,
} from "@/src/services/order.service";
import { useRouter } from "expo-router";
import { Pressable } from "react-native-gesture-handler";

// ─── Per-item state (isolated for each row) ─────────────────────────────────
interface ItemRow {
  id: number;
  // cascade selects
  selectedCategory: string | null;
  selectedBrand: string | null;
  selectedVariety: string | null;
  selectedType: string | null;
  selectedProduct: number | null;
  // dropdown option lists
  brands: { label: string; value: string }[];
  varieties: { label: string; value: string }[];
  types: { label: string; value: string }[];
  products: { label: string; value: number }[];
  // numeric fields
  qty: string;
  pcs: string;
  salPackUnit: string;
  boxes: string;
  ltrs: string;
  marketPrice: string;
  basePrice: string;
  tax: string;
  itemTotal: string;
}

interface OrderItemType {
  id: number;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  variety: string;
  type: string;
  qty: number;
  pcs: number;
  boxes: number;
  ltrs: number;
  marketPrice: number;
  total: number;
  taxRate: number;
  basicPrice: number;
}

const emptyRow = (id: number): ItemRow => ({
  id,
  selectedCategory: null,
  selectedBrand: null,
  selectedVariety: null,
  selectedType: null,
  selectedProduct: null,
  brands: [],
  varieties: [],
  types: [],
  products: [],
  qty: "",
  pcs: "",
  salPackUnit: "",
  boxes: "",
  ltrs: "",
  marketPrice: "",
  basePrice: "",
  tax: "",
  itemTotal: "",
});

export default function CreateOrderScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [orderResult, setOrderResult] = useState<{ orderNumber: string; message: string; needsApproval: boolean } | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const router = useRouter();

  const today = new Date().toLocaleDateString("en-GB");

  // ── Order header ──────────────────────────────────────────────────────────
  const [partyName, setPartyName] = useState<string | null>(null);
  const [company, setCompany] = useState<number | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const [poNumber, setPoNumber] = useState("");
  const [comment, setComment] = useState("");
  const [delivery, setDeliveryDate] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // ── Address dropdowns ─────────────────────────────────────────────────────
  const [billToAddresses, setBillToAddresses] = useState<{ label: string; value: number }[]>([]);
  const [shipToAddresses, setShipToAddresses] = useState<{ label: string; value: number }[]>([]);
  const [selectedBillTo, setSelectedBillTo] = useState<number | null>(null);
  const [selectedShipTo, setSelectedShipTo] = useState<number | null>(null);

  // ── Master data ───────────────────────────────────────────────────────────
  const [parties, setParties] = useState<{ label: string; value: string }[]>([]);
  const [dispatches, setDispatches] = useState<{ label: string; value: number }[]>([]);
  const [companies, setCompanies] = useState<{ label: string; value: number }[]>([]);
  const [branches, setbranches] = useState<{ label: string; value: number }[]>([]);
  const [partyProducts, setPartyProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ label: string; value: string }[]>([]);

  // ── Item rows (each row has its own isolated state) ───────────────────────
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);

  // ── Confirmed order items ─────────────────────────────────────────────────
  const [orderItems, setOrderItems] = useState<OrderItemType[]>([]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const extractType = (itemName: string): string => {
    if (!itemName) return "Others";
    const pattern =
      /(\d+(?:\.\d+)?\s*(?:LTR|LITRE|LITER|L|ML|KG|KGS|GM|GMS|GRAM|G|PCS|PC|POUCH|TIN|JAR|BTL|CAN|BOTTLE|PACK|PKT|BOX)S?)\b/i;
    const match = itemName.toUpperCase().match(pattern);
    if (match) {
      let result = match[1].trim();
      result = result.replace(/(\d)([A-Z])/g, "$1 $2");
      return result;
    }
    return "Others";
  };

  /** Update a single field on a specific item row */
  const updateRow = (id: number, patch: Partial<ItemRow>) => {
    setItemRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  // ─── Fetch master data on mount ────────────────────────────────────────────
  useEffect(() => {
    fetchMasterData();
  }, []);

  // ─── Constants: active filters ────────────────────────────────────────────
  const ACTIVE_CATEGORY = "OIL";   // change to match exact string from API
  const ACTIVE_BRAND    = "JIVO";  // change to match exact string from API

  const fetchMasterData = async () => {
    try {
      setDataLoading(true);

      const partiesData = await orderService.getParties();
      // Filter: show only Oil-category parties
      const oilParties = (partiesData || []).filter(
        (p: any) => p.category?.toUpperCase() === ACTIVE_CATEGORY
      );
      // Fallback: if API doesn't return category on party, show all
      setParties(
        (oilParties.length > 0 ? oilParties : partiesData || []).map((p) => ({
          label: p.label,
          value: p.value,
        }))
      );

      const dispatchesData = await dispatchService.getDispatch();
      setDispatches((dispatchesData || []).map((d) => ({ label: d.name, value: d.id })));

      const branchesData = await orderService.getbranch("");
      setbranches((branchesData || []).map((d: any) => ({ label: d.bpl_name, value: d.bpl_id })));

      setCompanies([{ label: "Jivo Wellness", value: 1 }]);
    } catch (error) {
      Alert.alert("Error", "Failed to load data");
    } finally {
      setDataLoading(false);
    }
  };

  // ─── Party change → load addresses + products ─────────────────────────────
  /**
   * FIX 1 & 2: Auto-select first address AND filter by user's category.
   * We derive the user's category from their main_group name (adjust the
   * mapping below if your data uses different strings).
   */
  const getUserCategory = (): string | null => {
    if (!user?.main_group) return null;
    const raw = Array.isArray(user.main_group)
      ? user.main_group[0]?.name
      : user.main_group?.name;
    if (!raw) return null;
    // Normalize: "OIL" / "Oil" / "oil" all map to the same key
    return raw.toLowerCase();
  };

  const filterAddressesByCategory = (
    addresses: { label: string; value: number; category?: string }[],
    userCategory: string | null
  ) => {
    if (!userCategory) return addresses;
    // If the address object carries a category field, filter by it.
    // If your API doesn't include category on addresses, remove this filter
    // and the function just returns all addresses unchanged.
    const filtered = addresses.filter(
      (a: any) =>
        !a.category || a.category.toLowerCase() === userCategory
    );
    return filtered.length > 0 ? filtered : addresses; // fallback to all if nothing matches
  };

  const handlePartyChange = async (cardCode: string) => {
    setPartyName(cardCode);

    // Reset addresses
    setBillToAddresses([]);
    setShipToAddresses([]);
    setSelectedBillTo(null);
    setSelectedShipTo(null);

    // Reset product cascade
    setPartyProducts([]);
    setCategories([]);
    setItemRows([]);
    setOrderItems([]);

    try {
      const addressData = await orderService.getAddresses(cardCode);

      const mapAddr = (addr: PartyAddress) => ({
        label:
          (addr.address_id || "") +
          (addr.address_name ? ` - ${addr.address_name.substring(0, 30)}...` : ""),
        value: addr.id,
        category: (addr as any).category,
      });

      const filterOil = (list: any[]) => {
        const filtered = list.filter(
          (a) => !a.category || a.category.toUpperCase() === ACTIVE_CATEGORY
        );
        return filtered.length > 0 ? filtered : list; // fallback to all
      };

      const rawBillTo = filterOil((addressData.bill_to || []).map(mapAddr));
      const rawShipTo = filterOil((addressData.ship_to || []).map(mapAddr));

      const finalBillTo = rawBillTo.length > 0 ? rawBillTo : rawShipTo;
      const finalShipTo = rawShipTo.length > 0 ? rawShipTo : rawBillTo;

      setBillToAddresses(finalBillTo);
      setShipToAddresses(finalShipTo);

      // Auto-select first address
      if (finalBillTo.length > 0) setSelectedBillTo(finalBillTo[0].value);
      if (finalShipTo.length > 0) setSelectedShipTo(finalShipTo[0].value);

      // Load party products — filter to OIL category + JIVO brand only
      const allProducts = await orderService.getPartyProducts(cardCode);
      const filteredProducts = allProducts.filter(
        (p: any) =>
          p.category?.toUpperCase() === ACTIVE_CATEGORY &&
          p.brand?.toUpperCase() === ACTIVE_BRAND
      );
      // Fallback: if filter yields nothing, use all (avoids blank screen)
      const products = filteredProducts.length > 0 ? filteredProducts : allProducts;
      setPartyProducts(products);

      // Only show OIL category in the dropdown
      const uniqueCategories = [
        ...new Set<string>(products.map((p: any) => p.category).filter(Boolean)),
      ];
      setCategories(uniqueCategories.sort().map((c) => ({ label: c, value: c })));
    } catch (err) {
      console.log("Failed to fetch party data:", err);
    }
  };

  // ─── Per-row cascade handlers ──────────────────────────────────────────────

  const handleRowCategoryChange = (rowId: number, category: string) => {
    const filtered = partyProducts.filter((p: any) => p.category === category);
    const uniqueBrands = [
      ...new Set<string>(filtered.map((p: any) => p.brand).filter(Boolean)),
    ];
    updateRow(rowId, {
      selectedCategory: category,
      selectedBrand: null,
      selectedVariety: null,
      selectedType: null,
      selectedProduct: null,
      brands: uniqueBrands.sort().map((b) => ({ label: b, value: b })),
      varieties: [],
      types: [],
      products: [],
      pcs: "",
      salPackUnit: "",
      tax: "",
      basePrice: "",
      marketPrice: "",
      qty: "",
      boxes: "",
      ltrs: "",
      itemTotal: "",
    });
  };

  const handleRowBrandChange = (rowId: number, brand: string, row: ItemRow) => {
    const filtered = partyProducts.filter(
      (p: any) => p.category === row.selectedCategory && p.brand === brand
    );
    const uniqueVarieties = [
      ...new Set<string>(filtered.map((p: any) => p.variety).filter(Boolean)),
    ];
    updateRow(rowId, {
      selectedBrand: brand,
      selectedVariety: null,
      selectedType: null,
      selectedProduct: null,
      varieties: uniqueVarieties.sort().map((v) => ({ label: v, value: v })),
      types: [],
      products: [],
    });
  };

  const handleRowVarietyChange = (rowId: number, variety: string, row: ItemRow) => {
    const filtered = partyProducts.filter(
      (p: any) =>
        p.category === row.selectedCategory &&
        p.brand === row.selectedBrand &&
        p.variety === variety
    );
    const typesSet = new Set<string>();
    filtered.forEach((p: any) => typesSet.add(extractType(p.item_name)));
    const sortedTypes = [...typesSet].sort((a, b) => {
      if (a === "Others") return 1;
      if (b === "Others") return -1;
      return parseFloat(a) - parseFloat(b);
    });
    updateRow(rowId, {
      selectedVariety: variety,
      selectedType: null,
      selectedProduct: null,
      types: sortedTypes.map((t) => ({ label: t, value: t })),
      products: [],
    });
  };

  const handleRowTypeChange = (rowId: number, type: string, row: ItemRow) => {
    const filtered = partyProducts.filter(
      (p: any) =>
        p.category === row.selectedCategory &&
        p.brand === row.selectedBrand &&
        p.variety === row.selectedVariety &&
        extractType(p.item_name) === type
    );
    updateRow(rowId, {
      selectedType: type,
      selectedProduct: null,
      products: filtered.map((p: any) => ({
        label: `${p.item_name} (₹${p.basic_rate})`,
        value: p.item_code,
      })),
    });
  };

  const handleRowProductChange = (rowId: number, productId: number) => {
    const product = partyProducts.find((p: any) => p.item_code === productId);
    if (product) {
      const pcs = product.sal_factor2?.toString() || "0";
      const salPackUnit = product.sal_pack_unit?.toString() || "0";
      updateRow(rowId, {
        selectedProduct: productId,
        pcs,
        salPackUnit,
        tax: product.tax_rate ? product.tax_rate.toString() : "0",
        basePrice: product.basic_rate?.toString() || "0",
        marketPrice: product.basic_rate?.toString() || "0",
      });
    }
  };

  const handleRowQtyChange = (rowId: number, value: string, row: ItemRow) => {
    const qtyNum = parseFloat(value) || 0;
    const pcsNum = parseFloat(row.pcs) || 0;
    const packUnit = parseFloat(row.salPackUnit) || 0;
    const priceNum = parseFloat(row.marketPrice) || 0;
    updateRow(rowId, {
      qty: value,
      boxes: (qtyNum * pcsNum).toString(),
      ltrs: (qtyNum * packUnit).toFixed(2),
      itemTotal: (qtyNum * priceNum).toFixed(2),
    });
  };

  const handleRowMarketPriceChange = (rowId: number, value: string, row: ItemRow) => {
    const qtyNum = parseFloat(row.qty) || 0;
    const priceNum = parseFloat(value) || 0;
    updateRow(rowId, {
      marketPrice: value,
      itemTotal: (qtyNum * priceNum).toFixed(2),
    });
  };

  // ─── Add / remove item rows ────────────────────────────────────────────────

  const addItem = () => {
    const newId = Date.now();
    setItemRows((prev) => [...prev, emptyRow(newId)]);
  };

  const removeItem = (id: number) => {
    setItemRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ─── Confirm a row into orderItems ────────────────────────────────────────

  const addItemToOrder = (rowId: number) => {
    const row = itemRows.find((r) => r.id === rowId);
    if (!row) return;

    if (!row.selectedCategory || !row.selectedProduct || !row.boxes) {
      Alert.alert("Error", "Please fill all required fields");
      return;
    }

    const product = partyProducts.find((p: any) => p.item_code === row.selectedProduct);
    if (!product) return;

    const newItem: OrderItemType = {
      id: Date.now(),
      itemCode: product.item_code || "",
      itemName: product.item_name || "",
      category: row.selectedCategory || "",
      brand: row.selectedBrand || "",
      variety: row.selectedVariety || "",
      type: row.selectedType || "",
      qty: parseFloat(row.qty) || 0,
      pcs: parseFloat(row.pcs) || 0,
      boxes: parseFloat(row.boxes) || 0,
      ltrs: parseFloat(row.ltrs) || 0,
      marketPrice: parseFloat(row.marketPrice) || 0,
      total: parseFloat(row.itemTotal) || 0,
      taxRate: parseFloat(row.tax) || 0,
      basicPrice: parseFloat(row.basePrice) || product.basic_rate || 0,
    };

    setOrderItems((prev) => [...prev, newItem]);
    // FIX 3: Remove the confirmed row so the next item starts fresh
    setItemRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const removeOrderItem = (id: number) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id));
  };

  // ─── Totals (FIX 5) ────────────────────────────────────────────────────────

  const totalWithoutTax = orderItems
    .reduce((sum, item) => sum + item.marketPrice * item.qty, 0)
    .toFixed(2);

  const totalTaxAmount = orderItems
    .reduce((sum, item) => {
      const base = item.marketPrice * item.qty;
      return sum + (base * item.taxRate) / 100;
    }, 0)
    .toFixed(2);

  const grandTotal = (parseFloat(totalWithoutTax) + parseFloat(totalTaxAmount)).toFixed(2);

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!partyName || orderItems.length === 0) {
      Alert.alert("Error", "Select a party and add at least one item");
      return;
    }

    try {
      setLoading(true);
      const payload: CreateOrderPayload = {
        user_id: user?.id || 0,
        card_code: partyName,
        card_name: parties.find((p) => p.value === partyName)?.label ?? "",
        bill_to_id: selectedBillTo ?? 0,
        bill_to_address: billToAddresses.find((a) => a.value === selectedBillTo)?.label ?? "",
        ship_to_id: selectedShipTo ?? 0,
        ship_to_address: shipToAddresses.find((a) => a.value === selectedShipTo)?.label ?? "",
        dispatch_from_id: branch ?? 0,
        dispatch_from_name: dispatches.find((d) => d.value === branch)?.label ?? "",
        delivery_date: delivery,
        company: String(company ?? ""),
        po_number: String(poNumber ?? ""),
        items: orderItems.map((item) => ({
          item_code: String(item.itemCode ?? ""),
          item_name: String(item.itemName ?? ""),
          category: String(item.category ?? ""),
          brand: String(item.brand ?? ""),
          variety: String(item.variety ?? ""),
          item_type: String(item.type ?? ""),
          qty: Number(item.qty) || 0,
          pcs: Number(item.pcs) || 0,
          boxes: Number(item.boxes) || 0,
          ltrs: Number(item.ltrs) || 0,
          market_price: Number(item.marketPrice) || 0,
          total: Number(item.total) || 0,
          tax_rate: Number(item.taxRate) || 0,
          basic_price: Number(item.basicPrice),
        })),
      };

      const response = await orderService.createOrder(payload);

      // Backend returns: { id, order_number, message, needs_approval, ... }
      if (response?.order_number || response?.message?.includes("Order sent")) {
        setOrderResult({
          orderNumber: response.order_number || "",
          message: response.message || "Order created successfully",
          needsApproval: response.needs_approval || false,
        });
        setSuccessModal(true);
        // Reset form
        handleClear();
      } else {
        if (Platform.OS === "web") {
          window.alert("Something went wrong. Please try again.");
        } else {
          Alert.alert("Error", "Something went wrong. Please try again.");
        }
      }
    } catch (error) {
      console.log("Error creating order:", error);
      if (Platform.OS === "web") {
        window.alert("Failed to create order. Please try again.");
      } else {
        Alert.alert("Error", "Failed to create order");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPartyName(null);
    setBranch(null);
    setCompany(null);
    setPoNumber("");
    setComment("");
    setItemRows([]);
    setOrderItems([]);
    setBillToAddresses([]);
    setShipToAddresses([]);
    setSelectedBillTo(null);
    setSelectedShipTo(null);
    setDeliveryDate("");
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Order Details Card ─────────────────────────────────────────── */}
        <Surface style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Order Details</Text>
            <Text style={styles.dateText}>{today}</Text>
          </View>

          <View style={styles.field}>
            <Dropdown
              label="Party Name *"
              data={parties}
              onChange={handlePartyChange}
              value={partyName}
              placeholder="Select party..."
              searchable={true}
              icon="storefront-outline"
            />
          </View>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Dropdown
                label="Dispatch From"
                data={branches}
                value={branch}
                onChange={setBranch}
                placeholder="Select..."
                icon="business-outline"
              />
            </View>
            <View style={styles.halfField}>
              <Dropdown
                label="Company *"
                data={companies}
                value={company}
                onChange={setCompany}
                placeholder="Select..."
                icon="briefcase-outline"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Dropdown
              label="Bill To Address"
              data={billToAddresses}
              value={selectedBillTo}
              onChange={setSelectedBillTo}
              placeholder="Select Bill To..."
            />
          </View>

          <View style={styles.field}>
            <Dropdown
              label="Ship To Address"
              data={shipToAddresses}
              value={selectedShipTo}
              onChange={setSelectedShipTo}
              placeholder="Select Ship To..."
            />
          </View>

          <View style={styles.field}>
            <TextInput
              label="PO Number"
              value={poNumber}
              onChangeText={setPoNumber}
              mode="outlined"
              textColor={COLORS.black}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={<TextInput.Icon icon="file-document-outline" />}
            />
          </View>

          {/* Delivery Date — web: native <input type="date">, app: DateTimePicker */}
          <View style={styles.field}>
            {Platform.OS === "web" ? (
              // ── Web: plain HTML date input styled to match TextInput ──
              <View style={styles.webDateWrapper}>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={COLORS.textSecondary}
                  style={styles.webDateIcon}
                />
                <View style={styles.webDateInner}>
                  <Text style={styles.webDateLabel}>Delivery Date</Text>
                  {/* @ts-ignore — 'input' is valid on web */}
                  <input
                    type="date"
                    value={delivery}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e: any) => setDeliveryDate(e.target.value)}
                    style={{
                      border: "none",
                      outline: "none",
                      fontSize: 14,
                      color: COLORS.black,
                      background: "transparent",
                      width: "100%",
                      cursor: "pointer",
                    }}
                  />
                </View>
              </View>
            ) : (
              // ── Native (iOS / Android): DateTimePicker ────────────────
              <>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setShowPicker(true)}>
                  <TextInput
                    label="Delivery Date"
                    value={delivery}
                    mode="outlined"
                    editable={false}
                    pointerEvents="none"
                    textColor={COLORS.black}
                    style={styles.input}
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.primary}
                    left={<TextInput.Icon icon="calendar-outline" />}
                  />
                </TouchableOpacity>

                {showPicker && (
                  <DateTimePicker
                    value={delivery ? new Date(delivery) : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={new Date()}
                    onChange={(event, selectedDate) => {
                      setShowPicker(false);
                      if (selectedDate) {
                        const formatted = selectedDate.toISOString().split("T")[0];
                        setDeliveryDate(formatted);
                      }
                    }}
                  />
                )}
              </>
            )}
          </View>
        </Surface>

        {/* ── Items Section ──────────────────────────────────────────────── */}
        <Surface style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cube" size={20} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Items</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addItem}>
              <Ionicons name="add" size={18} color={COLORS.textLight} />
              <Text style={styles.addBtnText}>New Item</Text>
            </TouchableOpacity>
          </View>

          {itemRows.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyText}>No items added</Text>
              <Text style={styles.emptySubtext}>Tap "New Item" to add products</Text>
            </View>
          ) : (
            itemRows.map((row, index) => (
              <View key={row.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemNumber}>Item {index + 1}</Text>
                  <TouchableOpacity onPress={() => removeItem(row.id)}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>

                {/* Category */}
                <View style={styles.field}>
                  <Dropdown
                    label="Category *"
                    data={categories}
                    value={row.selectedCategory}
                    onChange={(val) => handleRowCategoryChange(row.id, val)}
                    placeholder="Select Category..."
                    icon="grid-outline"
                  />
                </View>

                {/* Brand + Variety */}
                <View style={styles.row}>
                  <View style={styles.halfField}>
                    <Dropdown
                      label="Brand"
                      data={row.brands}
                      value={row.selectedBrand}
                      onChange={(val) => handleRowBrandChange(row.id, val, row)}
                      placeholder="Select Brand..."
                      icon="pricetag-outline"
                      disabled={!row.selectedCategory}
                    />
                  </View>
                  <View style={styles.halfField}>
                    <Dropdown
                      label="Variety"
                      data={row.varieties}
                      value={row.selectedVariety}
                      onChange={(val) => handleRowVarietyChange(row.id, val, row)}
                      placeholder="Select Variety..."
                      icon="layers-outline"
                      disabled={!row.selectedBrand}
                    />
                  </View>
                </View>

                {/* Type */}
                <View style={styles.field}>
                  <Dropdown
                    label="Type"
                    data={row.types}
                    value={row.selectedType}
                    onChange={(val) => handleRowTypeChange(row.id, val, row)}
                    placeholder="Select Type..."
                    icon="grid-outline"
                    disabled={!row.selectedVariety}
                  />
                </View>

                {/* Item */}
                <View style={styles.field}>
                  <Dropdown
                    label="Item *"
                    data={row.products}
                    value={row.selectedProduct}
                    onChange={(val) => handleRowProductChange(row.id, val)}
                    placeholder="Select Item..."
                    icon="cube-outline"
                    disabled={!row.selectedType}
                    searchable={true}
                  />
                </View>

                {/* PCS / Ltrs / Boxes (read-only, auto-calculated) */}
                <View style={styles.row}>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="PCS"
                      textColor={COLORS.black}
                      value={row.pcs}
                      editable={false}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="Ltrs"
                      textColor={COLORS.black}
                      value={row.ltrs}
                      editable={false}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="Boxes"
                      value={row.boxes}
                      textColor={COLORS.black}
                      editable={false}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                </View>

                {/* QTY + TAX */}
                <View style={styles.row}>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="QTY *"
                      textColor={COLORS.black}
                      value={row.qty}
                      onChangeText={(val) => handleRowQtyChange(row.id, val, row)}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="TAX %"
                      value={row.tax}
                      textColor={COLORS.black}
                      editable={false}
                      mode="outlined"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                </View>

                {/* Base Price + Market Price */}
                <View style={styles.row}>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="Base Price"
                      textColor={COLORS.black}
                      value={row.basePrice}
                      editable={false}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                  <View style={styles.thirdField}>
                    <TextInput
                      label="Market Price *"
                      textColor={COLORS.black}
                      value={row.marketPrice}
                      onChangeText={(val) => handleRowMarketPriceChange(row.id, val, row)}
                      mode="outlined"
                      keyboardType="numeric"
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                    />
                  </View>
                </View>

                {/* Item subtotal */}
                {!!row.itemTotal && (
                  <View style={styles.itemSubtotalRow}>
                    <Text style={styles.itemSubtotalLabel}>Item Total:</Text>
                    <Text style={styles.itemSubtotalValue}>₹{row.itemTotal}</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.addButton} onPress={() => addItemToOrder(row.id)}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.addButtonText}>Confirm Item</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </Surface>

        {/* ── Confirmed Order Items ──────────────────────────────────────── */}
        {orderItems.length > 0 && (
          <Surface style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="checkmark-done" size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Order Items ({orderItems.length})</Text>
            </View>

            {orderItems.map((item, index) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>
                    {index + 1}. {item.itemName}
                  </Text>
                  <TouchableOpacity onPress={() => removeOrderItem(item.id)}>
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.itemCategory}>
                  {item.category} | {item.brand} | {item.variety}
                </Text>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemDetail}>Qty: {item.qty}</Text>
                  <Text style={styles.itemDetail}>PCS: {item.pcs}</Text>
                  <Text style={styles.itemDetail}>Boxes: {item.boxes}</Text>
                  <Text style={styles.itemDetail}>Ltrs: {item.ltrs}</Text>
                </View>
                <View style={styles.itemPriceRow}>
                  <Text style={styles.itemDetail}>Price: ₹{item.marketPrice}</Text>
                  <Text style={styles.itemDetail}>Tax: {item.taxRate}%</Text>
                  <Text style={styles.itemAmount}>₹{item.total.toFixed(2)}</Text>
                </View>
              </View>
            ))}

            {/* ── FIX 5: Three-tier totals ─────────────────────────────── */}
            <View style={styles.totalsBox}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total (Without Tax)</Text>
                <Text style={styles.totalValue}>₹{totalWithoutTax}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tax Amount</Text>
                <Text style={styles.totalValue}>₹{totalTaxAmount}</Text>
              </View>
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalValue}>₹{grandTotal}</Text>
              </View>
            </View>
          </Surface>
        )}

        {/* ── Comment ───────────────────────────────────────────────────── */}
        <Surface style={styles.card}>
          <TextInput
            label="Comment (optional)"
            value={comment}
            onChangeText={setComment}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={[styles.input, styles.commentInput]}
            outlineColor={COLORS.border}
            activeOutlineColor={COLORS.primary}
          />
        </Surface>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Success Modal ─────────────────────────────────────────────── */}
      {successModal && orderResult && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {/* Icon */}
            <View style={[styles.modalIconCircle, { backgroundColor: orderResult.needsApproval ? "#FFF3CD" : "#D4EDDA" }]}>
              <Ionicons
                name={orderResult.needsApproval ? "time-outline" : "checkmark-circle"}
                size={40}
                color={orderResult.needsApproval ? "#856404" : "#155724"}
              />
            </View>

            {/* Title */}
            <Text style={styles.modalTitle}>
              {orderResult.needsApproval ? "Sent for Approval" : "Order Created!"}
            </Text>

            {/* Order number */}
            {!!orderResult.orderNumber && (
              <View style={styles.modalOrderNumBox}>
                <Text style={styles.modalOrderNumLabel}>Order Number</Text>
                <Text style={styles.modalOrderNum}>{orderResult.orderNumber}</Text>
              </View>
            )}

            {/* Message */}
            <Text style={styles.modalMessage}>{orderResult.message}</Text>

            {/* Buttons */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => { setSuccessModal(false); setOrderResult(null); }}
              >
                <Text style={styles.modalBtnSecondaryText}>New Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={() => { setSuccessModal(false); setOrderResult(null); router.back(); }}
              >
                <Text style={styles.modalBtnPrimaryText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Bottom Actions ─────────────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleClear}>
          <Text style={styles.cancelBtnText}>Clear</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={styles.submitBtnWrapper}
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitBtn}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.textLight} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.textLight} />
                <Text style={styles.submitBtnText}>Create Order</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  loadingText: { marginTop: SPACING.md, color: COLORS.textSecondary },
  scrollView: { flex: 1, padding: SPACING.md },

  // ── Web date input ──
  webDateWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    minHeight: 56,
  },
  webDateIcon: {
    marginRight: SPACING.sm,
  },
  webDateInner: {
    flex: 1,
  },
  webDateLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: "600", color: COLORS.text, marginLeft: SPACING.sm },
  dateText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "500" },
  field: { marginBottom: SPACING.sm },
  row: { flexDirection: "row", gap: SPACING.sm },
  halfField: { flex: 1 },
  thirdField: { flex: 1 },
  input: { backgroundColor: COLORS.surface, color: COLORS.black },
  commentInput: { minHeight: 80 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: 4,
  },
  addBtnText: { color: COLORS.textLight, fontSize: 12, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: SPACING.xl },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: SPACING.sm },
  emptySubtext: { fontSize: 13, color: COLORS.border, marginTop: SPACING.xs },
  itemCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm },
  itemNumber: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    gap: 4,
  },
  addButtonText: { color: COLORS.textLight, fontSize: 12, fontWeight: "600" },
  itemSubtotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  itemSubtotalLabel: { fontSize: 13, color: COLORS.textSecondary },
  itemSubtotalValue: { fontSize: 14, fontWeight: "700", color: COLORS.primary },

  // ── Confirmed items ──
  itemName: { fontWeight: "600", fontSize: 14, color: COLORS.text, flex: 1 },
  itemCategory: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  itemDetails: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  itemDetail: { fontSize: 12, color: COLORS.textSecondary },
  itemPriceRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  itemAmount: { fontWeight: "700", fontSize: 14, color: COLORS.text },

  // ── Totals box ──
  totalsBox: {
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 14, color: COLORS.textSecondary },
  totalValue: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  grandTotalRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  grandTotalValue: { fontSize: 18, fontWeight: "700", color: COLORS.primary },

  // ── Success Modal ──
  modalOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    width: "88%",
    maxWidth: 420,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 12,
    textAlign: "center",
  },
  modalOrderNumBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    marginBottom: 12,
    width: "100%",
  },
  modalOrderNumLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  modalOrderNum: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 1,
  },
  modalMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  modalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  modalBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },

  // ── Bottom bar ──
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  cancelBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
  },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: "600" },
  submitBtnWrapper: { flex: 1 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    gap: SPACING.xs,
  },
  submitBtnText: { color: COLORS.textLight, fontWeight: "600", fontSize: 15 },
});

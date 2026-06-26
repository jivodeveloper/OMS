import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Surface, TextInput } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, RADIUS, GRADIENTS } from "@/src/constants/theme";
import Dropdown from "@/src/components/common/DropdownProps";
import StateWrapper from "@/src/components/common/StateWrapper";
import { api } from "@/src/services/api";
import { storage } from "@/src/utils/storage";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";
import {
  orderService,
  schemeService,
  PartyAddress,
  CreateOrderPayload,
} from "@/src/services/order.service";
import { useRouter, useNavigation, useLocalSearchParams, useFocusEffect } from "expo-router";

interface ItemRow {
  id: number;
  selectedCategory: string | null;
  selectedBrand: string | null;
  selectedVariety: string | null;
  selectedType: string | null;
  selectedProduct: string | null;
  selectedScheme: string | null;
  schemeSelections: RowSchemeSelection[];
  isScheme: boolean;
  isComboProduct: boolean;
  brands: { label: string; value: string }[];
  varieties: { label: string; value: string }[];
  types: { label: string; value: string }[];
  products: { label: string; value: string }[];
  schemes: { label: string; value: string }[];
  qty: string;
  schemeQty: string;
  pcs: string;
  salPackUnit: string;
  boxes: string;
  ltrs: string;
  schemePcsPerBox: number;
  schemeLtrsPerBox: number;
  basicPrice: string;
  priceListBasic: string;
  tax: string;
  itemTotal: string;
  isQtyManual: boolean;
}

interface RowSchemeSelection {
  id: number;
  selectedScheme: string | null;
  schemeQty: string;
}

interface OrderItemScheme {
  scheme: string | null;
  schemeName: string | null;
  schemeQty: number;
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
  scheme?: string | null;
  schemeName?: string | null;
  schemeQty?: number;
  schemes?: OrderItemScheme[];
  pcs: number;
  boxes: number;
  ltrs: number;
  basicPrice: number;
  total: number;
  taxRate: number;
  priceListBasic: number;
}

type AddressOption = {
  label: string;
  value: number;
  name: string;
};

type FixedLabelTextInputProps = Omit<
  React.ComponentProps<typeof TextInput>,
  "label"
> & {
  label: string;
};

function FixedLabelTextInput({
  label,
  style,
  ...props
}: FixedLabelTextInputProps) {
  return (
    <View style={styles.fixedInputWrap}>
      <Text style={styles.fixedInputLabel}>{label}</Text>
      <TextInput
        {...props}
        label=""
        placeholder=""
        style={[styles.fixedInput, style]}
      />
    </View>
  );
}

const emptyRow = (id: number): ItemRow => ({
  id,
  selectedCategory: null,
  selectedBrand: null,
  selectedVariety: null,
  selectedType: null,
  selectedProduct: null,
  selectedScheme: null,
  schemeSelections: [],
  isScheme: false,
  isComboProduct: false,
  brands: [],
  varieties: [],
  types: [],
  products: [],
  schemes: [],
  qty: "",
  schemeQty: "",
  pcs: "",
  salPackUnit: "",
  boxes: "",
  ltrs: "",
  schemePcsPerBox: 0,
  schemeLtrsPerBox: 0,
  basicPrice: "",
  priceListBasic: "",
  tax: "",
  itemTotal: "",
  isQtyManual: false,
});

const dedupePartyProducts = (products: any[]) => {
  const uniqueMap = new Map<string, any>();

  for (const product of products || []) {
    if (!product?.item_code) continue;

    const key = `${String(product.item_code)}|${String(product.category || "")}`;
    const existing = uniqueMap.get(key);

    // Prefer records with a non-null tax_rate when duplicates exist.
    if (!existing || (existing.tax_rate == null && product.tax_rate != null)) {
      uniqueMap.set(key, product);
    }
  }

  return Array.from(uniqueMap.values());
};

const formatDateForInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTodayDate = () => formatDateForInput(new Date());

const getDefaultDeliveryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return formatDateForInput(date);
};

const toNumber = (value: string | number | null | undefined): number =>
  typeof value === "number" ? value : parseFloat(String(value ?? "")) || 0;

const calculateLtrsPerBox = (products: { sal_factor2?: number | string | null; sal_pack_unit?: number | string | null }[]) =>
  products.reduce(
    (sum, product) => sum + toNumber(product?.sal_factor2) * toNumber(product?.sal_pack_unit),
    0,
  );

const calculateComboLtrsFromItemName = ({
  itemName,
  defaultPcs,
}: {
  itemName: string | null | undefined;
  defaultPcs: string | number | null | undefined;
}) => {
  if (!itemName || !itemName.includes("+")) return 0;

  const parts = itemName
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return 0;

  let totalLtrsPerCase = 0;

  for (const part of parts) {
    const volumeMatch = part.match(/(\d+(?:\.\d+)?)\s*(LTR|LITRE|LITER|L|ML)\b/i);
    if (!volumeMatch) continue;

    const rawVolume = toNumber(volumeMatch[1]);
    const unit = volumeMatch[2]?.toUpperCase();
    const volumeInLtrs = unit === "ML" ? rawVolume / 1000 : rawVolume;

    const pcsMatch = part.match(/(\d+(?:\.\d+)?)\s*(PCS|PC)\b/i);
    const pcs = pcsMatch ? toNumber(pcsMatch[1]) : toNumber(defaultPcs);

    totalLtrsPerCase += pcs * volumeInLtrs;
  }

  return totalLtrsPerCase;
};

const calculateRowLtrs = ({
  qty,
  pcs,
  salPackUnit,
}: {
  qty: string | number | null | undefined;
  pcs: string | number | null | undefined;
  salPackUnit: string | number | null | undefined;
}) => {
  const qtyNum = toNumber(qty);
  if (qtyNum <= 0) return "";

  const ltrsPerBox = toNumber(pcs) * toNumber(salPackUnit);

  return (qtyNum * ltrsPerBox).toFixed(2);
};

const getSelectedSchemeName = ({
  selectedScheme,
  schemes,
  fallbackSchemeName,
}: {
  selectedScheme: string | null | undefined;
  schemes: { label: string; value: string }[];
  fallbackSchemeName?: string | null;
}) => {
  if (!selectedScheme) return fallbackSchemeName ?? null;
  return (
    schemes.find((scheme) => String(scheme.value) === String(selectedScheme))?.label ??
    fallbackSchemeName ??
    null
  );
};

const createSchemeSelection = (
  selectedScheme: string | null = null,
  schemeQty = "",
): RowSchemeSelection => ({
  id: Date.now() + Math.floor(Math.random() * 100000),
  selectedScheme,
  schemeQty,
});

const getRowSchemeSelections = (row: ItemRow): RowSchemeSelection[] => {
  if (row.schemeSelections?.length) return row.schemeSelections;
  if (row.selectedScheme || row.schemeQty) {
    return [
      {
        id: row.id,
        selectedScheme: row.selectedScheme,
        schemeQty: row.schemeQty,
      },
    ];
  }
  return [];
};

const getConfirmedSchemes = (item: OrderItemType): OrderItemScheme[] => {
  if (item.schemes?.length) return item.schemes;
  if (item.scheme || item.schemeName || item.schemeQty) {
    return [
      {
        scheme: item.scheme ?? null,
        schemeName: item.schemeName ?? null,
        schemeQty: item.schemeQty ?? 0,
      },
    ];
  }
  return [];
};

const getApiItemSchemes = (item: any): OrderItemScheme[] => {
  const rawSchemes = Array.isArray(item?.schemes)
    ? item.schemes
    : Array.isArray(item?.item_schemes)
      ? item.item_schemes
      : Array.isArray(item?.order_item_schemes)
        ? item.order_item_schemes
        : [];

  const mapped = rawSchemes
    .map((scheme: any) => {
      const schemeIdRaw = scheme?.scheme_id ?? scheme?.scheme ?? scheme?.id ?? null;
      const schemeName = scheme?.scheme_name ?? scheme?.name ?? null;
      return {
        scheme: schemeIdRaw == null ? null : String(schemeIdRaw),
        schemeName: schemeName == null ? null : String(schemeName),
        schemeQty: toNumber(scheme?.scheme_qty ?? scheme?.qty_scheme ?? scheme?.qty ?? 0),
      };
    })
    .filter((scheme: OrderItemScheme) => scheme.scheme || scheme.schemeName || scheme.schemeQty > 0);

  if (mapped.length) return mapped;

  const schemeIdRaw = item?.scheme?.scheme_id ?? item?.scheme_id ?? item?.scheme ?? null;
  const schemeName = item?.scheme?.scheme_name ?? item?.scheme_name ?? null;
  const schemeQty = toNumber(item?.qty_scheme ?? item?.scheme_qty ?? 0);
  if (!schemeIdRaw && !schemeName && schemeQty <= 0) return [];

  return [
    {
      scheme: schemeIdRaw == null ? null : String(schemeIdRaw),
      schemeName: schemeName == null ? null : String(schemeName),
      schemeQty,
    },
  ];
};

const calculateRowSchemeQty = ({
  qty,
  pcs,
  schemePcsPerBox,
  selectedSchemeName,
}: {
  qty: string | number | null | undefined;
  pcs: string | number | null | undefined;
  schemePcsPerBox: number;
  selectedSchemeName?: string | null;
}) => {
  const qtyNum = toNumber(qty);
  if (qtyNum <= 0) return "";

  const pcsNum = toNumber(pcs);
  const normalizedSchemeName = String(selectedSchemeName || "").toUpperCase();
  const multiplierMatch = normalizedSchemeName.match(/(\d+(?:\.\d+)?)/);
  const multiplier = multiplierMatch ? toNumber(multiplierMatch[1]) : 0;

  if (
    multiplier > 0 &&
    (normalizedSchemeName.includes("PER BOX") || normalizedSchemeName.includes("PER CASE"))
  ) {
    return (qtyNum * multiplier).toFixed(2);
  }

  if (
    multiplier > 0 &&
    (normalizedSchemeName.includes("PER PCS") || normalizedSchemeName.includes("PER PC"))
  ) {
    if (pcsNum <= 0) return "";
    return (qtyNum * pcsNum * multiplier).toFixed(2);
  }

  const pcsPerScheme = schemePcsPerBox > 0 ? schemePcsPerBox : toNumber(pcs);
  if (pcsPerScheme <= 0) return "";

  return (qtyNum * pcsPerScheme).toFixed(2);
};

const formatCalculationNumber = (value: string | number | null | undefined) => {
  const numericValue = toNumber(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(/\.?0+$/, "");
};

const getConfirmedItemLtrsDisplay = (item: OrderItemType) => {
  const totalSchemeQty = getConfirmedSchemes(item).reduce(
    (sum, scheme) => sum + toNumber(scheme.schemeQty),
    0,
  );
  const totalLtrs = formatCalculationNumber(toNumber(item.ltrs) + totalSchemeQty);

  if (totalSchemeQty > 0) {
    return totalLtrs;
  }

  return formatCalculationNumber(item.ltrs);
};

const getRowLtrsBreakdown = ({
  qty,
  pcs,
  salPackUnit,
  ltrs,
}: Pick<ItemRow, "qty" | "pcs" | "salPackUnit" | "ltrs">) => {
  const qtyNum = toNumber(qty);
  const totalLtrs = toNumber(ltrs);

  if (qtyNum <= 0 || totalLtrs <= 0) return "";

  const pcsNum = toNumber(pcs);
  const singlePieceLtrs = toNumber(salPackUnit);
  const totalPcs = qtyNum * pcsNum;

  if (pcsNum <= 0 || singlePieceLtrs <= 0 || totalPcs <= 0) return "";

  return `${formatCalculationNumber(qtyNum)} boxes x ${formatCalculationNumber(
    pcsNum,
  )} pcs = ${formatCalculationNumber(totalPcs)} pcs; ${formatCalculationNumber(
    totalPcs,
  )} pcs x ${formatCalculationNumber(singlePieceLtrs)} ltr = ${formatCalculationNumber(
    totalLtrs,
  )} ltr`;
};

const getConfirmedItemLtrsBreakdown = (item: Pick<OrderItemType, "qty" | "pcs" | "ltrs">) => {
  const qtyNum = toNumber(item.qty);
  const pcsNum = toNumber(item.pcs);
  const totalLtrs = toNumber(item.ltrs);
  const totalPcs = qtyNum * pcsNum;

  if (qtyNum <= 0 || pcsNum <= 0 || totalLtrs <= 0 || totalPcs <= 0) return "";

  const singlePieceLtrs = totalLtrs / totalPcs;

  return `${formatCalculationNumber(qtyNum)} boxes x ${formatCalculationNumber(
    pcsNum,
  )} pcs = ${formatCalculationNumber(totalPcs)} pcs; ${formatCalculationNumber(
    totalPcs,
  )} pcs x ${formatCalculationNumber(singlePieceLtrs)} ltr = ${formatCalculationNumber(
    totalLtrs,
  )} ltr`;
};

const calculateRowItemTotal = (
  row: Pick<ItemRow, "qty" | "boxes" | "priceListBasic" | "basicPrice">,
) => {
  const totalPcs = toNumber(row.boxes);
  const priceListBasic = toNumber(row.priceListBasic);
  const basicPrice = toNumber(row.basicPrice);
  const price = basicPrice > 0 ? basicPrice : priceListBasic;
  return (totalPcs * price).toFixed(2);
};

const FOC_PRICE_LIST_BASIC = 0;

export function OrderEntryScreen({
  screenVariant = "order",
}: {
  screenVariant?: "order" | "foc";
} = {}) {
  const { user } = useAuth();
  const {
    orderId: editOrderId,
    mode,
    from,
    fromOrderId,
    openMode,
  } = useLocalSearchParams<{
    orderId?: string;
    mode?: string;
    from?: string;
    fromOrderId?: string;
    openMode?: string;
  }>();
  const userRole = user?.role?.toLowerCase() || "";
  const isExplicitCreateMode = openMode === "create";
  const isEditMode = !isExplicitCreateMode && mode === "edit" && !!editOrderId;
  const isFocMode = screenVariant === "foc";
  const shouldShowPoNumber = userRole === "billing";

  const [loading, setLoading] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    orderNumber: string;
    message: string;
    needsApproval: boolean;
  } | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [editOrderLoaded, setEditOrderLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const navigation = useNavigation();

  const today = new Date().toLocaleDateString("en-GB");

  // ── Order header ──────────────────────────────────────────────────────────
  const [partyName, setPartyName] = useState<string | null>(null);
  const [company, setCompany] = useState<number | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const [poNumber, setPoNumber] = useState("");
  const [comment, setComment] = useState("");
  const [delivery, setDeliveryDate] = useState(getDefaultDeliveryDate());
  const [showPicker, setShowPicker] = useState(false);

  // ── Address dropdowns ─────────────────────────────────────────────────────
  const [billToAddresses, setBillToAddresses] = useState<
    { label: string; value: number; name: string }[]
  >([]);
  const [shipToAddresses, setShipToAddresses] = useState<
    { label: string; value: number; name: string }[]
  >([]);

  const [selectedBillTo, setSelectedBillTo] = useState<number | null>(null);
  const [selectedShipTo, setSelectedShipTo] = useState<number | null>(null);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);

  // ── Master data ───────────────────────────────────────────────────────────
  const [parties, setParties] = useState<
    {
      label: string;
      value: string;
      cardCode: string;
      cardName: string;
      category?: string;
      state?: string;
    }[]
  >([]);
  const [userCategory, setUserCategory] = useState<string | null>(null);
  // All categories assigned to the logged-in user (OIL / BEVERAGES / MART). A
  // user can have more than one, so parties are scoped to the full set rather
  // than the single primary category.
  const [userCategories, setUserCategories] = useState<string[]>([]);

  const [dispatches, setDispatches] = useState<
    { label: string; value: number }[]
  >([]);

  const [companies, setCompanies] = useState<
    { label: string; value: number }[]
  >([]);

  const [branches, setbranches] = useState<{ label: string; value: number }[]>(
    [],
  );

  useEffect(() => {
    if (company == null && companies.length === 1) {
      setCompany(companies[0].value);
    }
  }, [companies, company]);

  useEffect(() => {
    if (branch == null && branches.length === 1) {
      setBranch(branches[0].value);
    }
  }, [branch, branches]);

  const [partyProducts, setPartyProducts] = useState<any[]>([]);

  const [categories, setCategories] = useState<{ label: string; value: string }[]>([]);

  // ── Item rows (each row has its own isolated state) ───────────────────────
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);

  // ── Confirmed order items ─────────────────────────────────────────────────
  const [orderItems, setOrderItems] = useState<OrderItemType[]>([]);
  const [assignedStateCode, setAssignedStateCode] = useState<string>("");
  const [loadedIsFocOrder, setLoadedIsFocOrder] = useState(false);
  const [loadedIsDraftOrder, setLoadedIsDraftOrder] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [allSchemes, setAllSchemes] = useState<{ label: string; value: string }[]>([]);
  const isFocOrder = isFocMode || loadedIsFocOrder;
  const shouldAllowSchemes = !isFocOrder;
  const isBeverageUser = userCategories.includes("BEVERAGES") || userCategory === "BEVERAGES";
  // ── Templates States ──────────────────────────────────────────────────────
  const [templateParties, setTemplateParties] = useState<{ label: string; value: string }[]>([]);
  const [selectedTemplateParty, setSelectedTemplateParty] = useState<string | null>(null);
  const [templateOrders, setTemplateOrders] = useState<{ label: string; value: number }[]>([]);
  const [selectedTemplateOrder, setSelectedTemplateOrder] = useState<number | null>(null);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  
  const [templateLoading, setTemplateLoading] = useState(false);
  // ─── Helpers ───────────────────────────────────────────────────────────────

  const clearEditRouteParams = useCallback(() => {
    navigation.setParams({
      orderId: undefined,
      mode: undefined,
      from: undefined,
      fromOrderId: undefined,
      openMode: undefined,
    } as never);
  }, [navigation]);

  const normalizeCategory = (value?: string | null) =>
    String(value || "").trim().toUpperCase();

  const createPartyValue = (cardCode: string, category?: string | null) =>
    `${String(cardCode || "").trim()}||${normalizeCategory(category)}`;

  const mapAddressOption = (addr: any): AddressOption => {
    const addressText =
      addr.address_name || addr.full_address || addr.address_id || `Address ${addr.id}`;
    return {
      label: addressText,
      value: addr.id,
      name: addr.address_name || "",
    };
  };

  const buildAddressOptions = (addressData: any) => {
    const rawBillTo = (addressData?.bill_to || []).map(mapAddressOption);
    const rawShipTo = (addressData?.ship_to || []).map(mapAddressOption);

    return {
      billTo: rawBillTo.length > 0 ? rawBillTo : rawShipTo,
      shipTo: rawShipTo.length > 0 ? rawShipTo : rawBillTo,
    };
  };

  const parsePartyValue = (value: string | null | undefined) => {
    const [cardCode, rawCategory] = String(value || "").split("||");
    return {
      cardCode: String(cardCode || "").trim(),
      category: normalizeCategory(rawCategory),
    };
  };

  const findSelectedParty = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = parsePartyValue(value);
    return (
      parties.find((party) => party.value === value) ||
      parties.find((party) => party.cardCode === parsed.cardCode) ||
      null
    );
  };

  const getOrderPartyCategory = (order: any) => {
    if (!Array.isArray(order?.items)) return "";

    return (
      order.items
        .map((item: any) => normalizeCategory(item?.category))
        .find(Boolean) || ""
    );
  };

  const ensurePartyOption = ({
    cardCode,
    cardName,
    category,
    state,
  }: {
    cardCode: string;
    cardName?: string | null;
    category?: string | null;
    state?: string | null;
  }) => {
    const normalizedCardCode = String(cardCode || "").trim();
    const normalizedCategory = normalizeCategory(category);
    const optionValue = createPartyValue(normalizedCardCode, normalizedCategory);

    if (!normalizedCardCode) return optionValue;

    setParties((prev) => {
      if (prev.some((party) => party.value === optionValue)) {
        return prev;
      }

      const labelBase = cardName
        ? `${String(cardName).trim()} (${normalizedCardCode})`
        : normalizedCardCode;

      return [
        ...prev,
        {
          label: normalizedCategory
            ? `${labelBase} - ${normalizedCategory}`
            : labelBase,
          value: optionValue,
          cardCode: normalizedCardCode,
          cardName: String(cardName || "").trim() || normalizedCardCode,
          category: normalizedCategory || undefined,
          state: String(state || "").trim(),
        },
      ];
    });

    return optionValue;
  };

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

  const handleTemplatePartyChange = async (partyValue: string) => {
    setSelectedTemplateParty(partyValue);
    setSelectedTemplateOrder(null);
    setTemplateOrders([]);
    if (partyValue) {
      try {
        // The value is card_code||CATEGORY so the same card_code under different
        // categories stays distinct; scope the order list to that category.
        const { cardCode, category } = parsePartyValue(partyValue);
        const orders = await orderService.getTemplateOrders(cardCode, category);
        setTemplateOrders(orders || []);
      } catch (e) {
        console.log("Error loading template orders", e);
      }
    }
  };

  const handleTemplateOrderChange = async (orderId: number) => {
    setSelectedTemplateOrder(orderId);
    if (orderId) {
      try {
        setTemplateLoading(true);
        setIsTemplateOpen(false); // Close dropdown immediately
        // 1. Fetch template/order details
        const res = await orderService.getorderdetailsbyid(orderId);
        const orderDetails = res?.data || res;

        // 2. Load party data (addresses, products) first.
        // The same card_code can be assigned under multiple categories (OIL,
        // BEVERAGES, MART). Match the party by card_code AND the template
        // order's own category so selecting an OIL template never loads MART
        // data; only fall back to a card_code-only match if no category-specific
        // party exists in the dropdown.
        const orderCategory = getOrderPartyCategory(orderDetails);
        const categoryMatchedParty =
          parties.find(
            (party) =>
              String(party.cardCode) === String(orderDetails.card_code) &&
              normalizeCategory(party.category) === orderCategory,
          ) || null;
        const matchedTemplateParty =
          categoryMatchedParty ||
          parties.find(
            (party) => String(party.cardCode) === String(orderDetails.card_code),
          ) ||
          null;
        const templatePartyValue =
          categoryMatchedParty?.value ??
          createPartyValue(
            orderDetails.card_code,
            orderCategory || matchedTemplateParty?.category,
          );
        const fetchedProducts = await handlePartyChange(templatePartyValue);
        const products = fetchedProducts || [];
        const templateStateCode = String(matchedTemplateParty?.state || "").trim();

        let templateSchemeOptions = allSchemes;
        if (shouldAllowSchemes) {
          try {
            const templateSchemes = await schemeService.getSchemes(
              templateStateCode || "DEFAULT",
            );
            templateSchemeOptions = templateSchemes.map((scheme) => ({
              label: scheme.scheme_name,
              value: String(scheme.scheme_id),
            }));
            setAllSchemes(templateSchemeOptions);
          } catch (error) {
            console.log("Failed to load template schemes", error);
          }
        }

        // 3. Auto-fill form fields
        setCompany(Number(orderDetails.company) || 1);
        setBranch(Number(orderDetails.dispatch_from_id) || null);
        setPoNumber(orderDetails.po_number || "");
        setComment(orderDetails.remarks || "");
        setSelectedBillTo(Number(orderDetails.bill_to_id) || null);
        setSelectedShipTo(Number(orderDetails.ship_to_id) || null);

        // 4. Map and auto-fill into EDITABLE rows instead of confirmed items
        if (orderDetails.items && Array.isArray(orderDetails.items)) {
          const newRows: ItemRow[] = orderDetails.items.map((item: any, idx: number) => {
            const category = item.category;
            const brand = item.brand;
            const variety = item.variety;
            const type = item.item_type || extractType(item.item_name);

            const catProducts = products.filter((p: any) => p.category === category);
            const brands = [...new Set<string>(catProducts.map((p: any) => p.brand).filter(Boolean))].sort().map(b => ({ label: b, value: b }));

            const brandProducts = catProducts.filter((p: any) => p.brand === brand);
            const varieties = [...new Set<string>(brandProducts.map((p: any) => p.variety).filter(Boolean))].sort().map(v => ({ label: v, value: v }));

            const varProducts = brandProducts.filter((p: any) => p.variety === variety);
            const typesSet = new Set<string>();
            varProducts.forEach((p: any) => typesSet.add(extractType(p.item_name)));
            const sortedTypes = [...typesSet].sort((a, b) => {
              if (a === "Others") return 1;
              if (b === "Others") return -1;
              return parseFloat(a) - parseFloat(b);
            });
            const types = sortedTypes.map(t => ({ label: t, value: t }));

            const typeProducts = varProducts.filter((p: any) => extractType(p.item_name) === type);
            const productOptions = typeProducts.map((p: any) => ({
              label: `${p.item_name} (₹${p.basic_rate})`,
              value: p.item_code,
            }));

            const matchedProduct = products.find((p: any) => String(p.item_code) === String(item.item_code));
            const salPackUnit = matchedProduct?.sal_pack_unit?.toString() || "0";

            const itemSchemes = getApiItemSchemes(item).map((scheme) => {
              const schemeId = scheme.scheme ? String(scheme.scheme) : null;
              const foundScheme = schemeId
                ? templateSchemeOptions.find((option) => String(option.value) === schemeId)
                : null;
              return {
                scheme: schemeId,
                schemeName: foundScheme?.label ?? scheme.schemeName ?? null,
                schemeQty: scheme.schemeQty,
              };
            });
            const firstScheme = itemSchemes[0];
            const schemeOptionsMap = new Map<string, { label: string; value: string }>();
            templateSchemeOptions.forEach((schemeOption) => {
              schemeOptionsMap.set(String(schemeOption.value), {
                label: schemeOption.label,
                value: String(schemeOption.value),
              });
            });
            itemSchemes.forEach((scheme) => {
              if (!scheme.scheme) return;
              if (!schemeOptionsMap.has(String(scheme.scheme))) {
                schemeOptionsMap.set(String(scheme.scheme), {
                  label: scheme.schemeName || String(scheme.scheme),
                  value: String(scheme.scheme),
                });
              }
            });
            const schemes = Array.from(schemeOptionsMap.values());
            const schemeSelections = itemSchemes.map((scheme) =>
              createSchemeSelection(
                scheme.scheme ? String(scheme.scheme) : null,
                String(scheme.schemeQty || 0),
              ),
            );
            const schemeQty = String(firstScheme?.schemeQty || 0);

            return {
              id: Date.now() + idx,
              selectedCategory: category,
              selectedBrand: brand,
              selectedVariety: variety,
              selectedType: type,
              selectedProduct: item.item_code,
              selectedScheme: shouldAllowSchemes ? (firstScheme?.scheme ?? null) : null,
              schemeSelections: shouldAllowSchemes ? schemeSelections : [],
              isScheme: shouldAllowSchemes ? schemeSelections.length > 0 : false,
              brands,
              varieties,
              types,
              products: productOptions,
              schemes: shouldAllowSchemes ? schemes : [],
              qty: String(item.boxes || 0),
              schemeQty: shouldAllowSchemes ? schemeQty : "",
              pcs: String(item.pcs || matchedProduct?.sal_factor2 || 0),
              salPackUnit,
              boxes: String(item.qty || 0),
              ltrs: String(item.ltrs || 0),
              basicPrice: String(item.basic_price || 0),
              priceListBasic: String(item.price_list_basic || matchedProduct?.basic_rate || 0),
              tax: String(item.tax_rate || matchedProduct?.tax_rate || 0),
              itemTotal: String(item.total || 0),
            };
          });
          setItemRows(newRows);
          setOrderItems([]); // Pichle confirmed items hata do
        }
      } catch (e) {
        Alert.alert("Error", "Failed to load template details");
      } finally {
        setTemplateLoading(false);
      }
    }
  };

  /** Update a single field on a specific item row */
  // const updateRow = (id: number, patch: Partial<ItemRow>) => {
  //   setItemRows((prev) =>
  //     prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  //   );
  // };

  const updateRow = (id: number, patch: Partial<ItemRow>) => {
    setItemRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        return {
          ...r,
          ...patch,
          qty: patch.qty !== undefined ? patch.qty : r.qty, // 🔒 protect qty
        };
      })
    );
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setDataLoading(true);
        setError(null);

        // Get State ID first
        let stateId = 1;
        try {
          const storedUser = await storage.getUser();
          stateId =
            storedUser?.states?.[0]?.id ??
            storedUser?.state?.id ??
            user?.states?.[0]?.id ??
            user?.state?.id ??
            1;
          setAssignedStateCode(stateId ? String(stateId) : "DEFAULT");
        } catch (e) {
          console.log("Could not get user state, falling back to 1", e);
        }

        // Fetch latest profile to guarantee we have the user's category (handles stale cache)
        let latestUser = user as any;
        let fetchedCategory: string | null = null;
        try {
          const endpoints = ['/auth/profile/', '/profile/', '/api/auth/profile/'];
          let profileRes: any = null;
          for (const path of endpoints) {
            try {
              profileRes = await api.get(path);
              if (profileRes) break;
            } catch (e) {}
          }
          if (profileRes?.success && profileRes?.data) {
            latestUser = profileRes.data;
            storage.saveUser(profileRes.data).catch(() => {});
          } else if (profileRes && (profileRes.id || profileRes.username)) {
            latestUser = profileRes;
            storage.saveUser(profileRes).catch(() => {});
          }
        } catch (e) {
          console.log("Could not fetch latest profile");
        }

        if (latestUser?.category) {
            if (typeof latestUser.category === 'object') {
                fetchedCategory = String(latestUser.category.category || latestUser.category.name || "").toUpperCase().trim();
            } else if (typeof latestUser.category === 'string') {
                fetchedCategory = String(latestUser.category).toUpperCase().trim();
            }
        }

        // Full set of assigned categories; fall back to the single primary
        // category for users created before multi-category support.
        const fetchedCategoriesList: string[] = Array.isArray(latestUser?.categories)
          ? Array.from(
              new Set(
                latestUser.categories
                  .map((c: any) =>
                    String(typeof c === 'string' ? c : c?.category || c?.name || '')
                      .toUpperCase()
                      .trim(),
                  )
                  .filter(Boolean),
              ),
            )
          : [];
        if (!fetchedCategoriesList.length && fetchedCategory) {
          fetchedCategoriesList.push(fetchedCategory);
        }
        // Keep the single primary in sync (first selected) for any legacy uses.
        if (!fetchedCategory && fetchedCategoriesList.length) {
          fetchedCategory = fetchedCategoriesList[0];
        }
        setUserCategory(fetchedCategory || null);
        setUserCategories(fetchedCategoriesList);

        // Now fetch master data that depends on stateId
        const [partiesData, branchesData, schemeData] = await Promise.all([
          orderService.getParties(),
          orderService.getbranch(""),
          isFocMode
            ? Promise.resolve([])
            : schemeService.getSchemes(stateId ? String(stateId) : "DEFAULT"),
        ]);

        setCompanies([{ label: "Jivo Wellness", value: 1 }]);
        
        let partiesList: any[] = [];
        if (Array.isArray(partiesData)) partiesList = partiesData;
        else if (Array.isArray((partiesData as any)?.data)) partiesList = (partiesData as any).data;
        else if (Array.isArray((partiesData as any)?.results)) partiesList = (partiesData as any).results;

        let branchList: any[] = [];
        if (Array.isArray(branchesData)) branchList = branchesData;
        else if (Array.isArray((branchesData as any)?.data)) branchList = (branchesData as any).data;
        else if (Array.isArray((branchesData as any)?.results)) branchList = (branchesData as any).results;

        let schemeList: any[] = [];
        if (Array.isArray(schemeData)) schemeList = schemeData;
        else if (Array.isArray((schemeData as any)?.data)) schemeList = (schemeData as any).data;
        else if (Array.isArray((schemeData as any)?.results)) schemeList = (schemeData as any).results;

        const userCats = fetchedCategoriesList;
        const activeParties = partiesList.filter(
          (p: any) => {
            const pCat = String(p.category || "").toUpperCase().trim();
            if (!pCat || !ACTIVE_CATEGORIES.includes(pCat)) return false;
            // Backend already limits parties by assignment. If the profile
            // categories are missing/stale, don't blank the dropdown on the client.
            if (userCats.length) return userCats.includes(pCat);
            return true;
          }
        );
        setParties(
          activeParties.map((p) => ({
            label: p.category ? `${p.label} - ${p.category}` : p.label,
            value: createPartyValue(p.card_code || p.value, p.category),
            cardCode: p.card_code || p.value,
            cardName: p.card_name || p.label,
            category: p.category,
            state: p.state,
          })),
        );

        setbranches(
          branchList.map((d: any) => ({
            label: d.bpl_name,
            value: Number(d.bpl_id),
          })),
        );

        setAllSchemes(
          schemeList.map(s => ({ label: s.scheme_name, value: String(s.scheme_id) }))
        );

        // Load Template Parties in background
        const tParties = await orderService.getTemplateParties().catch(() => []);
        setTemplateParties(tParties || []);

      } catch (error) {
        setError("Failed to load data. Please check your connection.");
      } finally {
        setDataLoading(false);
      }
    };

    loadInitialData();
  }, [user]);

  // ─── Constants: active filters ────────────────────────────────────────────
  const ACTIVE_CATEGORIES = ["OIL", "BEVERAGES", "MART"];

  // ─── Edit mode: load existing order and pre-fill form ────────────────────
  const loadEditOrder = async () => {
    const id = Number(editOrderId);
    if (!id) return;
    try {
      const order = await orderService.getorderdetailsbyid(id);
      const orderIsFoc = Boolean(order?.is_foc);
      console.log("Loaded order for edit:", order);
      setLoadedIsFocOrder(orderIsFoc);
      setLoadedIsDraftOrder(
        String(order?.status_display || "").trim().toLowerCase() === "draft",
      );

      const orderPartyCategory = getOrderPartyCategory(order);
      const orderPartyState = String(order.party_state || "").trim();

      const selectedParty =
        parties.find(
          (party) =>
            party.cardCode === String(order.card_code) &&
            normalizeCategory(party.category) === orderPartyCategory,
        ) ||
        parties.find((party) => party.cardCode === String(order.card_code)) ||
        null;

      const selectedPartyValue =
        selectedParty?.value ||
        ensurePartyOption({
          cardCode: String(order.card_code || ""),
          cardName: order.card_name,
          category: orderPartyCategory,
          state: orderPartyState,
        });

      // Header fields
      setPartyName(selectedPartyValue);
      setPoNumber(order.po_number || "");
      setDeliveryDate(order.delivery_date || getDefaultDeliveryDate());
      setCompany(1);
      if (order.dispatch_from_id) setBranch(Number(order.dispatch_from_id));

      // Addresses
      const addressData = await orderService.getAddresses(
        order.card_code,
        selectedParty?.category || orderPartyCategory,
      );
      const { billTo: billList, shipTo: shipList } = buildAddressOptions(addressData);
      setBillToAddresses(billList);
      setShipToAddresses(shipList);

      const billMatch =
        billList.find((a: AddressOption) => a.value === order.bill_to_id) ??
        billList.find((a: AddressOption) => a.name === order.bill_to_address) ??
        billList[0];
      const shipMatch =
        shipList.find((a: AddressOption) => a.value === order.ship_to_id) ??
        shipList.find((a: AddressOption) => a.name === order.ship_to_address) ??
        shipList[0];
      if (billMatch) setSelectedBillTo(billMatch.value);
      if (shipMatch) setSelectedShipTo(shipMatch.value);

      // Products (needed if user wants to add more items)
      const productsResponse = await orderService.getPartyProducts(
        order.card_code,
        selectedParty?.category || orderPartyCategory,
      );
      const allProducts = dedupePartyProducts(Array.isArray(productsResponse) ? productsResponse : []);
      setPartyProducts(allProducts);
      const uniqueCategories = [...new Set<string>(allProducts.map((p: any) => p.category).filter(Boolean))];
      setCategories(uniqueCategories.sort().map((c) => ({ label: c, value: c })));

      const partyEntry =
        selectedParty ||
        parties.find(
          (p: any) =>
            String(p.cardCode) === String(order.card_code) &&
            normalizeCategory(p.category) === orderPartyCategory,
        ) ||
        parties.find((p: any) => String(p.cardCode) === String(order.card_code));
      const effectivePartyState = String(
        partyEntry?.state || orderPartyState || "",
      ).trim();

      // Set state code so scheme dropdown works correctly when adding new items in edit mode
      setAssignedStateCode(effectivePartyState);

      if (shouldAllowSchemes) {
        const editSchemes = await schemeService.getSchemes(
          effectivePartyState || "DEFAULT",
        );
        setAllSchemes(
          editSchemes.map((scheme) => ({
            label: scheme.scheme_name,
            value: String(scheme.scheme_id),
          })),
        );
      } else {
        setAllSchemes([]);
      }

      // Pre-fill confirmed order items exactly as saved in the order.
      const items: OrderItemType[] = (order.items || []).map((item: any, index: number) => {
        const itemSchemes = getApiItemSchemes(item);
        const firstScheme = itemSchemes[0];

        return {
          id: item.id ?? Date.now() + index,
          itemCode: item.item_code ?? "",
          itemName: item.item_name ?? "",
          category: item.category ?? "",
          brand: item.brand ?? "",
          variety: item.variety ?? "",
          type: item.item_type ?? "",
          qty: Number(item.boxes) || 0,
          scheme: shouldAllowSchemes ? (firstScheme?.scheme ?? item.scheme_id ?? null) : null,
          schemeName: shouldAllowSchemes ? (firstScheme?.schemeName ?? item.scheme_name ?? null) : null,
          schemeQty: shouldAllowSchemes ? Number(firstScheme?.schemeQty ?? item.qty_scheme) || 0 : 0,
          schemes: shouldAllowSchemes ? itemSchemes : [],
          pcs: Number(item.pcs) || 0,
          boxes: Number(item.qty) || 0,
          ltrs: Number(item.ltrs) || 0,
          basicPrice: Number(item.basic_price) || 0,
          total: Number(item.total) || 0,
          taxRate: Number(item.tax_rate) || 0,
          priceListBasic: orderIsFoc ? FOC_PRICE_LIST_BASIC : Number(item.price_list_basic) || 0,
        };
      });
      // Items that were never confirmed (no product picked) come back as editable
      // rows so the user can finish them; fully-specified items stay confirmed.
      const confirmedItems = items.filter((item) => item.itemCode);
      const unconfirmedItems = items.filter((item) => !item.itemCode);
      setOrderItems(confirmedItems);
      setItemRows(
        unconfirmedItems.map((item, idx) => ({
          ...buildEditableRowFromItem(item),
          id: Date.now() + idx,
        })),
      );
      setEditOrderLoaded(true);
    } catch (err) {
      console.log("Failed to load order for edit:", err);
    }
  };

  useEffect(() => {
    if (!dataLoading && parties.length > 0 && isEditMode && !editOrderLoaded) {
      loadEditOrder();
    }
  }, [dataLoading, parties.length, isEditMode, editOrderLoaded, shouldAllowSchemes]);

  const handlePartyChange = async (selectedPartyValue: string) => {
    setPartyName(selectedPartyValue);

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
      const selectedParty = findSelectedParty(selectedPartyValue);
      const parsedParty = parsePartyValue(selectedPartyValue);
      const cardCode = selectedParty?.cardCode || parsedParty.cardCode;
      const partyCategory = selectedParty?.category || parsedParty.category;

      if (!cardCode) return [];

      const stateCode = selectedParty?.state || "";
      console.log("Assigned state code from selected party:", stateCode);
      setAssignedStateCode(stateCode);
      const addressData = await orderService.getAddresses(cardCode, partyCategory);
      const { billTo: finalBillTo, shipTo: finalShipTo } = buildAddressOptions(addressData);

      setBillToAddresses(finalBillTo);
      setShipToAddresses(finalShipTo);

      setSelectedBillTo(finalBillTo.length > 0 ? finalBillTo[0].value : null);
      setSelectedShipTo(finalShipTo.length > 0 ? finalShipTo[0].value : null);

      const productsResponse = await orderService.getPartyProducts(cardCode, partyCategory);
      const allProducts = Array.isArray(productsResponse)
        ? productsResponse
        : (productsResponse?.data?.products || productsResponse?.data || []);
      console.log(
        "All products for party:",
        JSON.stringify(allProducts, null, 2),
      );
    
      const filteredProducts = allProducts.filter(
        (p: any) => {
          const pCat = String(p.category || "").toUpperCase().trim();
          return pCat && ACTIVE_CATEGORIES.includes(pCat) &&
                 (userCategories.length ? userCategories.includes(pCat) : true);
        }
      );
    const products = dedupePartyProducts(filteredProducts);
      setPartyProducts(products);

      const uniqueCategories = [
        ...new Set<string>(
          products.map((p: any) => p.category).filter(Boolean),
        ),
      ];
      setCategories(
        uniqueCategories.sort().map((c) => ({ label: c, value: c })),
      );

      return products;
    } catch (err) {
      console.log("Failed to fetch party data:", err);
      return [];
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
      selectedScheme: null,
      schemeSelections: [],
      isComboProduct: false,
      brands: uniqueBrands.sort().map((b) => ({ label: b, value: b })),
      varieties: [],
      types: [],
      products: [],
      schemes: [],
      pcs: "",
      salPackUnit: "",
      schemePcsPerBox: 0,
      schemeLtrsPerBox: 0,
      tax: "",
      priceListBasic: "",
      basicPrice: "",
      qty: "",
      schemeQty: "",
      boxes: "",
      ltrs: "",
      itemTotal: "",
    });
  };

  useEffect(() => {
    if (categories.length !== 1) return;

    const onlyCategory = categories[0].value;
    const emptyCategoryRow = itemRows.find((row) => !row.selectedCategory);
    if (emptyCategoryRow) {
      handleRowCategoryChange(emptyCategoryRow.id, onlyCategory);
    }
  }, [categories, itemRows]);

  const handleRowBrandChange = (rowId: number, brand: string, row: ItemRow) => {
    const filtered = partyProducts.filter(
      (p: any) => p.category === row.selectedCategory && p.brand === brand,
    );
    const uniqueVarieties = [
      ...new Set<string>(filtered.map((p: any) => p.variety).filter(Boolean)),
    ];
    updateRow(rowId, {
      selectedBrand: brand,
      selectedVariety: null,
      selectedType: null,
      selectedProduct: null,
      selectedScheme: null,
      schemeSelections: [],
      varieties: uniqueVarieties.sort().map((v) => ({ label: v, value: v })),
      types: [],
      products: [],
      schemes: [],
    });
  };

  const handleRowVarietyChange = (
    rowId: number,
    variety: string,
    row: ItemRow,
  ) => {
    const filtered = partyProducts.filter(
      (p: any) =>
        p.category === row.selectedCategory &&
        p.brand === row.selectedBrand &&
        p.variety === variety,
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
      selectedScheme: null,
      schemeSelections: [],
      types: sortedTypes.map((t) => ({ label: t, value: t })),
      products: [],
      schemes: [],
    });
  };

  const handleRowTypeChange = (rowId: number, type: string, row: ItemRow) => {
    const filtered = partyProducts.filter(
      (p: any) =>
        p.category === row.selectedCategory &&
        p.brand === row.selectedBrand &&
        p.variety === row.selectedVariety &&
        extractType(p.item_name) === type,
    );
    updateRow(rowId, {
      selectedType: type,
      selectedProduct: null,
      selectedScheme: null,
      schemeSelections: [],
      products: filtered.map((p: any) => ({
        label: `${p.item_name} (₹${p.basic_rate})`,
        value: p.item_code,
      })),
      schemes: [],
    });
  };

  const handleRowProductChange = async (rowId: number, productId: string) => {
    const product = partyProducts.find(
      (p: any) => String(p.item_code) === String(productId),
    );
    if (product) {
      const pcsPerCase = toNumber(product.sal_factor2);
      const pcs = pcsPerCase.toString();
      const salPackUnit = product.sal_pack_unit?.toString() || "0";
      const isComboProduct =
        Boolean(product.combo_scheme_name) || String(product.item_name || "").includes("+");
      const comboSchemeName: string | null = product.combo_scheme_name ?? null;
      let comboSchemeId: string | null = product.combo_scheme_id
        ? String(product.combo_scheme_id)
        : null;
      const hasPrefilledScheme = Boolean(comboSchemeId || comboSchemeName);
      let schemePcsPerBox = 0;

      if (comboSchemeName) {
        const comboItems = dedupePartyProducts(
          partyProducts.filter((p: any) => p.combo_scheme_name === comboSchemeName),
        );
        schemePcsPerBox = comboItems
          .filter((item: any) => String(item.item_code) !== String(product.item_code))
          .reduce((sum, item: any) => sum + toNumber(item.sal_factor2), 0);
      }

      const focPriceListBasic = String(FOC_PRICE_LIST_BASIC);
      updateRow(rowId, {
        selectedProduct: productId,
        selectedScheme: shouldAllowSchemes ? comboSchemeId : null,
        schemeSelections: shouldAllowSchemes
          ? hasPrefilledScheme
            ? [
              createSchemeSelection(
                comboSchemeId,
                calculateRowSchemeQty({
                  qty: "",
                  pcs,
                  schemePcsPerBox,
                  selectedSchemeName: comboSchemeName,
                }) || "",
              ),
            ]
            : []
          : [],
        isScheme: shouldAllowSchemes ? hasPrefilledScheme : false,
        isComboProduct: shouldAllowSchemes ? isComboProduct : false,
        schemes: [],
        pcs,
        salPackUnit,
        schemeQty: shouldAllowSchemes
          ? hasPrefilledScheme
            ? calculateRowSchemeQty({
              qty: "",
              pcs,
              schemePcsPerBox,
              selectedSchemeName: comboSchemeName,
            }) || ""
            : ""
          : "",
        schemePcsPerBox: shouldAllowSchemes ? schemePcsPerBox : 0,
        tax: product.tax_rate ? product.tax_rate.toString() : "0",
        priceListBasic: isFocOrder ? focPriceListBasic : product.basic_rate?.toString() || "0",
        itemTotal: calculateRowItemTotal({
          qty: "",
          boxes: "",
          priceListBasic: isFocOrder ? focPriceListBasic : product.basic_rate?.toString() || "0",
          basicPrice: "",
        }),
      });
      if (!shouldAllowSchemes) {
        return;
      }
      try {
        const schemeData = await schemeService.getSchemes(assignedStateCode);
        console.log("Fetched schemes:", schemeData);
        const schemes = schemeData.map((s) => ({
          label: s.scheme_name,
          value: String(s.scheme_id),
        }));
        if (!comboSchemeId && comboSchemeName) {
          const comboScheme = schemes.find((scheme) => scheme.label === comboSchemeName);
          comboSchemeId = comboScheme?.value ?? null;
        }
        updateRow(rowId, {
          schemes,
          selectedScheme: comboSchemeId,
          schemeSelections: comboSchemeId
            ? [createSchemeSelection(comboSchemeId)]
            : [],
          isScheme: Boolean(comboSchemeId),
        });
      } catch {
        // no schemes available — leave schemes: []
      }
      let schemeLtrsPerBox = 0;

      if (comboSchemeName) {
        const comboItems = dedupePartyProducts(partyProducts.filter(
          (p: any) => p.combo_scheme_name === comboSchemeName
        ));
        schemeLtrsPerBox = calculateLtrsPerBox(comboItems);

        if (comboItems.length <= 1 || schemeLtrsPerBox <= 0) {
          try {
            const fullComboItems = await schemeService.getSchemeProductsByName(
              comboSchemeName,
              assignedStateCode,
            );
            schemeLtrsPerBox = calculateLtrsPerBox(fullComboItems);
          } catch {
            try {
              const fullComboItems = await schemeService.getComboByItemCode(
                String(product.item_code),
                assignedStateCode,
              );
              schemeLtrsPerBox = calculateLtrsPerBox(fullComboItems);
            } catch {
              // Keep the local fallback value if combo expansion fails.
            }
          }
        }

      }

      if (schemeLtrsPerBox <= 0) {
        schemeLtrsPerBox = calculateComboLtrsFromItemName({
          itemName: product.item_name,
          defaultPcs: pcsPerCase,
        });
      }

      setItemRows((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;

          const qtyNum = toNumber(row.qty);
          const ltrs = calculateRowLtrs({
            qty: qtyNum,
            pcs: pcsPerCase,
            salPackUnit,
          });
          const currentSelections = getRowSchemeSelections(row);
          const baseSelections = currentSelections.length
            ? currentSelections
            : [createSchemeSelection(comboSchemeId)];

          return {
            ...row,
            selectedScheme: comboSchemeId,
            isScheme: Boolean(comboSchemeId),
            isComboProduct,
            schemePcsPerBox,
            schemeLtrsPerBox,
            schemeSelections: Boolean(comboSchemeId)
              ? baseSelections.map((selection, index) => ({
                ...selection,
                selectedScheme: selection.selectedScheme ?? (index === 0 ? comboSchemeId : null),
                schemeQty: calculateRowSchemeQty({
                  qty: row.qty,
                  pcs: pcsPerCase,
                  schemePcsPerBox,
                  selectedSchemeName: getSelectedSchemeName({
                    selectedScheme: selection.selectedScheme ?? (index === 0 ? comboSchemeId : null),
                    schemes: row.schemes,
                    fallbackSchemeName: comboSchemeName,
                  }),
                }) || selection.schemeQty,
              }))
              : [],
            schemeQty: Boolean(comboSchemeId)
              ? calculateRowSchemeQty({
                qty: row.qty,
                pcs: pcsPerCase,
                schemePcsPerBox,
                selectedSchemeName: getSelectedSchemeName({
                  selectedScheme: comboSchemeId,
                  schemes: row.schemes,
                  fallbackSchemeName: comboSchemeName,
                }),
              }) || row.schemeQty
              : "",
            ltrs,
          };
        }),
      );

    }
  };

  const handleRowIsSchemeToggle = (rowId: number, value: boolean) => {
    if (!value) {
      setItemRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const qtyNum = parseFloat(r.qty) || 0;
          const pcsNum = parseFloat(r.pcs) || 0;
          const totalPcs = qtyNum * pcsNum;
          const boxes = totalPcs.toString();
          return {
            ...r,
            isScheme: false,
            selectedScheme: null,
            schemeSelections: [],
            schemeQty: "",
            schemePcsPerBox: 0,
            schemeLtrsPerBox: 0,
            boxes,
            ltrs: calculateRowLtrs({
              qty: qtyNum,
              pcs: r.pcs,
              salPackUnit: r.salPackUnit,
            }),
            itemTotal: calculateRowItemTotal({
              qty: qtyNum,
              boxes,
              priceListBasic: r.priceListBasic,
              basicPrice: r.basicPrice,
            }),
          };
        }),
      );
    } else {
      setItemRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const autoSelectedScheme =
            r.selectedScheme ??
            (r.schemes.length === 1 ? String(r.schemes[0].value) : null);
          const nextSelection = createSchemeSelection(
            autoSelectedScheme,
            calculateRowSchemeQty({
              qty: r.qty,
              pcs: r.pcs,
              schemePcsPerBox: r.schemePcsPerBox,
              selectedSchemeName: getSelectedSchemeName({
                selectedScheme: autoSelectedScheme,
                schemes: r.schemes,
              }),
            }) || r.schemeQty,
          );

          return {
            ...r,
            isScheme: true,
            selectedScheme: autoSelectedScheme,
            schemeSelections: getRowSchemeSelections(r).length
              ? getRowSchemeSelections(r)
              : [nextSelection],
            schemeQty:
              calculateRowSchemeQty({
                qty: r.qty,
                pcs: r.pcs,
                schemePcsPerBox: r.schemePcsPerBox,
                selectedSchemeName: getSelectedSchemeName({
                  selectedScheme: autoSelectedScheme,
                  schemes: r.schemes,
                }),
              }) || r.schemeQty,
          };
        }),
      );
    }
  };

  const handleRowQtyChange = (rowId: number, value: string) => {
    if (!/^\d*\.?\d*$/.test(value)) return;

    setItemRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;

        const qtyNum = parseFloat(value) || 0;
        const pcsNum = parseFloat(r.pcs) || 0;

        const totalPcs = qtyNum * pcsNum;
        const schemeSelections = getRowSchemeSelections(r).map((selection) => ({
          ...selection,
          schemeQty: selection.selectedScheme
            ? calculateRowSchemeQty({
              qty: value,
              pcs: r.pcs,
              schemePcsPerBox: r.schemePcsPerBox,
              selectedSchemeName: getSelectedSchemeName({
                selectedScheme: selection.selectedScheme,
                schemes: r.schemes,
              }),
            }) || selection.schemeQty
            : selection.schemeQty,
        }));

        return {
          ...r,
          qty: value, // ✅ ONLY user input
          isQtyManual: true,
          schemeSelections,
          schemeQty: schemeSelections[0]?.schemeQty ?? r.schemeQty,
          boxes: totalPcs ? totalPcs.toString() : "",
          ltrs: calculateRowLtrs({
            qty: value,
            pcs: r.pcs,
            salPackUnit: r.salPackUnit,
          }),
          itemTotal: calculateRowItemTotal({
            qty: value,
            boxes: totalPcs.toString(),
            priceListBasic: r.priceListBasic,
            basicPrice: r.basicPrice,
          }),
        };
      })
    );
  };

  const handleRowTotalPcsChange = (rowId: number, value: string) => {
    if (!/^\d*\.?\d*$/.test(value)) return;

    setItemRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;

        const pcsNum = parseFloat(r.pcs) || 0;
        const totalPcs = parseFloat(value) || 0;
        const derivedQty =
          value && pcsNum > 0
            ? formatCalculationNumber(totalPcs / pcsNum)
            : "";
        const schemeSelections = getRowSchemeSelections(r).map((selection) => ({
          ...selection,
          schemeQty: selection.selectedScheme
            ? calculateRowSchemeQty({
              qty: derivedQty,
              pcs: r.pcs,
              schemePcsPerBox: r.schemePcsPerBox,
              selectedSchemeName: getSelectedSchemeName({
                selectedScheme: selection.selectedScheme,
                schemes: r.schemes,
              }),
            }) || ""
            : selection.schemeQty,
        }));

        return {
          ...r,
          qty: derivedQty,
          isQtyManual: true,
          schemeSelections,
          schemeQty: schemeSelections[0]?.schemeQty ?? "",
          boxes: value,
          ltrs:
            totalPcs > 0
              ? (totalPcs * toNumber(r.salPackUnit)).toFixed(2)
              : "",
          itemTotal: calculateRowItemTotal({
            qty: derivedQty,
            boxes: value,
            priceListBasic: r.priceListBasic,
            basicPrice: r.basicPrice,
          }),
        };
      }),
    );
  };

  const handleRowSchemeQtyChange = (rowId: number, value: string, selectionId?: number) => {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setItemRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const schemeSelections = getRowSchemeSelections(r).map((selection, index) =>
          selection.id === selectionId || (!selectionId && index === 0)
            ? { ...selection, schemeQty: value }
            : selection,
        );
        return {
          ...r,
          schemeSelections,
          schemeQty: schemeSelections[0]?.schemeQty ?? value,
        };
      })
    );
  };

  const handleRowSchemeChange = (rowId: number, scheme: string, selectionId?: number) => {
    setItemRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const schemeSelections = getRowSchemeSelections(row).map((selection, index) => {
          if (selection.id !== selectionId && (selectionId || index !== 0)) return selection;
          return {
            ...selection,
            selectedScheme: scheme,
            schemeQty:
              Boolean(scheme)
                ? calculateRowSchemeQty({
                  qty: row.qty,
                  pcs: row.pcs,
                  schemePcsPerBox: row.schemePcsPerBox,
                  selectedSchemeName: getSelectedSchemeName({
                    selectedScheme: scheme,
                    schemes: row.schemes,
                  }),
                }) || selection.schemeQty
                : "",
          };
        });
        const firstSelection = schemeSelections[0];

        return {
          ...row,
          isScheme: schemeSelections.some((selection) => Boolean(selection.selectedScheme)),
          selectedScheme: firstSelection?.selectedScheme ?? null,
          schemeSelections,
          schemeQty: firstSelection?.schemeQty ?? "",
        };
      }),
    );
  };

  const handleAddRowScheme = (rowId: number) => {
    setItemRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const nextSelections = [
          ...getRowSchemeSelections(row),
          createSchemeSelection(row.schemes.length === 1 ? String(row.schemes[0].value) : null),
        ];
        return {
          ...row,
          isScheme: true,
          selectedScheme: nextSelections[0]?.selectedScheme ?? null,
          schemeSelections: nextSelections,
          schemeQty: nextSelections[0]?.schemeQty ?? "",
        };
      }),
    );
  };

  const handleRemoveRowScheme = (rowId: number, selectionId: number) => {
    setItemRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        const nextSelections = getRowSchemeSelections(row).filter(
          (selection) => selection.id !== selectionId,
        );
        return {
          ...row,
          isScheme: nextSelections.length > 0,
          selectedScheme: nextSelections[0]?.selectedScheme ?? null,
          schemeSelections: nextSelections,
          schemeQty: nextSelections[0]?.schemeQty ?? "",
        };
      }),
    );
  };

  //   const handleRowQtyChange = (rowId: number, value: string) => {
  //   // Allow empty input
  //   if (value === "") {
  //   setItemRows((prev) =>
  //     prev.map((r) =>
  //       r.id === rowId
  //         ? {
  //             ...r,
  //             qty: "",
  //             boxes: "",
  //             ltrs: "0",        // ✅ match type (string if that's your type)
  //             itemTotal: "0",   // ✅ important if required
  //           }
  //         : r
  //     )
  //   );
  //   return;
  // }

  //   // Allow only numeric + decimal typing
  //   if (!/^\d*\.?\d*$/.test(value)) return;

  //   // ❗ IMPORTANT: Skip calculation for incomplete decimals like "1."
  //   if (value.endsWith(".")) {
  //     setItemRows((prev) =>
  //       prev.map((r) =>
  //         r.id === rowId ? { ...r, qty: value } : r
  //       )
  //     );
  //     return;
  //   }

  //   setItemRows((prev) =>
  //     prev.map((r) => {
  //       if (r.id !== rowId) return r;

  //       const qtyNum = parseFloat(value);
  //       const pcsNum = parseFloat(r.pcs) || 0;

  //       const totalPcs = qtyNum * pcsNum;

  //       return {
  //         ...r,
  //         qty: value, // ✅ keep EXACT input
  //         boxes: totalPcs.toString(),
  //         ltrs: calculateRowLtrs({
  //           qty: value,
  //           pcs: r.pcs,
  //           salPackUnit: r.salPackUnit,
  //         }),
  //         schemeQty: r.isScheme
  //           ? calculateRowSchemeQty({
  //               qty: value,
  //               pcs: r.pcs,
  //               schemePcsPerBox: r.schemePcsPerBox,
  //               selectedSchemeName: getSelectedSchemeName({
  //                 selectedScheme: r.selectedScheme,
  //                 schemes: r.schemes,
  //               }),
  //             }) || r.schemeQty
  //           : r.schemeQty,
  //         itemTotal: calculateRowItemTotal({
  //           boxes: totalPcs.toString(),
  //           priceListBasic: r.priceListBasic,
  //         }),
  //       };
  //     })
  //    );
  //   };

  // const handleRowQtyChange = (rowId: number, value: string) => {
  //   setItemRows((prev) =>
  //     prev.map((r) => {
  //       if (r.id !== rowId) return r;
  //       const qtyNum = parseFloat(value) || 0;
  //       const pcsNum = parseFloat(r.pcs) || 0;
  //       const totalPcs = qtyNum * pcsNum;
  //       const ltrs = calculateRowLtrs({
  //         qty: value,
  //         pcs: r.pcs,
  //         salPackUnit: r.salPackUnit,
  //       });
  //       return {
  //         ...r,
  //         qty: value,
  //         boxes: totalPcs.toString(),
  //         schemeQty:
  //           r.isScheme
  //             ? calculateRowSchemeQty({
  //                 qty: value,
  //                 pcs: r.pcs,
  //                 schemePcsPerBox: r.schemePcsPerBox,
  //                 selectedSchemeName: getSelectedSchemeName({
  //                   selectedScheme: r.selectedScheme,
  //                   schemes: r.schemes,
  //                 }),
  //               }) || r.schemeQty
  //             : r.schemeQty,
  //         ltrs,
  //         itemTotal: calculateRowItemTotal({
  //           boxes: totalPcs.toString(),
  //           priceListBasic: r.priceListBasic,
  //         }),
  //       };
  //     }),
  //   );
  // };

  const handleRowBasicPriceChange = (rowId: number, value: string) => {
    setItemRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          basicPrice: value,
          itemTotal: calculateRowItemTotal({
            qty: r.qty,
            boxes: r.boxes,
            priceListBasic: r.priceListBasic,
            basicPrice: value,
          }),
        };
      }),
    );
  };

  const addItem = () => {
    const hasIncompleteRow = itemRows.some(
      (row) =>
        !row.selectedCategory ||
        !row.selectedProduct ||
        !row.qty ||
        (!row.basicPrice && !row.priceListBasic) ||
        !row.boxes,
    );

    if (hasIncompleteRow) {
      Alert.alert(
        "Incomplete Item",
        "Please fill all fields in the current item row before adding a new row.",
      );
      return;
    }

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

    // if ((row.isScheme || row.isComboProduct) && !row.selectedScheme) {
    //   Alert.alert("Error", "Please select a scheme before confirming this item");
    //   return;
    // }

    const product = partyProducts.find(
      (p: any) => String(p.item_code) === String(row.selectedProduct),
    );
    if (!product) return;

    const effectiveTotal =
      parseFloat(row.itemTotal) ||
      toNumber(calculateRowItemTotal({
        qty: row.qty,
        boxes: row.boxes,
        priceListBasic: row.priceListBasic,
        basicPrice: row.basicPrice,
      }));

    const effectiveSchemes = isFocOrder
      ? []
      : getRowSchemeSelections(row)
        .filter((selection) => Boolean(selection.selectedScheme))
        .map((selection) => ({
          scheme: selection.selectedScheme,
          schemeName: getSelectedSchemeName({
            selectedScheme: selection.selectedScheme,
            schemes: row.schemes,
          }),
          schemeQty: parseFloat(selection.schemeQty) || 0,
        }));
    const firstScheme = effectiveSchemes[0];

    const newItem: OrderItemType = {
      id: Date.now(),
      itemCode: product.item_code || "",
      itemName: product.item_name || "",
      category: row.selectedCategory || "",
      brand: row.selectedBrand || "",
      variety: row.selectedVariety || "",
      type: row.selectedType || "",
      qty: parseFloat(row.qty) || 0,
      scheme: firstScheme?.scheme ?? null,
      schemeName: firstScheme?.schemeName ?? null,
      schemeQty: firstScheme ? firstScheme.schemeQty : 0,
      schemes: effectiveSchemes,
      pcs: parseFloat(row.pcs) || 0,
      boxes: parseFloat(row.boxes) || 0,
      ltrs: parseFloat(row.ltrs) || 0,
      basicPrice: parseFloat(row.basicPrice) || 0,
      total: effectiveTotal,
      taxRate: parseFloat(row.tax) || 0,
      priceListBasic: isFocOrder ? FOC_PRICE_LIST_BASIC : parseFloat(row.priceListBasic) || product.basic_rate || 0,
    };

    setOrderItems((prev) => [...prev, newItem]);
    // FIX 3: Remove the confirmed row so the next item starts fresh
    setItemRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Rebuild a fully-populated editable ItemRow (with cascading dropdown option
  // lists) from a stored order item. Used both when the user taps "edit" on a
  // confirmed item, and when resuming a draft whose item was never confirmed.
  const buildEditableRowFromItem = (confirmedItem: OrderItemType): ItemRow => {
    const matchedProduct = partyProducts.find(
      (product: any) =>
        String(product.item_code) === String(confirmedItem.itemCode),
    );

    const categoryProducts = partyProducts.filter(
      (product: any) => product.category === confirmedItem.category,
    );
    const uniqueBrands = [
      ...new Set<string>(
        categoryProducts.map((product: any) => product.brand).filter(Boolean),
      ),
    ];

    const brandProducts = categoryProducts.filter(
      (product: any) => product.brand === confirmedItem.brand,
    );
    const uniqueVarieties = [
      ...new Set<string>(
        brandProducts.map((product: any) => product.variety).filter(Boolean),
      ),
    ];

    const varietyProducts = brandProducts.filter(
      (product: any) => product.variety === confirmedItem.variety,
    );
    const typesSet = new Set<string>();
    varietyProducts.forEach((product: any) =>
      typesSet.add(extractType(product.item_name)),
    );
    const sortedTypes = [...typesSet].sort((a, b) => {
      if (a === "Others") return 1;
      if (b === "Others") return -1;
      return parseFloat(a) - parseFloat(b);
    });

    const typeProducts = varietyProducts.filter(
      (product: any) => extractType(product.item_name) === confirmedItem.type,
    );

    const confirmedSchemes = getConfirmedSchemes(confirmedItem);
    const firstScheme = confirmedSchemes[0];
    const schemeSelections = confirmedSchemes.map((scheme) =>
      createSchemeSelection(
        scheme.scheme ? String(scheme.scheme) : null,
        String(scheme.schemeQty || 0),
      ),
    );

    const comboSchemeName =
      matchedProduct?.combo_scheme_name ??
      firstScheme?.schemeName ??
      null;

    let schemePcsPerBox = 0;
    let schemeLtrsPerBox = 0;

    if (comboSchemeName) {
      const comboItems = dedupePartyProducts(
        partyProducts.filter(
          (product: any) => product.combo_scheme_name === comboSchemeName,
        ),
      );
      schemePcsPerBox = comboItems
        .filter(
          (product: any) =>
            String(product.item_code) !== String(confirmedItem.itemCode),
        )
        .reduce((sum, product: any) => sum + toNumber(product.sal_factor2), 0);
      schemeLtrsPerBox = calculateLtrsPerBox(comboItems);
    }

    if (
      schemePcsPerBox <= 0 &&
      Number(confirmedItem.boxes) > 0 &&
      Number(firstScheme?.schemeQty) > 0
    ) {
      schemePcsPerBox =
        Number(firstScheme?.schemeQty || 0) / Number(confirmedItem.boxes || 1);
    }

    const derivedSalPackUnit =
      matchedProduct?.sal_pack_unit != null
        ? String(matchedProduct.sal_pack_unit)
        : Number(confirmedItem.qty) > 0
          ? formatCalculationNumber(
              Number(confirmedItem.ltrs || 0) / Number(confirmedItem.qty || 1),
            )
          : "0";

    const editableRow: ItemRow = {
      id: Date.now(),
      selectedCategory: confirmedItem.category || null,
      selectedBrand: confirmedItem.brand || null,
      selectedVariety: confirmedItem.variety || null,
      selectedType: confirmedItem.type || null,
      selectedProduct: confirmedItem.itemCode || null,
      selectedScheme: firstScheme?.scheme ? String(firstScheme.scheme) : null,
      schemeSelections,
      isScheme: schemeSelections.length > 0,
      isComboProduct:
        Boolean(matchedProduct?.combo_scheme_name) ||
        String(confirmedItem.itemName || "").includes("+"),
      brands: uniqueBrands.sort().map((brand) => ({ label: brand, value: brand })),
      varieties: uniqueVarieties
        .sort()
        .map((variety) => ({ label: variety, value: variety })),
      types: sortedTypes.map((type) => ({ label: type, value: type })),
      products: typeProducts.map((product: any) => ({
        label: `${product.item_name} (₹${product.basic_rate})`,
        value: product.item_code,
      })),
      schemes:
        allSchemes.length > 0
          ? allSchemes
          : confirmedSchemes.map((scheme) => ({
              label: scheme.schemeName || String(scheme.scheme || ""),
              value: String(scheme.scheme || ""),
            })),
      qty: String(confirmedItem.qty || 0),
      schemeQty: String(firstScheme?.schemeQty || 0),
      pcs: String(confirmedItem.pcs || 0),
      salPackUnit: derivedSalPackUnit,
      boxes: String(confirmedItem.boxes || 0),
      ltrs: String(confirmedItem.ltrs || 0),
      schemePcsPerBox,
      schemeLtrsPerBox,
      basicPrice: String(confirmedItem.basicPrice || 0),
      priceListBasic: String(isFocOrder ? FOC_PRICE_LIST_BASIC : confirmedItem.priceListBasic || 0),
      tax: String(confirmedItem.taxRate || 0),
      itemTotal: String(confirmedItem.total || 0),
      isQtyManual: true,
    };

    return editableRow;
  };

  const editOrderItem = (id: number) => {
    const confirmedItem = orderItems.find((item) => item.id === id);
    if (!confirmedItem) return;
    const editableRow = buildEditableRowFromItem(confirmedItem);
    setOrderItems((prev) => prev.filter((item) => item.id !== id));
    setItemRows((prev) => [...prev, editableRow]);
  };

  const removeOrderItem = (id: number) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== id));
  };

  // ─── Totals (FIX 5) ────────────────────────────────────────────────────────

  const totalWithoutTax = orderItems
    .reduce((sum, item) => sum + item.total, 0)
    .toFixed(2);

  const totalTaxAmount = (
    isFocOrder
      ? 0
      : orderItems.reduce((sum, item) => {
        const base = item.total || 0;
        return sum + (base * item.taxRate) / 100;
      }, 0)
  ).toFixed(2);

  const grandTotal = (
    parseFloat(totalWithoutTax) + parseFloat(totalTaxAmount)
  ).toFixed(2);


  const handleSubmit = async () => {
    if (!partyName) return Alert.alert("Error", "Select a party");
    if (!branch) return Alert.alert("Error", "Select dispatch location");
    if (!company) return Alert.alert("Error", "Select company");
    const resolvedBillToId = selectedBillTo ?? selectedShipTo;
    const resolvedShipToId = selectedShipTo ?? selectedBillTo;
    if (!resolvedBillToId && !resolvedShipToId) {
      return Alert.alert("Error", "Select at least one address");
    }
    // if (!poNumber) return Alert.alert("Error", "Select Po Number");
    if (!delivery) return Alert.alert("Error", "Select delivery date");
    if (!branch) return Alert.alert("Error", "Select dispatch location");

    if (orderItems.length === 0)
      return Alert.alert("Error", "Add at least one item");

    console.log("logdata2 " + !partyName + orderItems.length);
    if (!partyName || orderItems.length === 0) {
      Alert.alert("Error", "Select a party and add at least one item");
      return;
    }
    try {
      setLoading(true);
      const selectedParty = findSelectedParty(partyName);
      const parsedParty = parsePartyValue(partyName);
      const selectedBillToAddress =
        billToAddresses.find((a) => a.value === resolvedBillToId) ??
        shipToAddresses.find((a) => a.value === resolvedBillToId);
      const selectedShipToAddress =
        shipToAddresses.find((a) => a.value === resolvedShipToId) ??
        billToAddresses.find((a) => a.value === resolvedShipToId);
      const payload: CreateOrderPayload = {
        user_id: user?.id || 0,
        card_code: selectedParty?.cardCode ?? parsedParty.cardCode,
        card_name: selectedParty?.cardName ?? "",
        bill_to_id: resolvedBillToId ?? 0,
        bill_to_address: selectedBillToAddress?.name ?? "",
        ship_to_id: resolvedShipToId ?? 0,
        ship_to_address: selectedShipToAddress?.name ?? "",
        dispatch_from_id: branch ?? 0,
        dispatch_from_name:
          branches.find((d) => d.value === branch)?.label ?? "",
        delivery_date: delivery,
        company: String(company ?? ""),
        remarks: String(comment ?? ""),
        is_foc: isFocOrder,
        ...(shouldShowPoNumber ? { po_number: String(poNumber ?? "") } : {}),
        items: orderItems.map((item) => {
          const schemes = getConfirmedSchemes(item);
          const firstScheme = schemes[0];
          return {
            item_code: String(item.itemCode ?? ""),
            item_name: String(item.itemName ?? ""),
            category: String(item.category ?? ""),
            brand: String(item.brand ?? ""),
            variety: String(item.variety ?? ""),
            item_type: String(item.type ?? ""),
            qty: Number(item.boxes) || 0,
            scheme_id: firstScheme?.scheme ? Number(firstScheme.scheme) : null,
            scheme_name: firstScheme?.schemeName ? String(firstScheme.schemeName) : null,
            is_scheme_visible: schemes.length > 0,
            scheme_qty: firstScheme?.scheme ? Number(firstScheme.schemeQty) || 0 : 0,
            schemes: schemes.map((scheme) => ({
              scheme_id: scheme.scheme ? Number(scheme.scheme) : null,
              scheme_name: scheme.schemeName ? String(scheme.schemeName) : null,
              scheme_qty: Number(scheme.schemeQty) || 0,
            })),
            pcs: Number(item.pcs) || 0,
            boxes: Number(item.qty) || 0,
            ltrs: Number(item.ltrs) || 0,
            basic_price: Number(item.basicPrice) || 0,
            total: Number(item.total) || 0,
            tax_rate: Number(item.taxRate) || 0,
            price_list_basic: Number(item.priceListBasic) || 0,
          };
        }),
      };
      console.log("Final payload for submission:", JSON.stringify(payload, null, 2));
      if (isEditMode) {

        const response = await orderService.updateOrder(Number(editOrderId), payload);
        if (response?.id || response?.order_number) {
          Alert.alert(
            "Success",
            response.message || "Order updated successfully",
            [{ text: "OK", onPress: () => router.back() }]
          );
        } else {
          Alert.alert("Error", response?.message || "Failed to update order");
        }

      } else {

        console.log("Create order payload:", JSON.stringify(payload, null, 2));
        const response = await orderService.createOrder(payload);
        if (response?.order_number || response?.message?.includes("Order sent")) {
          setOrderResult({
            orderNumber: response.order_number || "",
            message: response.message || "Order created successfully",
            needsApproval: response.needs_approval || false,
          });
          setSuccessModal(true);
          handleClear({ keepSuccessModal: true });
        } else {
          Alert.alert("Error", "Something went wrong. Please try again.");
        }

      }
    } catch (error) {
      Alert.alert("Error", isEditMode ? "Failed to update order" : "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  // Map an in-progress (unconfirmed) item row to the draft payload shape, so a
  // draft also captures item details the user filled in but didn't confirm.
  const mapUnconfirmedRowToDraftItem = (row: ItemRow) => {
    const product = partyProducts.find(
      (p: any) => String(p.item_code) === String(row.selectedProduct),
    );
    const rowSchemes = isFocOrder
      ? []
      : getRowSchemeSelections(row)
          .filter((selection) => Boolean(selection.selectedScheme))
          .map((selection) => ({
            scheme: selection.selectedScheme,
            schemeName: getSelectedSchemeName({
              selectedScheme: selection.selectedScheme,
              schemes: row.schemes,
            }),
            schemeQty: parseFloat(selection.schemeQty) || 0,
          }));
    const firstScheme = rowSchemes[0];
    return {
      item_code: String(product?.item_code ?? row.selectedProduct ?? ""),
      item_name: String(product?.item_name ?? ""),
      category: String(row.selectedCategory ?? ""),
      brand: String(row.selectedBrand ?? ""),
      variety: String(row.selectedVariety ?? ""),
      item_type: String(row.selectedType ?? ""),
      // qty/boxes are swapped in the payload to mirror confirmed items.
      qty: Number(row.boxes) || 0,
      scheme_id: firstScheme?.scheme ? Number(firstScheme.scheme) : null,
      scheme_name: firstScheme?.schemeName ? String(firstScheme.schemeName) : null,
      is_scheme_visible: rowSchemes.length > 0,
      scheme_qty: firstScheme?.scheme ? Number(firstScheme.schemeQty) || 0 : 0,
      schemes: rowSchemes.map((scheme) => ({
        scheme_id: scheme.scheme ? Number(scheme.scheme) : null,
        scheme_name: scheme.schemeName ? String(scheme.schemeName) : null,
        scheme_qty: Number(scheme.schemeQty) || 0,
      })),
      pcs: Number(row.pcs) || 0,
      boxes: Number(row.qty) || 0,
      ltrs: Number(row.ltrs) || 0,
      basic_price: Number(row.basicPrice) || 0,
      total:
        Number(row.itemTotal) ||
        Number(
          calculateRowItemTotal({
            qty: row.qty,
            boxes: row.boxes,
            priceListBasic: row.priceListBasic,
            basicPrice: row.basicPrice,
          }),
        ) ||
        0,
      tax_rate: Number(row.tax) || 0,
      price_list_basic: Number(row.priceListBasic) || 0,
    };
  };

  // Save the order (even if incomplete) as a draft. Skips all validation and the
  // approval flow; the draft can be resumed later from the Drafts screen.
  const handleSaveDraft = async () => {
    try {
      setSavingDraft(true);
      const selectedParty = partyName ? findSelectedParty(partyName) : null;
      const parsedParty = partyName ? parsePartyValue(partyName) : { cardCode: "" };
      const resolvedBillToId = selectedBillTo ?? selectedShipTo ?? 0;
      const resolvedShipToId = selectedShipTo ?? selectedBillTo ?? 0;
      const selectedBillToAddress =
        billToAddresses.find((a) => a.value === resolvedBillToId) ??
        shipToAddresses.find((a) => a.value === resolvedBillToId);
      const selectedShipToAddress =
        shipToAddresses.find((a) => a.value === resolvedShipToId) ??
        billToAddresses.find((a) => a.value === resolvedShipToId);

      const payload: Partial<CreateOrderPayload> = {
        user_id: user?.id || 0,
        card_code: selectedParty?.cardCode ?? parsedParty.cardCode ?? "",
        card_name: selectedParty?.cardName ?? "",
        bill_to_id: resolvedBillToId ?? 0,
        bill_to_address: selectedBillToAddress?.name ?? "",
        ship_to_id: resolvedShipToId ?? 0,
        ship_to_address: selectedShipToAddress?.name ?? "",
        dispatch_from_id: branch ?? 0,
        dispatch_from_name: branches.find((d) => d.value === branch)?.label ?? "",
        delivery_date: delivery || "",
        company: String(company ?? ""),
        remarks: String(comment ?? ""),
        is_foc: isFocOrder,
        ...(shouldShowPoNumber ? { po_number: String(poNumber ?? "") } : {}),
        items: orderItems.map((item) => {
          const schemes = getConfirmedSchemes(item);
          const firstScheme = schemes[0];
          return {
            item_code: String(item.itemCode ?? ""),
            item_name: String(item.itemName ?? ""),
            category: String(item.category ?? ""),
            brand: String(item.brand ?? ""),
            variety: String(item.variety ?? ""),
            item_type: String(item.type ?? ""),
            qty: Number(item.boxes) || 0,
            scheme_id: firstScheme?.scheme ? Number(firstScheme.scheme) : null,
            scheme_name: firstScheme?.schemeName ? String(firstScheme.schemeName) : null,
            is_scheme_visible: schemes.length > 0,
            scheme_qty: firstScheme?.scheme ? Number(firstScheme.schemeQty) || 0 : 0,
            schemes: schemes.map((scheme) => ({
              scheme_id: scheme.scheme ? Number(scheme.scheme) : null,
              scheme_name: scheme.schemeName ? String(scheme.schemeName) : null,
              scheme_qty: Number(scheme.schemeQty) || 0,
            })),
            pcs: Number(item.pcs) || 0,
            boxes: Number(item.qty) || 0,
            ltrs: Number(item.ltrs) || 0,
            basic_price: Number(item.basicPrice) || 0,
            total: Number(item.total) || 0,
            tax_rate: Number(item.taxRate) || 0,
            price_list_basic: Number(item.priceListBasic) || 0,
          };
        }).concat(
          // Also capture item rows the user filled in but didn't confirm, so
          // their details aren't lost when saving the draft. A row counts as
          // "started" if any of category/brand/sub-group/type/product/qty is set.
          itemRows
            .filter(
              (row) =>
                row.selectedCategory ||
                row.selectedBrand ||
                row.selectedVariety ||
                row.selectedType ||
                row.selectedProduct ||
                Number(row.qty) > 0 ||
                Number(row.boxes) > 0,
            )
            .map(mapUnconfirmedRowToDraftItem),
        ),
      };

      // Only update in place when resuming an existing draft.
      const draftOrderId =
        loadedIsDraftOrder && editOrderId ? Number(editOrderId) : undefined;
      const response = await orderService.saveDraft(payload, draftOrderId);

      if (response?.id || response?.order_number) {
        handleClear();
        Alert.alert("Draft saved", response.message || "Draft saved successfully", [
          {
            text: "View Drafts",
            onPress: () =>
              router.navigate({ pathname: "/(main)/orders/drafts" } as never),
          },
          { text: "OK" },
        ]);
      } else {
        Alert.alert("Error", response?.message || "Failed to save draft");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleClear = useCallback((options?: { keepSuccessModal?: boolean }) => {
    setPartyName(null);
    setBranch(branches.length === 1 ? branches[0].value : null);
    setCompany(companies.length === 1 ? companies[0].value : null);
    setPoNumber("");
    setComment("");
    setItemRows([]);
    setOrderItems([]);
    setBillToAddresses([]);
    setShipToAddresses([]);
    setSelectedBillTo(null);
    setSelectedShipTo(null);
    setDeliveryDate(getDefaultDeliveryDate());
    setPartyProducts([]);
    setCategories([]);
    setAssignedStateCode("");
    setAllSchemes([]);
    setEditOrderLoaded(false);
    setLoadedIsFocOrder(false);
    setLoadedIsDraftOrder(false);
    setSelectedTemplateParty(null);
    setSelectedTemplateOrder(null);
    setTemplateOrders([]);
    setIsTemplateOpen(false);
    if (!options?.keepSuccessModal) {
      setSuccessModal(false);
      setOrderResult(null);
    }
  }, [branches, companies]);

  const handleBack = useCallback(() => {
    handleClear();

    if (isEditMode && from) {
      router.replace({
        pathname: `/${from}` as any,
        params: fromOrderId ? { orderId: fromOrderId } : undefined,
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.back();
  }, [from, fromOrderId, isEditMode, navigation, router]);

  useAndroidBackOverride(
    useCallback(() => {
      handleBack();
      return true;
    }, [handleBack]),
  );

  const handleClearRef = useRef(handleClear);
  handleClearRef.current = handleClear;

  useFocusEffect(
    useCallback(() => {
      if (isExplicitCreateMode) {
        handleClearRef.current();
        clearEditRouteParams();
      }

      return () => {
        setShowPicker(false);
        setTemplateLoading(false);
      };
    }, [isExplicitCreateMode, clearEditRouteParams]),
  );

  useEffect(() => {
    navigation.setOptions({
      title: isEditMode
        ? (isFocOrder ? "Edit FOC" : "Edit Order")
        : (isFocOrder ? "Create FOC" : "Create Order"),
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} style={{ marginLeft: 10 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isEditMode, isFocOrder, handleBack]);

  if (dataLoading || (isEditMode && !editOrderLoaded)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{isEditMode && !dataLoading ? "Loading order..." : "Loading..."}</Text>
      </View>
    );
  }

  return (
    <StateWrapper loading={dataLoading} error={error} onRetry={() => { /* Handled by useEffect */ }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Modal
          visible={templateLoading}
          transparent
          animationType="fade"
        >
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingPopupCard}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingPopupText}>Loading template...</Text>
            </View>
          </View>
        </Modal>

        <ScrollView
          style={styles.scrollView}
          scrollEnabled={!isAddressDropdownOpen}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            if (isTemplateOpen) setIsTemplateOpen(false);
          }}
        >
          {/* ── Order Details Card ─────────────────────────────────────────── */}
          <Surface style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Order Details</Text>
              {/* ── Templates Dropdown (Top Right) ─────────────────────────────── */}
              <View style={styles.templateContainer}>
                <TouchableOpacity
                  style={styles.templateButton}
                  onPress={() => setIsTemplateOpen(!isTemplateOpen)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="copy-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.templateButtonText}>Template</Text>
                  <Ionicons name={isTemplateOpen ? "chevron-up" : "chevron-down"} size={16} color={COLORS.primary} />
                </TouchableOpacity>

                {isTemplateOpen && (
                  <>
                    <TouchableWithoutFeedback onPress={() => setIsTemplateOpen(false)}>
                      <View style={styles.templateOverlay} />
                    </TouchableWithoutFeedback>
                    <Surface
                      style={styles.templateDropdownContainer}
                      onStartShouldSetResponder={() => true}
                    >
                      <Dropdown
                        label="Select Party"
                        data={templateParties}
                        value={selectedTemplateParty}
                        onChange={handleTemplatePartyChange}
                        placeholder="Select Party"
                        searchable={true}
                        mode="modal"
                        leftIcon={null}
                        icon="storefront-outline"
                        dropdownPosition="bottom"
                      />
                      {selectedTemplateParty && (
                        <View style={{ marginTop: SPACING.sm }}>
                          <Dropdown
                            label="Select Order"
                            data={templateOrders}
                            value={selectedTemplateOrder}
                            onChange={handleTemplateOrderChange}
                            placeholder="Choose Order"
                            mode="modal"
                            leftIcon={null}
                            icon="document-text-outline"
                            disabled={templateOrders.length === 0}
                            dropdownPosition="bottom"
                          />
                        </View>
                      )}
                    </Surface>
                  </>
                )}
              </View>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Party Name *"
                data={parties}
                onChange={handlePartyChange}
                value={partyName}
                placeholder="Select Party"
                searchable={true}
                mode="modal"
                leftIcon={null}
                icon="storefront-outline"
              />
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Dropdown
                  label="Dispatch From *"
                  data={branches}
                  value={branch}
                  onChange={setBranch}
                  placeholder="Select"
                  mode="modal"
                  leftIcon={null}
                  icon="business-outline"
                />
              </View>

              <View style={styles.halfField}>
                <Dropdown
                  label="Company *"
                  data={companies}
                  value={company}
                  onChange={setCompany}
                  placeholder="Select"
                  mode="modal"
                  leftIcon={null}
                  icon="briefcase-outline"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Bill To Address *"
                data={billToAddresses}
                value={selectedBillTo}
                onChange={(value) => {
                  setSelectedBillTo(value);
                  setIsAddressDropdownOpen(false);
                }}
                placeholder="Select Bill To"
                mode="modal"
                onFocus={() => setIsAddressDropdownOpen(true)}
                onBlur={() => setIsAddressDropdownOpen(false)}
                inverted={false}
                autoScroll={false}
                dropdownPosition="bottom"
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Ship To Address *"
                data={shipToAddresses}
                value={selectedShipTo}
                onChange={(value) => {
                  setSelectedShipTo(value);
                  setIsAddressDropdownOpen(false);
                }}
                placeholder="Select Ship To"
                mode="modal"
                onFocus={() => setIsAddressDropdownOpen(true)}
                onBlur={() => setIsAddressDropdownOpen(false)}
                inverted={false}
                autoScroll={false}
                dropdownPosition="bottom"
              />
            </View>

            {shouldShowPoNumber && (
              <View style={styles.field}>
                <FixedLabelTextInput
                  label="PO Number"
                  value={poNumber}
                  onChangeText={setPoNumber}
                  mode="outlined"
                  textColor={COLORS.black}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                />
              </View>
            )}


            {/* Delivery Date — web: native <input type="date">, app: DateTimePicker */}
            <View style={styles.field}>
              {Platform.OS === "web" ? (
                // ── Web: plain HTML date input styled to match TextInput ──
                <View style={styles.webDateWrapper}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={COLORS.primary}
                    style={styles.webDateIcon}
                  />
                  <View style={styles.webDateInner}>
                    <Text style={styles.webDateLabel}>Delivery Date *</Text>
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
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowPicker(true)}
                  >
                    <TextInput
                      label="Delivery Date *"
                      value={delivery}
                      mode="outlined"
                      editable={false}
                      pointerEvents="none"
                      textColor={COLORS.black}
                      style={styles.dateInputBox}
                      outlineStyle={styles.dateInputOutline}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                      left={<TextInput.Icon icon="calendar-outline" color={COLORS.primary} />}
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
                          const formatted = selectedDate
                            .toISOString()
                            .split("T")[0];
                          setDeliveryDate(formatted);
                        }
                      }}
                    />
                  )}
                </>
              )}
            </View>
          </Surface>

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
                <Ionicons name="cube-outline" size={48} color={COLORS.primary} />
                <Text style={styles.emptyText}>No items added</Text>
                <Text style={styles.emptySubtext}>
                  {'Tap "New Item" to add products'}
                </Text>
              </View>
            ) : (
              itemRows.map((row, index) => (
                <View key={row.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemNumber}>New Item {index + 1}</Text>
                    <TouchableOpacity onPress={() => removeItem(row.id)}>
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={COLORS.error}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Category */}
                  <View style={styles.field}>
                    <Dropdown
                      label="Category *"
                      data={categories}
                      value={row.selectedCategory}
                      onChange={(val) => handleRowCategoryChange(row.id, val)}
                      placeholder="Select Category"
                      mode="modal"
                      leftIcon={null}
                      icon="grid-outline"
                    />
                  </View>

                  {/* Brand + Sub Group */}
                  <View style={styles.row}>
                    <View style={styles.halfField}>
                      <Dropdown
                        label="Brand"
                        data={row.brands}
                        value={row.selectedBrand}
                        onChange={(val) => handleRowBrandChange(row.id, val, row)}
                        placeholder="Select Brand"
                        mode="modal"
                        leftIcon={null}
                        icon="pricetag-outline"
                        disabled={!row.selectedCategory}
                      />
                    </View>
                    <View style={styles.halfField}>
                      <Dropdown
                        label="Sub Group"
                        data={row.varieties}
                        value={row.selectedVariety}
                        onChange={(val) =>
                          handleRowVarietyChange(row.id, val, row)
                        }
                        placeholder="Select Sub Group"
                        mode="modal"
                        leftIcon={null}
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
                      placeholder="Select Type"
                      mode="modal"
                      leftIcon={null}
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
                      placeholder="Select Item"
                      mode="modal"
                      leftIcon={null}
                      icon="cube-outline"
                      disabled={!row.selectedType}
                      searchable={true}
                    />
                  </View>

                  {shouldAllowSchemes && row.selectedProduct && (
                    <View style={styles.schemeBox}>
                      <View style={styles.schemeHeaderRow}>
                        <View style={styles.schemeHeaderTitle}>
                          <Ionicons name="gift-outline" size={16} color={COLORS.primary} />
                          <Text style={styles.schemeTitleText}>Schemes</Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleRowIsSchemeToggle(row.id, !row.isScheme)}
                          style={[
                            styles.schemeSwitch,
                            row.isScheme && styles.schemeSwitchOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.schemeSwitchThumb,
                              row.isScheme && styles.schemeSwitchThumbOn,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>

                      {row.isScheme && getRowSchemeSelections(row).map((selection, index) => (
                        <View key={selection.id} style={styles.schemeRow}>
                          <View style={styles.schemeDropdownField}>
                            <Dropdown
                              label={`Scheme ${index + 1}`}
                              data={row.schemes}
                              value={selection.selectedScheme}
                              onChange={(val) => handleRowSchemeChange(row.id, val, selection.id)}
                              placeholder="Select Scheme"
                              mode="modal"
                              leftIcon={null}
                              icon="gift-outline"
                              disabled={!row.isScheme}
                            />
                          </View>
                          <View style={styles.schemeQtyField}>
                            <FixedLabelTextInput
                              label="Qty"
                              textColor={COLORS.black}
                              value={selection.schemeQty ?? ""}
                              onChangeText={(val) => handleRowSchemeQtyChange(row.id, val, selection.id)}
                              mode="outlined"
                              keyboardType="numeric"
                              style={styles.input}
                              outlineColor={COLORS.border}
                              activeOutlineColor={COLORS.primary}
                              editable={true}
                            />
                          </View>
                          {getRowSchemeSelections(row).length > 1 ? (
                            <TouchableOpacity
                              style={styles.schemeRemoveBtn}
                              onPress={() => handleRemoveRowScheme(row.id, selection.id)}
                            >
                              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ))}

                      {row.isScheme && (
                        <TouchableOpacity
                          style={styles.addSchemeBtn}
                          onPress={() => handleAddRowScheme(row.id)}
                        >
                          <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
                          <Text style={styles.addSchemeBtnText}>Add More Scheme</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* PCS per case / Ltrs / Total PCS */}
                  <View style={styles.row}>
                    <View style={styles.thirdField}>
                      <FixedLabelTextInput
                        label="Pcs/Case"
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
                      <FixedLabelTextInput
                        label="Total Ltrs"
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
                      <FixedLabelTextInput
                        label="Total Pcs"
                        value={row.boxes}
                        textColor={COLORS.black}
                        onChangeText={(val) =>
                          handleRowTotalPcsChange(row.id, val)
                        }
                        editable={!!row.selectedProduct}
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
                      <FixedLabelTextInput
                        label="Boxes"
                        textColor={COLORS.black}
                        value={row.qty}
                        onChangeText={(val) =>
                          handleRowQtyChange(row.id, val)
                        }
                        mode="outlined"
                        keyboardType="numeric"
                        style={styles.input}
                        outlineColor={COLORS.border}
                        activeOutlineColor={COLORS.primary}
                      />
                    </View>
                    <View style={styles.thirdField}>
                      <FixedLabelTextInput
                        label="Tax %"
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

                  {/* {!!getRowLtrsBreakdown(row) && (
                  <Text style={styles.calcBreakdownText}>
                    {getRowLtrsBreakdown(row)}
                  </Text>
                )} */}

                  {/* Base Price + Basic Price */}
                  <View style={styles.row}>
                    <View style={styles.thirdField}>
                      <FixedLabelTextInput
                        label="Price List (Basic)"
                        textColor={COLORS.black}
                        value={row.priceListBasic}
                        editable={false}
                        mode="outlined"
                        keyboardType="numeric"
                        style={styles.input}
                        outlineColor={COLORS.border}
                        activeOutlineColor={COLORS.primary}
                      />
                    </View>
                    <View style={styles.thirdField}>
                      <FixedLabelTextInput
                        label="Basic Price"
                        textColor={COLORS.black}
                        value={row.basicPrice}
                        onChangeText={(val) =>
                          handleRowBasicPriceChange(row.id, val)
                        }
                        mode="outlined"
                        keyboardType="numeric"
                        style={styles.input}
                        outlineColor={COLORS.border}
                        activeOutlineColor={COLORS.primary}
                      />
                    </View>
                  </View>

                  {/* Item subtotal */}
                  {!!(row.itemTotal && parseFloat(row.itemTotal) > 0) && (
                    <View style={styles.itemSubtotalRow}>
                      <Text style={styles.itemSubtotalLabel}>Item Total:</Text>
                      <Text style={styles.itemSubtotalValue}>
                        ₹{row.itemTotal}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => addItemToOrder(row.id)}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={20}
                      color="#fff"
                    />
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
                <Ionicons
                  name="checkmark-done"
                  size={20}
                  color={COLORS.primary}
                />
                <Text style={styles.cardTitle}>
                  Order Items ({orderItems.length})
                </Text>
              </View>

              {orderItems.map((item, index) => (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemName}>
                      {index + 1}. {item.itemName}
                    </Text>
                    <View style={styles.confirmedItemActions}>
                      <TouchableOpacity
                        style={styles.confirmedItemActionBtn}
                        onPress={() => editOrderItem(item.id)}
                      >
                        <Ionicons
                          name="create-outline"
                          size={18}
                          color={COLORS.primary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.confirmedItemActionBtn}
                        onPress={() => removeOrderItem(item.id)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={COLORS.error}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.itemCategory}>
                    {item.category} | {item.brand} | {item.variety}
                  </Text>
                  {getConfirmedSchemes(item).map((scheme, index) => (
                    <Text key={`${scheme.scheme ?? scheme.schemeName}-${index}`} style={styles.itemCategory}>
                      Scheme {index + 1}: {scheme.schemeName || scheme.scheme} | Qty Scheme: {scheme.schemeQty || 0}
                    </Text>
                  ))}
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemDetail}>Boxes: {item.qty}</Text>
                    <Text style={styles.itemDetail}>Pcs/Case: {item.pcs}</Text>
                    <Text style={styles.itemDetail}>Total Pcs: {item.boxes}</Text>
                  </View>
                  <Text style={[styles.itemDetailBold, styles.itemLtrsDetail]}>
                    Total Ltrs: {getConfirmedItemLtrsDisplay(item)}
                  </Text>
                  {/* {!!getConfirmedItemLtrsBreakdown(item) && (
                  <Text style={styles.calcBreakdownText}>
                    {getConfirmedItemLtrsBreakdown(item)}
                  </Text>
                )} */}
                  <View style={styles.itemPriceRow}>
                    <Text style={styles.itemDetail}>Tax: {item.taxRate}%</Text>
                    <Text style={styles.itemAmount}>
                      ₹{item.total.toFixed(2)}
                    </Text>
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
            <FixedLabelTextInput
              label="Comment (Optional)"
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
        <Modal
          visible={successModal && !!orderResult}
          transparent
          animationType="fade"
          statusBarTranslucent
        >
          <View style={styles.modalOverlay}>
            <Animated.View style={styles.modalBox}>
              {/* Gradient Header */}
              <LinearGradient
                colors={orderResult?.needsApproval ? ["#F59E0B", "#D97706"] : ["#1E3A5F", "#2563EB"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalHeader}
              >
                {/* Decorative circles */}
                <View style={styles.modalDecorCircle1} />
                <View style={styles.modalDecorCircle2} />

                {/* Icon badge */}
                <View style={styles.modalIconBadge}>
                  <Ionicons
                    name={orderResult?.needsApproval ? "time" : "checkmark-circle"}
                    size={48}
                    color="#fff"
                  />
                </View>

                <Text style={styles.modalHeaderTitle}>
                  {orderResult?.needsApproval ? "Pending Approval" : "Order Placed!"}
                </Text>
                <Text style={styles.modalHeaderSub}>
                  {orderResult?.needsApproval
                    ? "Your order is awaiting rate approval"
                    : "Your order has been created successfully"}
                </Text>
              </LinearGradient>

              {/* Body */}
              <View style={styles.modalBody}>
                {!!orderResult?.orderNumber && (
                  <View style={styles.modalOrderNumBox}>
                    <Ionicons name="receipt-outline" size={14} color={COLORS.textSecondary} />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={styles.modalOrderNumLabel}>Order Number</Text>
                      <Text style={styles.modalOrderNum}>{orderResult.orderNumber}</Text>
                    </View>
                  </View>
                )}

                <Text style={styles.modalMessage}>{orderResult?.message}</Text>

                {/* Buttons */}
                <TouchableOpacity
                  style={styles.modalBtnPrimary}
                  onPress={() => {
                    setSuccessModal(false);
                    setOrderResult(null);
                    router.back();
                  }}
                >
                  <LinearGradient
                    colors={orderResult?.needsApproval ? ["#F59E0B", "#D97706"] : ["#1E3A5F", "#2563EB"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalBtnGradient}
                  >
                    <Ionicons name="arrow-back-outline" size={18} color="#fff" />
                    <Text style={styles.modalBtnPrimaryText}>Go to Orders</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalBtnSecondary}
                  onPress={() => {
                    setSuccessModal(false);
                    setOrderResult(null);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.modalBtnSecondaryText}>Create New Order</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* ── Bottom Actions ─────────────────────────────────────────────── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => handleClear()}>
            <Text style={styles.cancelBtnText}>Clear</Text>
          </TouchableOpacity>

          {(!isEditMode || loadedIsDraftOrder) && (
            <TouchableOpacity
              style={[
                styles.draftBtn,
                (savingDraft || loading) && styles.draftBtnDisabled,
              ]}
              onPress={handleSaveDraft}
              disabled={savingDraft || loading}
            >
              {savingDraft ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.draftBtnText}>Draft</Text>
                </>
              )}
            </TouchableOpacity>
          )}

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
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.textLight}
                  />
                  <Text style={styles.submitBtnText}>
                    {isFocOrder ? "Create FOC" : "Create Order"}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </StateWrapper>
  );

}

export default function CreateOrderScreen() {
  return <OrderEntryScreen screenVariant="order" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: { marginTop: SPACING.md, color: COLORS.textSecondary },
  scrollView: { flex: 1, padding: SPACING.md },

  // ── Web date input ──
  webDateWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: SPACING.md,
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
  dateInputBox: {
    height: 56,
    backgroundColor: COLORS.inputBackground,
    color: COLORS.black,
  },
  dateInputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  templateContainer: {
    zIndex: 1000,
  },
  templateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    gap: 6,
  },
  templateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  templateDropdownContainer: {
    position: 'absolute',
    top: 45, // positions it directly below the button
    right: 0,
    width: 280,
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
    zIndex: 1000,
  },
  templateOverlay: {
    position: 'absolute',
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    backgroundColor: 'transparent',
    zIndex: 999,
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
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  dateText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "500" },
  field: { marginBottom: SPACING.sm },
  row: { flexDirection: "row", gap: SPACING.sm },
  halfField: { flex: 1 },
  thirdField: { flex: 1 },
  schemeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  schemeBox: {
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  schemeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  schemeHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  schemeTitleText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  schemeToggleCompact: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  schemeSwitch: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E5E7EB",
    padding: 2,
    justifyContent: "center",
  },
  schemeSwitchOn: {
    backgroundColor: "#2563EB",
  },
  schemeSwitchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 3,
  },
  schemeSwitchThumbOn: {
    alignSelf: "flex-end",
  },
  schemeDropdownField: { flex: 2 },
  schemeQtyField: { flex: 1 },
  schemeRemoveBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  addSchemeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.surface,
  },
  addSchemeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  schemeToggleLabel: { fontSize: 11, color: COLORS.text, fontWeight: "500" },
  input: { backgroundColor: COLORS.surface, color: COLORS.black },
  fixedInputWrap: {
    position: "relative",
    paddingTop: 8,
  },
  fixedInputLabel: {
    position: "absolute",
    top: 0,
    left: 12,
    zIndex: 1,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 4,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  fixedInput: {
    backgroundColor: COLORS.surface,
    color: COLORS.black,
    height: 50,
  },
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
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  emptySubtext: { fontSize: 13, color: COLORS.border, marginTop: SPACING.xs },
  itemCard: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
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
  calcBreakdownText: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: SPACING.xs,
    lineHeight: 18,
  },

  // ── Confirmed items ──
  itemName: { fontWeight: "600", fontSize: 14, color: COLORS.text, flex: 1 },
  confirmedItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  confirmedItemActionBtn: {
    padding: SPACING.xs,
  },
  itemCategory: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  itemDetail: { fontSize: 12, color: COLORS.textSecondary },
  itemDetailBold: {
    fontSize: 12,
    color: COLORS.black,
    fontWeight: "800",
  },
  itemLtrsDetail: {
    marginTop: 6,
  },
  itemPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  itemAmount: { fontWeight: "700", fontSize: 14, color: COLORS.text },

  // ── Totals box ──
  totalsBox: {
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
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
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: "#F8FBFF",
    borderRadius: 22,
    width: "100%",
    maxWidth: 420,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 34,
    elevation: 18,
  },
  modalHeader: {
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  modalDecorCircle1: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.07)",
    top: -50,
    right: -40,
  },
  modalDecorCircle2: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: -30,
    left: -20,
  },
  modalIconBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  modalHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  modalHeaderSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 18,
  },
  modalBody: {
    padding: 22,
    alignItems: "center",
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalOrderNumBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
  },
  modalOrderNumLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalOrderNum: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 1,
  },
  modalMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 21,
  },
  modalBtnPrimary: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
  },
  modalBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  modalBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.primaryLighter,
    gap: 6,
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingPopupCard: {
    minWidth: 172,
    backgroundColor: "#F8FBFF",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
  },
  loadingPopupText: {
    marginTop: SPACING.sm,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textSecondary,
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
  draftBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
    gap: SPACING.xs,
  },
  draftBtnDisabled: { opacity: 0.6 },
  draftBtnText: { color: COLORS.primary, fontWeight: "600" },
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

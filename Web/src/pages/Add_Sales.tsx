import { Fragment, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ordersService } from "../services/ordersService";
import { userService } from "../services/userService";
import { getCurrentUser } from "../services/authService";
import type {
  Order,
  OrderItem,
  Product,
  PartyProduct,
  RowType,
  SchemeProduct,
} from "../services/ordersService";
import "../styles/Add_Sales.css";

type SalesRow = RowType & {
  confirmed: boolean;
  // schemeLtrs?: string;
  schemeItemCode?: string;
};

const createEmptyRow = (): SalesRow => ({
  category: "",
  brand: "",
  variety: "",
  type: "",
  item: "",
  isScheme: false,
  scheme: "",
  schemeQty: "",
  // schemeLtrs: "",
  pcs: "",
  qty: "",
  ltrs: "",
  boxes: "",
  basicPrice: "",
  marketPrice: "",
  tax: "",
  amount: "",
  confirmed: false,
});

// const getUniqueSchemes = (schemes: SchemeProduct[]) => {
//   const seen = new Set<string>();

//   return schemes.filter((scheme) => {
//     const normalizedName = (scheme.scheme_name || "").trim().toLowerCase();

//     if (!normalizedName || seen.has(normalizedName)) {
//       return false;
//     }

//     seen.add(normalizedName);
//     return true;
//   });
// };

type EditOrderLocationState = {
  editOrderId?: number;
  returnTo?: string;
  mode?: "edit" | "duplicate";
  allowPoNumber?: boolean;
};

type EditOrderFallback = {
  cardName: string;
  partyLabel: string;
  billAddress: string;
  shipAddress: string;
};

type OrderSaveSuccess = {
  orderId: string;
  nextStage: string;
  message: string;
};

const emptyEditOrderFallback: EditOrderFallback = {
  cardName: "",
  partyLabel: "",
  billAddress: "",
  shipAddress: "",
};

export default function Add_Sales() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState =
    (location.state as EditOrderLocationState | null) ?? null;
  const editOrderId =
    typeof locationState?.editOrderId === "number"
      ? locationState.editOrderId
      : null;
  const mode = locationState?.mode ?? (editOrderId ? "edit" : "create");
  const returnTo = locationState?.returnTo || "/Order_Tracking";
  const isEditMode = mode === "edit" && editOrderId !== null;
  const isDuplicateMode = mode === "duplicate" && editOrderId !== null;
  const isLoadingFromOrder = isEditMode || isDuplicateMode;
  const [userRole, setUserRole] = useState("");
  const [parties, setParties] = useState<any[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [billSearch, setBillSearch] = useState("");
  const [billDropdownOpen, setBillDropdownOpen] = useState(false);
  const [shipSearch, setShipSearch] = useState("");
  const [shipDropdownOpen, setShipDropdownOpen] = useState(false);
  const [branch, setBranch] = useState<any[]>([]);
  const [billAddress, setBillAddress] = useState<any[]>([]);
  const [shipAddress, setShipAddress] = useState<any[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<any[]>([]);
  const [partyProducts, setPartyProducts] = useState<PartyProduct[]>([]);
  const [schemeOptions, setSchemeOptions] = useState<
    Record<number, SchemeProduct[]>
  >({});
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [editOrderFallback, setEditOrderFallback] = useState<EditOrderFallback>(
    emptyEditOrderFallback,
  );
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<OrderSaveSuccess | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingEditOrder, setIsLoadingEditOrder] = useState(false);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const billDropdownRef = useRef<HTMLDivElement>(null);
  const shipDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    parties: "",
    dispatch: "",
    date: new Date().toISOString().split("T")[0],
    billAddress: "",
    shipAddress: "",
    Deliverydate: "",
    company: "",
  });

  const [rows, setRows] = useState<SalesRow[]>([createEmptyRow()]);
  const isBillingUser = userRole.toLowerCase() === "billing";
  const canEditPoNumber =
    isEditMode && isBillingUser && locationState?.allowPoNumber === true;

  // Use Effects
  useEffect(() => {
    fetchPartyName();
    fetchBranch();
    fetchProducts();
    fetchCompany();
    fetchCurrentUserProfile();
  }, []);

  const fetchCurrentUserProfile = async () => {
    try {
      const user = await getCurrentUser();
      const role = user?.role_name || user?.role || user?.role_display || "";
      setUserRole(typeof role === "object" ? role.name || "" : String(role));
    } catch (error) {
      console.log("Error fetching current user:", error);
      setUserRole("");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        partyDropdownRef.current &&
        !partyDropdownRef.current.contains(event.target as Node)
      ) {
        setPartyDropdownOpen(false);
      }
      if (
        billDropdownRef.current &&
        !billDropdownRef.current.contains(event.target as Node)
      ) {
        setBillDropdownOpen(false);
      }
      if (
        shipDropdownRef.current &&
        !shipDropdownRef.current.contains(event.target as Node)
      ) {
        setShipDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch Functions

  const fetchCompany = async () => {
    try {
      let data = await userService.getCompany();
      setCompany(data);
    } catch (error) {
      console.log("Error fetching Company:", error);
    }
  };

  const fetchPartyName = async () => {
    try {
      let data = await ordersService.getPartyName();
      let filtered = data.filter(
        (d: any) => d.category.toLowerCase() === "oil",
      );
      setParties(filtered);
    } catch (error) {
      console.log("Error fetching parties name:", error);
    }
  };

  const fetchBranch = async () => {
    try {
      let data = await ordersService.getBranches();
      setBranch(data);
    } catch (error) {
      console.log("Error fetching dispatch data:", error);
    }
  };

  const fetchPartyAddresses = async (card_code: string) => {
    try {
      let data = await ordersService.getPartyAdd(card_code);
      setBillAddress(data.bill_to);
      setShipAddress(data.ship_to);
      return data;
    } catch (error) {
      console.log("Error fetching addresses:", error);
      return null;
    }
  };

  const fetchPartyCategories = async (card_code: string) => {
    try {
      let partyProductsData = await ordersService.getPartyProduct(card_code);
      setPartyProducts(partyProductsData);

      console.log("Fetched party products:", partyProductsData);
      const categories = [
        ...new Set(partyProductsData.map((p: PartyProduct) => p.category)),
      ] as string[];
      setCategory(categories);

      return partyProductsData;
    } catch (error) {
      console.log("Error fetching categories:", error);
      return [];
    }
  };

  const fetchProducts = async () => {
    let data = await ordersService.getProducts();
    setProducts(data);
  };

  const getProductType = (itemName: string) => {
    const match = itemName.match(/(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
  };

  const valueToString = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" ? "" : String(value);

  const mergeOrderItemsIntoPartyProducts = (
    sourceProducts: PartyProduct[],
    order: Order,
  ) => {
    const productMap = new Map<string, PartyProduct>();

    sourceProducts.forEach((product) => {
      const key = `${product.item_code || product.item_name}|${product.category || ""}`;
      productMap.set(key, product);
    });

    order.items?.forEach((item) => {
      const key = `${item.item_code || item.item_name}|${item.category || ""}`;
      if (productMap.has(key)) return;

      productMap.set(key, {
        item_code: item.item_code || "",
        item_name: item.item_name || "",
        category: item.category || "",
        brand: item.brand || "",
        variety: item.variety || "",
        sal_factor2: item.pcs || "",
        sal_pack_unit:
          Number(item.qty) > 0
            ? String(Number(item.ltrs || 0) / Number(item.qty))
            : "",
        tax_rate: item.tax_rate || "",
        basic_rate: item.basic_price || "",
      });
    });

    return Array.from(productMap.values());
  };

  const mapOrderToRows = (order: Order): SalesRow[] => {
    const orderItems = Array.isArray(order.items) ? order.items : [];

    return orderItems.length > 0
      ? orderItems.map((item) => {
          const itemWithExtras = item as OrderItem & {
            scheme?: number | string | null;
            is_scheme_visible?: boolean;
          };
          const schemeId = item.scheme_id ?? itemWithExtras.scheme;
          const isSchemeVisible = Boolean(
            schemeId ||
            item.scheme_name ||
            item.scheme_qty ||
            itemWithExtras.is_scheme_visible,
          );

          return {
            category: item.category || "",
            brand: item.brand || "",
            variety: item.variety || "",
            type: item.item_type || getProductType(item.item_name || ""),
            item: item.item_name || "",
            isScheme: isSchemeVisible,
            scheme: schemeId ? String(schemeId) : "",
            schemeQty: isSchemeVisible ? valueToString(item.scheme_qty) : "",
            // schemeLtrs: isSchemeVisible && schemeLtrs > 0 ? String(schemeLtrs) : "",
            pcs: valueToString(item.pcs),
            qty: valueToString(item.qty),
            ltrs: valueToString(item.ltrs),
            boxes: valueToString(item.boxes),
            basicPrice: valueToString(item.basic_price),
            marketPrice: valueToString(item.market_price),
            tax: valueToString(item.tax_rate),
            amount: valueToString(item.total),
            confirmed: true,
          };
        })
      : [createEmptyRow()];
  };

  useEffect(() => {
    if (!isLoadingFromOrder || !editOrderId) {
      return;
    }

    let isCancelled = false;

    const loadEditOrder = async () => {
      setIsLoadingEditOrder(true);

      try {
        const order = await ordersService.getOrderDetails(editOrderId);
        if (isCancelled) return;

        setEditOrderFallback({
          cardName: order.card_name || "",
          partyLabel: order.card_name
            ? `${order.card_name} (${order.card_code})`
            : order.card_code || "",
          billAddress: order.bill_to_address || "",
          shipAddress: order.ship_to_address || "",
        });

        setParties((prev) =>
          prev.some((party) => party.value === order.card_code)
            ? prev
            : [
                {
                  value: order.card_code,
                  label: order.card_name
                    ? `${order.card_name} (${order.card_code})`
                    : order.card_code,
                  category: "oil",
                  state: "",
                },
                ...prev,
              ],
        );

        const [, fetchedPartyProducts] = await Promise.all([
          fetchPartyAddresses(order.card_code),
          fetchPartyCategories(order.card_code),
        ]);
        if (isCancelled) return;

        const mergedPartyProducts = mergeOrderItemsIntoPartyProducts(
          fetchedPartyProducts,
          order,
        );
        setPartyProducts(mergedPartyProducts);
        setCategory([
          ...new Set(
            mergedPartyProducts
              .map((product) => product.category)
              .filter((itemCategory): itemCategory is string =>
                Boolean(itemCategory),
              ),
          ),
        ]);

        setFormData({
          parties: order.card_code || "",
          dispatch: order.dispatch_from_id
            ? String(order.dispatch_from_id)
            : "",
          date: order.created_at
            ? String(order.created_at).split("T")[0]
            : new Date().toISOString().split("T")[0],
          billAddress: order.bill_to_id ? String(order.bill_to_id) : "",
          shipAddress: order.ship_to_id ? String(order.ship_to_id) : "",
          Deliverydate: isDuplicateMode ? "" : order.delivery_date || "",
          company: order.company ? String(order.company) : "",
        });

        const mappedRows = mapOrderToRows(order);
        setRows(mappedRows);

        const hasSchemeRows = mappedRows.some((row) => row.isScheme);
        if (hasSchemeRows) {
          const schemes = await ordersService.getSchemeProducts("");
          console.log("Fetched schemes for edit order:", schemes);
          if (isCancelled) return;

          // const uniqueSchemes = getUniqueSchemes(schemes);
          const nextSchemeOptions: Record<number, SchemeProduct[]> = {};
          mappedRows.forEach((row, index) => {
            if (row.isScheme) {
              nextSchemeOptions[index] = schemes;
              console.log(`Assigned schemes to row ${index}:`, schemes);
            }
          });
          setSchemeOptions(nextSchemeOptions);
        } else {
          setSchemeOptions({});
        }
      } catch (error) {
        console.log("Error loading order for edit:", error);
        alert("Unable to load this order for editing.");
        navigate(returnTo);
      } finally {
        if (!isCancelled) {
          setIsLoadingEditOrder(false);
        }
      }
    };

    void loadEditOrder();

    return () => {
      isCancelled = true;
    };
  }, [editOrderId, isLoadingFromOrder, isDuplicateMode, navigate, returnTo]);

  const fetchSchemesForRow = async (index: number, shouldFetch: boolean) => {
    if (!shouldFetch || !stateCode) {
      setSchemeOptions((prev) => ({ ...prev, [index]: [] }));
      return;
    }

    try {
      const schemes = await ordersService.getSchemeProducts(stateCode);
      console.log("Fetched schemes for row:", schemes);

      setSchemeOptions((prev) => ({
        ...prev,
        [index]: schemes,
      }));
    } catch (error) {
      console.log("Error fetching schemes:", error);
      setSchemeOptions((prev) => ({ ...prev, [index]: [] }));
    }
  };

  // -------------------------------
  // ----------Handle fxns----------
  // --------------------------------

  const validateBeforeSave = () => {
    const confirmedRows = rows.filter((row) => row.confirmed);

    if (confirmedRows.length === 0) {
      alert("Please confirm at least one item before submitting the order.");
      return false;
    }

    if (rows.some((row) => !row.confirmed && row.item)) {
      alert("Please confirm the current item before submitting the order.");
      return false;
    }

    return true;
  };

  const getNextStageLabel = (data: any) => {
    const status = String(data?.status || "").trim();
    const message = String(data?.message || "").trim();
    const source = `${status} ${message}`.toLowerCase();

    if (source.includes("rate")) return "Rate Approval";
    if (source.includes("auditor")) return "Auditor Approval";
    if (source.includes("billing")) return "Billing";

    return status || message || "Next approval stage";
  };

  const resetOrderForm = () => {
    setFormData({
      parties: "",
      dispatch: "",
      date: new Date().toISOString().split("T")[0],
      billAddress: "",
      shipAddress: "",
      Deliverydate: "",
      poNumber: "",
      company: "",
    });

    setRows([createEmptyRow()]);
    setSchemeOptions({});
  };

  const submitOrder = async () => {
    const confirmedRows = rows.filter((row) => row.confirmed);

    const selectedParty = parties.find((p) => p.value === formData.parties);

    const payload = {
      ...(isEditMode ? { order_id: editOrderId } : {}),
      card_code: formData.parties,
      card_name: selectedParty?.label || editOrderFallback.cardName || "",
      bill_to_id: Number(formData.billAddress),
      bill_to_address:
        billAddress.find((b) => b.id === Number(formData.billAddress))
          ?.address_name || "",
      ship_to_id: Number(formData.shipAddress),
      ship_to_address:
        shipAddress.find((s) => s.id === Number(formData.shipAddress))
          ?.address_name || "",
      dispatch_from_id: Number(formData.dispatch),
      dispatch_from_name:
        branch.find((d) => d.bpl_id === Number(formData.dispatch))?.bpl_name ||
        "",

      delivery_date: formData.Deliverydate,
      ...(canEditPoNumber ? { po_number: formData.poNumber.trim() } : {}),
      company: Number(formData.company),

      total_amount: totalAmount,
      tax_amount: taxAmount,
      grand_total: grandTotal,

      items: confirmedRows.map((row) => ({
        item_code:
          partyProducts.find(
            (p) =>
              p.item_name === row.item &&
              p.category === row.category &&
              (p.brand || "") === (row.brand || "") &&
              (p.variety || "") === (row.variety || ""),
          )?.item_code || "",

        item_name: row.item,
        category: row.category,
        brand: row.brand,
        variety: row.variety,
        item_type: row.type,

        qty: Number(row.qty),
        pcs: Number(row.pcs),
        boxes: Number(row.boxes),
        ltrs: Number(row.ltrs),

        basic_price: Number(row.basicPrice),
        market_price: Number(row.marketPrice),
        tax_rate: Number(row.tax),
        total: Number(row.amount || 0),
        scheme_id: row.isScheme && row.scheme ? Number(row.scheme) : undefined,
        scheme_qty: row.isScheme ? Number(row.schemeQty || 0) : 0,
        // scheme_ltrs: row.isScheme ? Number(row.schemeLtrs || 0) : 0,
        is_scheme: row.isScheme,
        total_ltrs: Number(row.ltrs) + Number(row.schemeQty || 0),
      })),
    };

    try {
      setIsSaving(true);
      console.log("Submitting Payload:", payload);
      const data = await ordersService.createOrder(payload);

      console.log("API Response:", data);
      setShowSaveConfirm(false);
      setSaveSuccess({
        orderId: String(data?.order_number || data?.id || editOrderId || "-"),
        nextStage: getNextStageLabel(data),
        message: isEditMode ? "Order updated successfully" : "Order created successfully",
      });

      if (!isLoadingFromOrder) {
        resetOrderForm();
      }
    } catch (error) {
      console.error(error);

      console.error("Payload:", JSON.stringify(payload, null, 2));

      alert(
        isEditMode
          ? "Error updating order ❌"
          : "Error creating new order ❌",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSave()) {
      return;
    }

    setShowSaveConfirm(true);
  };

  const handleSuccessClose = () => {
    setSaveSuccess(null);
    if (isLoadingFromOrder) {
      navigate(returnTo);
    }
  };

  const handleClearForm = () => {
    if (isLoadingFromOrder) {
      navigate(returnTo);
      return;
    }

    resetOrderForm();
    setShowSaveConfirm(false);
  };

  const handleAddRow = () => {
    if (rows.some((row) => !row.confirmed)) {
      return;
    }
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const handleRowSchemeToggle = (index: number, isScheme: boolean) => {
    setRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex === index) {
          return {
            ...row,
            confirmed: false,
            isScheme: isScheme,
            scheme: isScheme ? row.scheme : "",
            schemeQty: "",
            // schemeLtrs: "",
          };
        }
        return row;
      }),
    );
  };

  const handleRowChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    let updatedRows = [...rows];
    let row = { ...updatedRows[index] };
    row.confirmed = false;

    // assign value (RowType is all strings)
    (row as any)[name] = value;

    //  ITEM SELECT
    if (name === "item") {
      row.qty = "";
      row.ltrs = "";
      row.boxes = "";
      row.marketPrice = "";
      row.amount = "";
      row.isScheme = false;
      row.scheme = "";
      row.schemeQty = "";
      // row.schemeLtrs = "";

      const partyProduct =
        partyProducts.find(
          (p) =>
            p.item_name === value &&
            p.category === row.category &&
            (p.brand || "") === (row.brand || "") &&
            (p.variety || "") === (row.variety || ""),
        ) ||
        partyProducts.find(
          (p) => p.item_name === value && p.category === row.category,
        ) ||
        partyProducts.find((p) => p.item_name === value);

      if (partyProduct) {
        const match = partyProduct.item_name.match(
          /(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i,
        );
        row.type = match ? `${match[1]} ${match[2].toUpperCase()}` : "Others";
        row.pcs = String(partyProduct.sal_factor2 ?? "");
        row.tax = String(partyProduct.tax_rate ?? "");
        row.basicPrice = String(partyProduct.basic_rate ?? "");
        void fetchSchemesForRow(index, true);
      } else {
        void fetchSchemesForRow(index, false);
      }
    }

    if (
      name === "category" ||
      name === "brand" ||
      name === "variety" ||
      name === "type"
    ) {
      row.item = "";
      row.isScheme = false;
      row.scheme = "";
      row.schemeQty = "";
      // row.schemeLtrs = "";
      row.pcs = "";
      row.qty = "";
      row.ltrs = "";
      row.boxes = "";
      row.basicPrice = "";
      row.marketPrice = "";
      row.tax = "";
      row.amount = "";
      setSchemeOptions((prev) => ({ ...prev, [index]: [] }));
    }

    //  CALCULATIONS
    //  (boxes → qty)
    if (name === "boxes" || name === "marketPrice") {
      const boxes = Number(row.boxes) || 0;

      const product =
        partyProducts.find((p) => p.item_name === row.item) ||
        products.find((p) => p.item_name === row.item);

      if (product) {
        const factor = Number(product.sal_factor2) || 1;

        // ✅ qty from boxes
        const qty = boxes * factor;
        row.qty = String(qty);

        // ✅ liters
        row.ltrs = String(Number(product.sal_pack_unit) * qty);

        // ✅ amount
        const basic = Number(row.basicPrice) || 0;
        const market = Number(row.marketPrice) || 0;
        const price = market > 0 ? market : basic;

        row.amount = (price * qty).toFixed(2);
      }
    }
    if (name === "boxes" || name === "marketPrice" || name === "scheme") {
      const boxes = Number(row.boxes) || 0;

      const product =
        partyProducts.find((p) => p.item_name === row.item) ||
        products.find((p) => p.item_name === row.item);

      if (product) {
        const factor = Number(product.sal_factor2) || 1;

        const qty = boxes * factor;
        row.qty = String(qty);

        row.ltrs = String(Number(product.sal_pack_unit) * qty);

        const basic = Number(row.basicPrice) || 0;
        const market = Number(row.marketPrice) || 0;
        const price = market > 0 ? market : basic;

        row.amount = (price * qty).toFixed(2);
      }

      //if (row.isScheme && row.scheme) {
      // const schemes = schemeOptions[index] || [];
      // const schemeObj = schemes.find(
      //   (s) => String(s.scheme_id) === String(row.scheme)
      // );

      // if (schemeObj) {
      //   const match = schemeObj.scheme_name.match(/(\d+\.?\d*)/);
      //   const multiplier = match ? parseFloat(match[1]) : 1;
      //   const schemeName = (schemeObj.scheme_name || "").toLowerCase();

      //   const calculatedQty = schemeName.includes("box")
      //     ? boxes * multiplier
      //     : (Number(row.qty) || 0) * multiplier;

      //   row.schemeQty = String(calculatedQty);

      //   // const sPackUnit = Number((schemeObj as any).sal_pack_unit || product?.sal_pack_unit || 0);
      //   // row.schemeLtrs = (sPackUnit * calculatedQty).toFixed(2);
      // } else {
      //   row.schemeQty = "";
      //   // row.schemeLtrs = "";
      // }
      // }
    }
    updatedRows[index] = row;
    setRows(updatedRows);
  };

  const handleDeleteRow = (index: number) => {
    const updatedRows = rows.filter((_, i) => i !== index);
    setRows(updatedRows.length > 0 ? updatedRows : [createEmptyRow()]);
    setSchemeOptions((prev) => {
      const next: Record<number, SchemeProduct[]> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key);
        if (currentIndex < index) next[currentIndex] = value;
        if (currentIndex > index) next[currentIndex - 1] = value;
      });
      return next;
    });
  };

  const handlePartySelect = (value: string) => {
    setEditOrderFallback(emptyEditOrderFallback);
    setFormData((prev) => ({
      ...prev,
      parties: value,
      billAddress: "",
      shipAddress: "",
    }));
    setPartySearch("");
    setPartyDropdownOpen(false);
    setBillSearch("");
    setBillDropdownOpen(false);
    setShipSearch("");
    setShipDropdownOpen(false);
    setBillAddress([]);
    setShipAddress([]);
    setCategory([]);
    setPartyProducts([]);
    setRows([createEmptyRow()]);
    setSchemeOptions({});
    fetchPartyAddresses(value);
    fetchPartyCategories(value);

    const selectedParty = parties.find((p) => p.value === value);
    console.log("Selected party on select:", selectedParty);
    if (selectedParty && selectedParty.state) {
      setStateCode(selectedParty.state);
    } else {
      setStateCode(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<any>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (name === "parties") {
      handlePartySelect(value);
    }
  };

  const handleBillAddressSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      billAddress: value,
    }));
    setBillSearch("");
    setBillDropdownOpen(false);
  };

  const handleShipAddressSelect = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      shipAddress: value,
    }));
    setShipSearch("");
    setShipDropdownOpen(false);
  };

  const isRowValid = (row: SalesRow) =>
    row.category &&
    row.brand &&
    row.variety &&
    row.type &&
    row.item &&
    Number(row.qty) > 0 &&
    Number(row.amount) > 0;

  const handleConfirmRow = (index: number) => {
    const row = rows[index];

    if (!isRowValid(row)) {
      alert("Please complete this item before confirming it.");
      return;
    }

    setRows((prev) =>
      prev.map((item, rowIndex) =>
        rowIndex === index ? { ...item, confirmed: true } : item,
      ),
    );
  };

  const confirmedRows = rows.filter((row) => row.confirmed);
  const canAddMoreItems = rows.length > 0 && rows.every((row) => row.confirmed);

  const totalAmount = confirmedRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const taxAmount = confirmedRows.reduce((sum, row) => {
    const amount = Number(row.amount);
    const taxRate = Number(row.tax);
    return sum + (isNaN(amount) ? 0 : (amount * taxRate) / 100);
  }, 0);

  const grandTotal = totalAmount + taxAmount;

  const filteredParties = parties.filter((party) => {
    const search = partySearch.trim().toLowerCase();
    if (!search) return true;
    return (
      String(party.label || "")
        .toLowerCase()
        .includes(search) ||
      String(party.value || "")
        .toLowerCase()
        .includes(search)
    );
  });
  const filteredBillAddresses = billAddress.filter((address) => {
    const search = billSearch.trim().toLowerCase();
    const label = String(
      address.address_name || address.full_address || address.address_id || "",
    );
    if (!search) return true;
    return label.toLowerCase().includes(search);
  });
  const filteredShipAddresses = shipAddress.filter((address) => {
    const search = shipSearch.trim().toLowerCase();
    const label = String(
      address.address_name || address.full_address || address.address_id || "",
    );
    if (!search) return true;
    return label.toLowerCase().includes(search);
  });
  const selectedPartyLabel =
    parties.find((party) => party.value === formData.parties)?.label ||
    editOrderFallback.partyLabel ||
    "";
  const selectedBillAddress = billAddress.find(
    (address) => String(address.id) === formData.billAddress,
  );
  const selectedShipAddress = shipAddress.find(
    (address) => String(address.id) === formData.shipAddress,
  );
  const selectedBillAddressLabel =
    selectedBillAddress?.address_name ||
    selectedBillAddress?.full_address ||
    selectedBillAddress?.address_id ||
    (formData.billAddress ? editOrderFallback.billAddress : "") ||
    "";
  const selectedShipAddressLabel =
    selectedShipAddress?.address_name ||
    selectedShipAddress?.full_address ||
    selectedShipAddress?.address_id ||
    (formData.shipAddress ? editOrderFallback.shipAddress : "") ||
    "";
  return (
    <div className="sl-page app-page">
      <div className="sl-header app-page-head">
        <div>
          <h1 className="sl-title app-page-title">
            {isEditMode
              ? "Edit Sales Order"
              : isDuplicateMode
                ? "Duplicate Sales Order"
                : "Add Sales Order"}
          </h1>
        </div>
      </div>

      {isEditMode && isLoadingEditOrder && (
        <div className="sl-section-label">
          Loading existing order details...
        </div>
      )}

      <form className="sl-form" onSubmit={handleSubmit}>
        {/* Party Name */}
        <div className="sl-section-label">Order Details</div>
        <div className="sl-grid sl-order-grid">
          <div className="sl-field">
            <label className="sl-label">Party Name</label>
            <div
              className={`sl-party-dropdown${partyDropdownOpen ? " open" : ""}`}
              ref={partyDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                onClick={() => setPartyDropdownOpen((prev) => !prev)}
              >
                <span>{selectedPartyLabel || "--select--"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="#64748b"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {partyDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-search-wrap">
                    <input
                      type="text"
                      className="sl-party-search"
                      placeholder="Search party..."
                      value={partySearch}
                      onChange={(e) => setPartySearch(e.target.value)}
                    />
                  </div>
                  <div className="sl-party-options">
                    {filteredParties.length > 0 ? (
                      filteredParties.map((party) => (
                        <button
                          type="button"
                          key={party.value}
                          className="sl-party-option"
                          onClick={() => handlePartySelect(party.value)}
                        >
                          <span className="sl-party-option-label">
                            {party.label}
                          </span>
                          <span className="sl-party-option-code">
                            {party.value}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="sl-party-empty">No parties found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dispatch */}
          <div className="sl-field">
            <label className="sl-label">Dispatch From</label>
            <div className="sl-input-wrap">
              <select
                value={formData.dispatch}
                name="dispatch"
                onChange={handleChange}
                required
              >
                <option value="">--select--</option>
                {branch.length > 0
                  ? branch.map((d) => (
                      <option key={d.bpl_id} value={d.bpl_id}>
                        {d.bpl_name}
                      </option>
                    ))
                  : null}
              </select>
              <div className="sl-focus-line" />
            </div>
          </div>

          {/* Date */}
          <div className="sl-field">
            <label className="sl-label">Date</label>
            <div className="sl-input-wrap">
              <input type="date" name="date" value={formData.date} readOnly />
              <div className="sl-focus-line" />
            </div>
          </div>

          {/* Bill To */}
          <div className="sl-field">
            <label className="sl-label">Bill To Address</label>
            <div
              className={`sl-party-dropdown${billDropdownOpen ? " open" : ""}`}
              ref={billDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                onClick={() => setBillDropdownOpen((prev) => !prev)}
                disabled={billAddress.length === 0}
              >
                <span>{selectedBillAddressLabel || "--select--"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="#64748b"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {billDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-search-wrap">
                    <input
                      type="text"
                      className="sl-party-search"
                      placeholder="Search bill to..."
                      value={billSearch}
                      onChange={(e) => setBillSearch(e.target.value)}
                    />
                  </div>
                  <div className="sl-party-options">
                    {filteredBillAddresses.length > 0 ? (
                      filteredBillAddresses.map((b) => (
                        <button
                          type="button"
                          key={b.id}
                          className="sl-party-option"
                          onClick={() => handleBillAddressSelect(String(b.id))}
                        >
                          <span className="sl-party-option-label">
                            {b.address_name || b.full_address || b.address_id}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="sl-party-empty">No addresses found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <input
              type="hidden"
              name="billAddress"
              value={formData.billAddress}
              required
            />
          </div>

          {/* Ship To */}
          <div className="sl-field">
            <label className="sl-label">Ship To Address</label>
            <div
              className={`sl-party-dropdown${shipDropdownOpen ? " open" : ""}`}
              ref={shipDropdownRef}
            >
              <button
                type="button"
                className="sl-party-trigger"
                onClick={() => setShipDropdownOpen((prev) => !prev)}
                disabled={shipAddress.length === 0}
              >
                <span>{selectedShipAddressLabel || "--select--"}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 4.5L6 7.5L9 4.5"
                    stroke="#64748b"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {shipDropdownOpen && (
                <div className="sl-party-menu">
                  <div className="sl-party-search-wrap">
                    <input
                      type="text"
                      className="sl-party-search"
                      placeholder="Search ship to..."
                      value={shipSearch}
                      onChange={(e) => setShipSearch(e.target.value)}
                    />
                  </div>
                  <div className="sl-party-options">
                    {filteredShipAddresses.length > 0 ? (
                      filteredShipAddresses.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          className="sl-party-option"
                          onClick={() => handleShipAddressSelect(String(s.id))}
                        >
                          <span className="sl-party-option-label">
                            {s.address_name || s.full_address || s.address_id}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="sl-party-empty">No addresses found</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <input
              type="hidden"
              name="shipAddress"
              value={formData.shipAddress}
              required
            />
          </div>

          {/* Delivery Date */}
          <div className="sl-field">
            <label className="sl-label" htmlFor="Deliverydate">
              Delivery Date
            </label>
            <div className="sl-input-wrap">
              <input
                type="date"
                name="Deliverydate"
                value={formData.Deliverydate}
                onChange={handleChange}
                required
              />
              <div className="sl-focus-line" />
            </div>
          </div>
        </div>

        <div className="sl-table-wrap">
          <table className="sl-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Brand</th>
                <th>Variety</th>
                <th>Type</th>
                <th>Item</th>
                <th>Pcs</th>
                <th>Boxes</th>
                <th>Qty</th>
                <th>Ltrs</th>
                <th>Basic Price</th>
                <th>Market Price</th>
                <th>Tax %</th>
                <th>Amount</th>
                <th>X</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <Fragment key={index}>
                  <tr key={`main-${index}`}>
                    <td>
                      <select
                        value={row.category}
                        name="category"
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      >
                        <option value="">--select--</option>
                        {category.map((c, i) => (
                          <option key={i} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        value={row.brand}
                        name="brand"
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      >
                        <option value="">--select--</option>
                        {[
                          ...new Set(
                            partyProducts
                              .filter((p) => p.category === row.category)
                              .map((p) => p.brand),
                          ),
                        ].map((b, i) => (
                          <option key={i} value={b ?? ""}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        value={row.variety}
                        name="variety"
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      >
                        <option value="">--select--</option>
                        {[
                          ...new Set(
                            partyProducts
                              .filter(
                                (p) =>
                                  p.category === row.category &&
                                  (p.brand || "") === (row.brand || ""),
                              )
                              .map((p) => p.variety),
                          ),
                        ].map((v, i) => (
                          <option key={i} value={v ?? ""}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        value={row.type}
                        name="type"
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      >
                        <option value="">--select--</option>
                        {[
                          ...new Set(
                            partyProducts
                              .filter(
                                (p) =>
                                  p.category === row.category &&
                                  (p.brand || "") === (row.brand || "") &&
                                  (p.variety || "") === (row.variety || ""),
                              )
                              .map((p) => {
                                const match = p.item_name.match(
                                  /(\d+\.?\d*)\s*(LTR|ML|KG|GM|GMS|L)/i,
                                );
                                return match
                                  ? `${match[1]} ${match[2].toUpperCase()}`
                                  : "Others";
                              }),
                          ),
                        ]
                          .sort((a, b) => {
                            if (a === "Others") return 1;
                            if (b === "Others") return -1;
                            return parseFloat(a) - parseFloat(b);
                          })
                          .map((t, i) => (
                            <option key={i} value={t}>
                              {t}
                            </option>
                          ))}
                      </select>
                    </td>

                    <td>
                      <select
                        value={row.item}
                        name="item"
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      >
                        <option value="">--select--</option>
                        {partyProducts
                          .filter(
                            (p) =>
                              p.category === row.category &&
                              (p.brand || "") === (row.brand || "") &&
                              (p.variety || "") === (row.variety || "") &&
                              (row.type
                                ? getProductType(p.item_name) === row.type
                                : true),
                          )
                          .map((p, i) => (
                            <option key={i} value={p.item_name}>
                              {p.item_name}
                            </option>
                          ))}
                      </select>
                    </td>

                    <td>
                      <input
                        type="number"
                        value={row.pcs ? Number(row.pcs).toFixed(1) : ""}
                        readOnly
                      />
                    </td>

                    <td>
                      <input
                        type="number"
                        name="boxes"
                        value={row.boxes}
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                        required
                      />
                    </td>

                    <td>
                      <input type="number" value={row.qty} readOnly />
                    </td>

                    <td>
                      <input type="number" value={row.ltrs} readOnly />
                    </td>

                    <td>
                      <input type="number" value={row.basicPrice} readOnly />
                    </td>

                    <td>
                      <input
                        type="number"
                        name="marketPrice"
                        value={row.marketPrice}
                        onChange={(e) => handleRowChange(index, e)}
                        disabled={row.confirmed && !isEditMode}
                      />
                    </td>

                    <td>
                      <input
                        type="text"
                        value={Number(row.tax).toFixed(2)}
                        readOnly
                      />
                    </td>

                    <td>
                      <input type="number" value={row.amount} readOnly />
                    </td>

                    <td className="sl-row-actions">
                      {!row.confirmed ? (
                        <button
                          type="button"
                          className="sl-confirm-item-btn"
                          onClick={() => handleConfirmRow(index)}
                        >
                          Confirm
                        </button>
                      ) : (
                        <span className="sl-row-confirmed-badge">
                          Confirmed
                        </span>
                      )}
                      <button
                        type="button"
                        className="sl-delete-btn"
                        onClick={() => handleDeleteRow(index)}
                        aria-label={`Delete item ${index + 1}`}
                        title="Delete item"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 6h18"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 6l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M10 11v6M14 11v6"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>

                  {row.item && (
                    <tr key={`scheme-${index}`} className="sl-scheme-row-wrap">
                      <td colSpan={14}>
                        <div className="sl-scheme-row">
                          <div className="sl-scheme-toggle-compact">
                            <span className="sl-scheme-toggle-label">
                              Scheme
                            </span>
                            <label className="sl-switch">
                              <input
                                type="checkbox"
                                checked={row.isScheme}
                                onChange={(e) =>
                                  handleRowSchemeToggle(index, e.target.checked)
                                }
                                disabled={row.confirmed && !isEditMode}
                              />
                              <span className="sl-switch-slider" />
                            </label>
                          </div>

                          <div className="sl-scheme-dropdown-field">
                            <label className="sl-scheme-field-label">
                              Scheme
                            </label>
                            <select
                              value={row.scheme}
                              name="scheme"
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={
                                (row.confirmed && !isEditMode) ||
                                !row.isScheme ||
                                !(schemeOptions[index] || []).length
                              }
                            >
                              <option value="">Select Scheme...</option>
                              {(schemeOptions[index] || []).map((scheme) => (
                                <option
                                  key={scheme.scheme_id}
                                  value={scheme.scheme_id}
                                >
                                  {scheme.scheme_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sl-scheme-qty-field">
                            <label className="sl-scheme-field-label">
                              Scheme Qty
                            </label>
                            <input
                              type="text"
                              name="schemeQty"
                              value={row.schemeQty}
                              onChange={(e) => handleRowChange(index, e)}
                              disabled={
                                (row.confirmed && !isEditMode) || !row.isScheme
                              }
                            />
                          </div>

                          {/* <div className="sl-scheme-qty-field">
                            <label className="sl-scheme-field-label">Scheme Ltrs</label>
                            <input
                              type="text"
                              name="schemeLtrs"
                              value={row.isScheme && row.schemeLtrs ? Number(row.schemeLtrs).toFixed(2) : ""}
                              readOnly
                            />
                          </div> */}

                          <div className="sl-scheme-qty-field">
                            <label className="sl-scheme-field-label">
                              Total Ltrs
                            </label>
                            <input
                              type="text"
                              name="totalLtrs"
                              value={
                                row.isScheme && row.schemeQty
                                  ? (
                                      Number(row.ltrs) + Number(row.schemeQty)
                                    ).toFixed(2)
                                  : Number(row.ltrs).toFixed(2)
                              }
                              readOnly
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {canAddMoreItems && (
          <button type="button" className="sl-add-row" onClick={handleAddRow}>
            <span>+ Add Item</span>
          </button>
        )}

        <div className="sl-section-label">Summary</div>
        <div className="sl-grid sl-summary-grid">
          {canEditPoNumber && (
            <div className="sl-field">
              <label className="sl-label" htmlFor="poNumber">
                PO Number
              </label>
              <div className="sl-input-wrap">
                <input
                  type="text"
                  id="poNumber"
                  name="poNumber"
                  value={formData.poNumber}
                  onChange={handleChange}
                  placeholder="Enter PO number"
                />
                <div className="sl-focus-line" />
              </div>
            </div>
          )}

          <div className="sl-field">
            <label className="sl-label">Company</label>
            <div className="sl-input-wrap">
              <select
                value={formData.company}
                onChange={handleChange}
                name="company"
                required
              >
                <option value="">Select Company</option>
                {company.length > 0
                  ? company.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))
                  : null}
              </select>
              <div className="sl-focus-line" />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label">Total</label>
            <div className="sl-input-wrap">
              <input type="text" value={totalAmount.toFixed(2)} readOnly />
              <div className="sl-focus-line" />
            </div>
          </div>
          <div className="sl-field">
            <label className="sl-label">Tax</label>
            <div className="sl-input-wrap">
              <input type="text" value={taxAmount} readOnly />
              <div className="sl-focus-line" />
            </div>
          </div>

          <div className="sl-field">
            <label className="sl-label">Grand Total</label>
            <div className="sl-input-wrap">
              <input
                type="text"
                name="gtotal"
                value={grandTotal.toFixed(1)}
                readOnly
              />
              <div className="sl-focus-line" />
            </div>
          </div>

          {/* <div className="sl-field sl-full">
            <label className="sl-label">Comment</label>
            <div className="sl-input-wrap">
              <textarea rows={2} placeholder="Add a note..." />
              <div className="sl-focus-line" />
            </div>
          </div> */}
        </div>

        <div className="sl-actions">
          <button
            type="submit"
            className="sl-btn-save"
            disabled={
              isSaving ||
              confirmedRows.length === 0 ||
              rows.some((row) => !row.confirmed && row.item)
            }
          >
            <span>
              {isEditMode ? "Update Order" : isDuplicateMode ? "Create as New" : "Save Order"}
            </span>
          </button>
          <button
            type="button"
            className="sl-btn-clear"
            onClick={handleClearForm}
          >
            <span>{isLoadingFromOrder ? "Cancel" : "Clear"}</span>
          </button>
        </div>
      </form>

      {showSaveConfirm && (
        <div className="sl-modal-overlay">
          <div
            className="sl-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sl-save-confirm-title"
          >
            <div id="sl-save-confirm-title" className="sl-modal-title">
              {isEditMode
                ? "Confirm Update"
                : isDuplicateMode
                  ? "Confirm New Order"
                  : "Confirm Save"}
            </div>
            <p className="sl-modal-text">
              {isEditMode
                ? "Are you sure you want to update this order?"
                : isDuplicateMode
                  ? "Are you sure you want to create a new order based on this one?"
                  : "Are you sure you want to save this order?"}
            </p>
            <div className="sl-modal-actions">
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-secondary"
                onClick={() => setShowSaveConfirm(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-primary"
                onClick={submitOrder}
                disabled={isSaving}
              >
                {isSaving
                  ? isEditMode
                    ? "Updating..."
                    : "Creating..."
                  : isEditMode
                    ? "Yes, Update"
                    : "Yes, Create New"}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="sl-modal-overlay">
          <div
            className="sl-modal sl-success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sl-save-success-title"
          >
            <div id="sl-save-success-title" className="sl-modal-title">
              {saveSuccess.message}
            </div>
            <div className="sl-success-details">
              <div className="sl-success-row">
                <span>Order ID</span>
                <strong>{saveSuccess.orderId}</strong>
              </div>
              <div className="sl-success-row">
                <span>Received Next By</span>
                <strong>{saveSuccess.nextStage}</strong>
              </div>
            </div>
            <div className="sl-modal-actions">
              <button
                type="button"
                className="sl-modal-btn sl-modal-btn-primary"
                onClick={handleSuccessClose}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


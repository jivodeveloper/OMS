import api from "./api"

export interface Product {
  category: string;
  brand: string | null;
  variety: string | null;
  item_name: string;
  item_code: string;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
  tax_rate: string | number;
  basic_rate: string | number;
};

export interface PartyProduct {
  item_code: string;
  item_name: string;
  category: string;
  brand: string | null;
  variety: string | null;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
  tax_rate: string | number;
  basic_rate: string | number;
}
  
export interface SchemeProduct {
  scheme_id: number;
  scheme_name: string;
  item_code: string;
  item_name: string;
  state?: number;
  state_code?: string;
  state_name?: string;
  sal_factor2: string | number;
  sal_pack_unit: string | null;
}

export interface RowType {
  category: string;
  brand: string;
  variety: string;
  type: string;
  item: string;
  isScheme: boolean;
  scheme: string;
  schemeQty: string;
  pcs: string;
  qty: string;
  ltrs: string;
  boxes: string;
  basicPrice: string;
  marketPrice: string;
  tax: string;
  amount: string;
};

export interface OrderItemScheme {
  id?: number;
  scheme_id: number;
  scheme_name?: string | null;
  scheme_item_code?: string | null;
  scheme_qty?: number | string;
  qty_scheme?: number | string;
}

export interface OrderItem {
  item_code: string;
  item_name: string;
  category: string;
  brand: string;
  variety: string;
  item_type: string;
  scheme_name?: string;
  scheme_qty?: number | string;
  qty_scheme?: number | string;
  scheme_ltrs?: number | string;

  qty: number;
  pcs: number;
  boxes: number;
  ltrs: number;

  basic_price: number;
  market_price: number;
  tax_rate: number;
  total: number;
  scheme_id?: number;
  schemes?: OrderItemScheme[];
  total_ltrs: number;
}

export interface CreateOrder {
  order_id?: number;
  card_code: string;
  card_name: string;
  bill_to_id: number;
  bill_to_address: string;
  ship_to_id: number;
  ship_to_address: string;
  dispatch_from_id: number;
  dispatch_from_name: string;

  delivery_date: string;
  po_number?: string;
  company: number;

  total_amount: number;
  tax_amount: number;
  grand_total: number;

  items: OrderItem[];
}

export interface Order {
  id: number;
  status?: number;
  order_number: string;
  card_code: string;
  card_name: string;
  bill_to_id?: number;
  delivery_date: string;
  status_display: string;
  bill_to_address_id?: number;
  bill_to_address: string;
  ship_to_id?: number;
  ship_to_address: string;
  dispatch_from_id?: number;
  dispatch_from_name?: string;
  po_number: string;
  company?: string | number;
  remarks?: string;
  items: OrderItem[];
  created_at: string;
  created_by: string | number;
  total_amount: number;
  sap_doc_number?: string;
  created_by_name?: string;
  party_state?: string;

}

export interface OrderStatus {
  id: number;
  name: string;
}

export interface OrderLog {
  id: number;
  status_name: string;
  remarks: string;
  performed_by_name: string | null;
  created_at: string;
}

export type ItemSchemeDisplay = {
  name: string;
  qty: string | number;
};

const toNumber = (value: string | number | null | undefined) =>
  typeof value === "number" ? value : Number(value || 0);

export const getOrderItemSchemes = (item: OrderItem): ItemSchemeDisplay[] => {
  const schemes = Array.isArray(item.schemes) ? item.schemes : [];

  if (schemes.length > 0) {
    return schemes.map((scheme) => ({
      name: scheme.scheme_name || scheme.scheme_item_code || "",
      qty: scheme.scheme_qty ?? scheme.qty_scheme ?? 0,
    }));
  }

  return item.scheme_name
    ? [{ name: item.scheme_name, qty: item.scheme_qty ?? item.qty_scheme ?? 0 }]
    : [];
};

export const getOrderItemSchemeNames = (item: OrderItem) =>
  getOrderItemSchemes(item)
    .map((scheme) => scheme.name)
    .filter(Boolean)
    .join(", ");

export const getOrderItemSchemeQtyText = (item: OrderItem) =>
  getOrderItemSchemes(item)
    .map((scheme) => scheme.qty)
    .join(", ");

export const getOrderItemTotalLtrs = (item: OrderItem) => {
  const totalLtrs = Number(item.total_ltrs);

  if (Number.isFinite(totalLtrs) && totalLtrs > 0) {
    return totalLtrs;
  }

  const schemeQty = getOrderItemSchemes(item).reduce(
    (sum, scheme) => sum + toNumber(scheme.qty),
    0,
  );

  return Number(item.ltrs || 0) + schemeQty;
};

const normalizeOrderItem = (item: OrderItem): OrderItem => {
  const schemes = Array.isArray(item.schemes)
    ? item.schemes.map((scheme) => ({
        ...scheme,
        scheme_qty: scheme.scheme_qty ?? scheme.qty_scheme ?? 0,
      }))
    : [];
  const schemeQty =
    schemes.length > 0
      ? schemes.reduce((sum, scheme) => sum + toNumber(scheme.scheme_qty ?? scheme.qty_scheme), 0)
      : item.scheme_qty ?? item.qty_scheme ?? 0;
  // const schemeLtrs =
  //   item.scheme_ltrs ??
  //   ((item as any).total_ltrs !== undefined
  //     ? Math.max(toNumber((item as any).total_ltrs) - toNumber(item.ltrs), 0)
  //     : schemeQty);
  const totalLtrs = (item as any).total_ltrs ?? toNumber(item.ltrs) + toNumber(schemeQty);

  return {
    ...item,
    schemes,
    scheme_qty: schemeQty,
    // scheme_ltrs: schemeLtrs,
    total_ltrs: totalLtrs,
  };
};

const normalizeOrder = (order: Order): Order => ({
  ...order,
  items: Array.isArray(order.items) ? order.items.map(normalizeOrderItem) : [],
});


export const ordersService = {

  getPartyName: async () => {
    const response = await api.get("/orders/parties/");
    return response.data;
  },

  getDispatchFrom: async () => {
    const response = await api.get("/orders/dispatches/");
    return response.data;
  },

  getPartyAdd: async (card_code: string) => {
    const response = await api.get(`/orders/addresses/`, {
    params: { card_code }
  });
    return response.data;
  },

  getPartyProduct: async (card_code: string) => {
    const response = await api.get(`/orders/party-products/${card_code}/`);
    return response.data;
  },

  getProducts: async () => {
    const response = await api.get("/orders/products/");
    return response.data;
  },

  getSchemeProducts: async (state_code?: string) => {
    const response = await api.get("/orders/schemes/", {
      params: state_code ? { state_code } : undefined,
    });
    return response.data || [];
  },

  createOrder: async (formData: CreateOrder) => {
    const payload = {
      ...formData,
      items: formData.items.map((item) => ({
        ...item,
        qty: Number(item.qty),
        pcs: Number(item.pcs),
        boxes: Number(item.boxes),
        ltrs: Number(item.ltrs),
        basic_price: Number(item.basic_price),
        market_price: Number(item.market_price),
        tax_rate: Number(item.tax_rate),
        total: Number(item.total),
        scheme_id: item.scheme_id ? Number(item.scheme_id) : undefined,
        scheme_qty: item.scheme_qty ? Number(item.scheme_qty) : 0,
        schemes: Array.isArray(item.schemes)
          ? item.schemes.map((scheme) => ({
              scheme_id: Number(scheme.scheme_id),
              scheme_qty: Number(scheme.scheme_qty ?? scheme.qty_scheme ?? 0),
            }))
          : undefined,
        total_ltrs: item.total_ltrs,
      })),
    };
    const response = await api.post("/orders/create/", payload);
    return response.data;
  },

  async getOrders(status?: number | string, billing?: boolean) {
    const params: string[] = [];
    if (status !== undefined && status !== null) params.push(`status=${status}`);
    if (billing) params.push('billing=true');
    const url = "/orders/list/" + (params.length ? `?${params.join('&')}` : '');
    const response = await api.get(url);
    return Array.isArray(response.data) ? response.data.map(normalizeOrder) : response.data;
  },

  getOrdersByUser: async (userId: number) => {
    const response = await api.get(`/orders/ordersbyuser/${userId}/`);
    return (response.data as Order[]).map(normalizeOrder);
  },

  getOrderDetails: async (orderId: number) => {
    const response = await api.get(`/orders/orderdetailsbyid/${orderId}/`);
    return normalizeOrder(response.data as Order);
  },

  getOrderLogs: async (orderId: number) => {
    const response = await api.get(`/orders/${orderId}/orderlogs/`);
    return response.data as OrderLog[];
  },

  getOrdersStatus: async () => {
    const response = await api.get("/orders/status/");
    return response.data;
  },

  getBranches: async () => {
    const response = await api.get("/orders/branch/"
    );
    return response.data;
  },

  UpdateStatus: async (orderId: number, status: number, reason?: string) => {
    const response = await api.post(`/orders/${orderId}/update-status/`, {
      status,
      ...(reason ? { reason } : {}),
    });
    window.dispatchEvent(new Event("refreshNotifications"));
    return response.data;
  },

 createScheme: async (data: {
  scheme_name: string;
  item_code: string;
  state_code?: string;
}) => {
  const response = await api.post("/orders/create-scheme/", data, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

};

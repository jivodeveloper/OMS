import { storage } from '../utils/storage';
import {api} from './api';

export interface Party {
 value: string;
 label: string;
 state: string;
 category?: string;
 card_code?: string;
 card_name?: string;
}

export interface DispatchLocation {
 id: number;
 name: string;
 code: string;
 city: string;
 state: string;
}

export interface PartyAddress {
 id: number;
 address_id: string | null;
 address_name: string | null;
 gst_number: string | null;
}

export interface AddressResponse {
 bill_to: PartyAddress[];
 ship_to: PartyAddress[];
 is_fallback: boolean;
}

export interface OrderNotification {
 id: number;
 message: string;
 is_read: boolean;
 created_at: string;
 order_id: number;
}

export interface QuotationLog {
 order_id: string;
 sap_doc_num: string;
 sap_doc_entry?: number | null;
 created_at?: string | null;
}

export interface QuotationStatus {
 doc_entry: number | null;
 doc_num: string | null;
 doc_status: string | null;
 canceled: string | null;
 is_open: boolean;
}

export type QuotationStatusLabel = "CANCELLED" | "OPEN" | "CLOSED" | "UNKNOWN";

export interface QuotationOverviewItem {
 id: number;
 order_number: string;
 card_code: string;
 card_name: string;
 created_at: string;
 doc_num: number | string | null;
 doc_entry: number | null;
 quotation_cancelled: boolean;
 quotation_cancelled_at: string | null;
 quotation_cancelled_by: string | null;
 quotation_status: QuotationStatusLabel;
 category?: string;
 categories?: string[];
}

export interface OrderFlowConditionOption {
 code: string;
 label: string;
}

export interface OrderFlowTypeOption {
 code: string;
 label: string;
}

export interface OrderFlowConfig {
 flow_type?: string;
 flow_label?: string;
 flow_options?: OrderFlowTypeOption[];
 rate_approval_enabled: boolean;
 billing_enabled: boolean;
 auditor_enabled: boolean;
 rate_conditions: string[];
 condition_options?: OrderFlowConditionOption[];
 updated_at?: string | null;
 updated_by?: string | null;
}

export interface PartyFlowConfig {
 card_code: string;
 card_name?: string;
 category: string;
 flow_type: string;
 flow_label?: string;
 rate_approval_enabled: boolean;
 billing_enabled: boolean;
 auditor_enabled: boolean;
 rate_conditions: string[];
 updated_at?: string | null;
 updated_by?: string | null;
}

export interface PartyFlowTarget {
 card_code: string;
 category: string;
}

export interface PartyFlowSettings {
 rate_approval_enabled: boolean;
 billing_enabled: boolean;
 auditor_enabled: boolean;
 rate_conditions: string[];
}

export const orderService = {
 getParties: async (): Promise<Party[]> => {
 return await api.get('/orders/parties/');
 },
 // All parties (not filtered by the current user's assignments) — used by the
 // admin Order Flow screen where any party can be targeted.
 getAllParties: async (): Promise<Party[]> => {
 const response = await api.get('/sap/parties/');
 if (Array.isArray(response)) return response;
 if (Array.isArray(response?.results)) return response.results;
 if (Array.isArray(response?.data)) return response.data;
 return [];
 },
 // Fetch parties having templates
 getTemplateParties: async () => {
 const token = await storage.getAccessToken();
 const res = await api.get('/orders/templates/parties/', token || undefined);
 return res;
 },

 // Fetch orders (templates) for a specific party
 getTemplateOrders: async (cardCode: string) => {
 const token = await storage.getAccessToken();
 const res = await api.get(`/orders/templates/orders/?card_code=${cardCode}`, token || undefined);
 return res;
 },
 // Get detailed order data to autofill the form
 getOrderDetails: async (orderId: number) => {
 const token = await storage.getAccessToken();
 const res = await api.get(`/orders/${orderId}/orderdetails/`, token || undefined);
 return res;
 },
 getAddresses: async (cardCode: string, category?: string | null): Promise<AddressResponse> => {
 const query = category
 ? `/orders/addresses/?card_code=${encodeURIComponent(cardCode)}&category=${encodeURIComponent(category)}`
 : `/orders/addresses/?card_code=${encodeURIComponent(cardCode)}`;
 return await api.get(query);
 },
 
 createOrder: async (payload: CreateOrderPayload) => {
 const token = await storage.getAccessToken();
 return await api.post('/orders/create/', payload, token || undefined);
 },

 updateOrder: async (orderId: number, payload: CreateOrderPayload) => {
 const token = await storage.getAccessToken();
 return await api.post('/orders/create/', { ...payload, order_id: orderId }, token || undefined);
 },

 getPartyProducts: async (cardCode: string, category?: string | null) => {
 const query = category
 ? `/orders/party-products/${encodeURIComponent(cardCode)}?party_category=${encodeURIComponent(category)}`
 : `/orders/party-products/${encodeURIComponent(cardCode)}`;
 return await api.get(query);
 },

 getorderstatus: async (cardCode: string) => {
 return await api.get(`/orders/party-products/${cardCode}`);
 },

 getbranch: async (company: string) => {
 return await api.get(`/orders/branch/`);
 },

 getOrderLogs: async(orderId:number):Promise<any>=>{
 return await api.get(`/orders/${orderId}/orderlogs/`);
 },

 getQuotationLog: async(orderId:number):Promise<QuotationLog | null>=>{
 const response = await api.get(`/sap/quotation-log/${orderId}/`);
 if (response?.success === false) {
 return null;
 }
 return (response?.data || response) as QuotationLog;
 },

 // Batch lookup of SAP sales-quotation status for completed orders, so the UI
 // can show the cancel action only where the quotation is still open in SAP.
 getQuotationStatuses: async(orderIds:number[]):Promise<Record<string, QuotationStatus>>=>{
 if (!orderIds.length) return {};
 const response = await api.get(`/orders/quotation-status/?order_ids=${orderIds.join(',')}`);
 return (response?.statuses || {}) as Record<string, QuotationStatus>;
 },

 // Cancel a completed order's SAP sales quotation (manager action).
 cancelQuotation: async(orderId:number):Promise<{ success: boolean; message?: string; order_id?: number; doc_num?: string }>=>{
 return await api.post(`/orders/${orderId}/cancel-quotation/`, {});
 },

 // Admin overview: all completed orders with their sales-quotation status.
 getQuotationOverview: async():Promise<QuotationOverviewItem[]>=>{
 const response = await api.get(`/orders/quotation-overview/`);
 return (response?.data || []) as QuotationOverviewItem[];
 },

 getorderdetailsbyid: async(orderId:number):Promise<any>=>{
 return await api.get(`/orders/orderdetailsbyid/${orderId}`);
 },

 getNotifications: async (): Promise<OrderNotification[]> => {
 const response = await api.get('/orders/notifications/');
 if (Array.isArray(response)) {
 return response;
 }
 throw new Error(response?.message || 'Failed to load notifications.');
 },

 getOrderFlowConfig: async (flowType = 'ASM'): Promise<OrderFlowConfig> => {
 const response = await api.get(`/orders/flow-config/?flow_type=${encodeURIComponent(flowType)}`);
 return (response?.data || response) as OrderFlowConfig;
 },

 updateOrderFlowConfig: async (payload: OrderFlowConfig): Promise<any> => {
 return await api.post('/orders/flow-config/', payload);
 },

 getPartyFlowConfigs: async (): Promise<{
 success?: boolean;
 data: PartyFlowConfig[];
 flow_options?: OrderFlowTypeOption[];
 condition_options?: OrderFlowConditionOption[];
 }> => {
 const response = await api.get('/orders/party-flow-config/');
 return response as {
 success?: boolean;
 data: PartyFlowConfig[];
 flow_options?: OrderFlowTypeOption[];
 condition_options?: OrderFlowConditionOption[];
 };
 },

 savePartyFlowConfig: async (
 parties: PartyFlowTarget[],
 flowType: string,
 settings: PartyFlowSettings,
 ): Promise<{ success?: boolean; message?: string; data?: PartyFlowConfig[] }> => {
 return await api.post('/orders/party-flow-config/', {
 parties,
 flow_type: flowType,
 ...settings,
 });
 },

 deletePartyFlowConfig: async (
 parties: PartyFlowTarget[],
 flowType: string,
 ): Promise<{ success?: boolean; message?: string }> => {
 return await api.delete('/orders/party-flow-config/', {
 parties,
 flow_type: flowType,
 });
 },

 markAllNotificationsRead: async (): Promise<any> => {
 const response = await api.post('/orders/notifications/', {});
 if (response?.success === false) {
 throw new Error(response?.message || 'Failed to mark notifications as read.');
 }
 return response;
 },

 markNotificationRead: async (notificationId: number): Promise<any> => {
 const response = await api.patch(`/orders/notifications/${notificationId}/`);
 if (response?.success === false) {
 throw new Error(response?.message || 'Failed to mark notification as read.');
 }
 return response;
 },
 
 getOrderbyuserid: async (): Promise<any> => {
 const userdata = await storage.getUser();

 if (!userdata?.id) {
 console.log("Invalid user data:", userdata);
 return null;
 }

 console.log("User data retrieved in service:", userdata.id);
 return await api.get(`/orders/ordersbyuser/${userdata.id}/`);
 // return await api.get(`/orders/list/?user_id=${userdata.id}`);
},
addScheme: async (payload: { scheme_name: string; item_code: string,state_code:string }) => {
 return await api.post('/orders/create_scheme', payload);
}

 
};

export const dispatchService = {
 getDispatch: async (): Promise<DispatchLocation[]> => {
 return await api.get('/orders/dispatches/');
 },
};

export const schemeService = {
 getSchemes: async (stateCode?: string | null): Promise<{ scheme_id: number; scheme_name: string }[]> => {
 console.log("Fetching schemes for state code:", stateCode);
 const endpoint = stateCode ? `/orders/schemes/?state_code=${stateCode}` : "";
 const res = await api.get(endpoint);

 if (Array.isArray(res) && res.length) {
 return res;
 }

 // if (stateCode) {
 // const fallbackRes = await api.get('/orders/schemes/');
 // return Array.isArray(fallbackRes) ? fallbackRes : [];
 // }

 return Array.isArray(res) ? res : [];
 },
 getSchemeProductsByName: async (schemeName: string, stateCode: string): Promise<{ scheme_name: string; sal_factor2: number; sal_pack_unit: string }[]> => {
 const res = await api.get(`/orders/scheme-products/?scheme_name=${encodeURIComponent(schemeName)}&state_code=${encodeURIComponent(stateCode)}`);
 return res?.data || [];
 },
 // Fetches ALL combo items for a scheme_id by first resolving the scheme_name
 getComboBySchemeId: async (schemeId: string, stateCode: string): Promise<{ scheme_name: string; sal_factor2: number; sal_pack_unit: string }[]> => {
 const res1 = await api.get(`/orders/scheme-products/?scheme_id=${schemeId}&state_code=${encodeURIComponent(stateCode)}`);
 const seed: { scheme_name?: string } = res1?.data?.[0] ?? {};
 if (!seed.scheme_name) return [];
 const res2 = await api.get(`/orders/scheme-products/?scheme_name=${encodeURIComponent(seed.scheme_name)}&state_code=${encodeURIComponent(stateCode)}`);
 return res2?.data || [];
 },
 getComboByItemCode: async (itemCode: string, stateCode: string): Promise<{ scheme_name: string; sal_factor2: number; sal_pack_unit: string }[]> => {
 // Step 1: find which combo scheme this item belongs to
 const res1 = await api.get(`/orders/scheme-products/?item_code=${encodeURIComponent(itemCode)}&state_code=${encodeURIComponent(stateCode)}`);
 const records: { scheme_name: string }[] = res1?.data || [];
 if (!records.length) return [];
 const schemeName = records[0].scheme_name;
 // Step 2: fetch ALL items in that combo by scheme_name
 const res2 = await api.get(`/orders/scheme-products/?scheme_name=${encodeURIComponent(schemeName)}&state_code=${encodeURIComponent(stateCode)}`);
 return res2?.data || [];
 },
};

export interface ProductFilters {
 categories: { label: string; value: string }[];
 brands: { label: string; value: string }[];
 varieties: { label: string; value: string }[];
 types: { label: string; value: string }[]; // ADD THIS
}

export interface Product {
 id: number;
 item_code: string;
 item_name: string;
 category: string | null;
 brand: string | null;
 variety: string | null;
 sal_factor2: number | null;
 tax_rate: number | null;
 sal_pack_unit: string | null;
}

export interface CreateOrderPayload {
 user_id: number;
 card_code: string;
 card_name: string;
 bill_to_id: number;
 bill_to_address: string;
 ship_to_id: number;
 ship_to_address: string;
 dispatch_from_id: number;
 dispatch_from_name: string;
 company: string;
 po_number?: string;
 is_foc?: boolean;
 delivery_date:string;
 remarks:string;
 items: {
 item_code: string;
 item_name: string;
 category: string;
 brand: string;
 variety: string;
 item_type: string;
 qty: number;
 scheme_id?: number | null;
 scheme_name?: string | null;
 is_scheme_visible?: boolean;
 scheme_qty?: number;
 pcs: number;
 boxes: number;
 ltrs: number;
 basic_price: number;
 total: number;
 tax_rate: number;
 }[];
}

export interface ApproveOr {
 order_id: number;
 card_code?: string;
 created_at?: string;
 bill_to_address?: string;
 ship_to_address?: string;
 dispatch_from_id?: number;
 po_number?: string;
 items?: {
 id?: number | string;
 item_code: string;
 item_name: string;
 qty?: string | number;
 pcs?: string | number;
 boxes?: string | number;
 ltrs?: string | number;
 price_list_basic?: string | number;
 basic_price?: string | number;
 total?: string | number;
 tax_rate?: string | number;
 scheme_id?: number | string | null;
 scheme_name?: string | null;
 scheme_item_code?: string | null;
 qty_scheme?: string | number;
 is_scheme_visible?: boolean;
 is_scheme_line?: boolean;
 parent_item_code?: string;
 category?: string;
 brand?: string;
 variety?: string;
 item_type?: string;
 order?: number;
 scheme?: number | string | null;
 }[];
}

export interface UpdateStatusPayload {
 card_code: string;
 bill_to_address: string;
 ship_to_address: string;
 dispatch_from_id: number;
 po_number: string;
 delivery_date:string;
 items: {
 item_code: string;
 item_name: string;
 category: string;
 brand: string;
 variety: string;
 item_type: string;
 qty: number;
 pcs: number;
 boxes: number;
 ltrs: number; 
 basic_price: number;
 total: number;
 tax_rate: number;
 }[];
}

export interface Approve {
 card_code: string;
 card_name: string;
 bill_to_id: number;
 bill_to_address: string;
 ship_to_id: number;
 ship_to_address: string;
 dispatch_from_id: number;
 dispatch_from_name: string;
 company: string;
 po_number: string;
 delivery_date:string;
 items: {
 item_code: string;
 item_name: string;
 category: string;
 brand: string;
 variety: string;
 item_type: string;
 qty: number;
 pcs: number;
 boxes: number;
 ltrs: number;
 basic_price: number;
 total: number;
 tax_rate: number;
 }[];
}
 
export interface OrderItemList{
 id:number;
 order_number :string;
 card_code :string;
 card_name:string;
 total_amount :string;
 is_foc?: boolean;
 status:string | number;
 status_name?: string;
 status_display?: string;
 sap_doc_number?: string;
 sap_doc_num?: string | number | null;
 sap_doc_entry?: number | null;
 quotation_cancelled?: boolean;
 items_count :number;
 created_by :number;
 created_at:string;
 delivery_date?: string;
 po_number:string;
 categories?: string[];
 bill_to_address:string;
 ship_to_address:string;
 dispatch_from_id:number;
 items?: {
 item_code: string;
 item_name: string;
 price_list_basic: number;
 }[]
}
 
export const productService = {

 getFilters: async (category?: string, brand?: string, variety?: string): Promise<ProductFilters> => {
 let url = '/orders/product-filters/?';
 if (category) url += `category=${encodeURIComponent(category)}&`;
 if (brand) url += `brand=${encodeURIComponent(brand)}&`;
 if (variety) url += `variety=${encodeURIComponent(variety)}&`;
 return await api.get(url);
 },
 
 getProducts: async (category?: string, brand?: string, variety?: string, type?: string): Promise<Product[]> => {
 let url = '/orders/products/?';
 if (category) url += `category=${encodeURIComponent(category)}&`;
 if (brand) url += `brand=${encodeURIComponent(brand)}&`;
 if (variety) url += `variety=${encodeURIComponent(variety)}&`;
 if (type) url += `type=${encodeURIComponent(type)}&`;
 return await api.get(url);
 },

 getOrders:async(userId:number,statusFilter?:string,billingView = false, approvalPending = false, includeSap = false):Promise<OrderItemList[]>=>{
    console.log('userId,status'+userId+statusFilter+',billing='+billingView);
    let url = '/orders/list/?';
    if (userId)
    url+=`user_id=${userId}&`;
    if (statusFilter)
    url+=`status=${statusFilter}&`;
    if (billingView)
    url+=`billing=true&`;
    if (approvalPending)
    url+=`approval_pending=true&`;
    if (includeSap)
    url+=`include_sap=true&`;
    console.log('userId,status'+userId+statusFilter+',billing='+billingView);
 return await api.get(url);

 },

 updatestatus:async(orderId:number,status:string,reason:string):Promise<OrderItemList[]>=>{
 return await api.post(`/orders/${orderId}/update-status/`,{
 status,
 reason
 });
 },

 approveOrder:async(orderId:number):Promise<OrderItemList[]>=>{
 return await api.post(`/orders/${orderId}/approve/`,{});
 },

 rejectOrder:async(orderId:number,reason:string):Promise<OrderItemList[]>=>{
 return await api.post(`/orders/${orderId}/reject/`,{reason});
 },

 sapApproveOrder:async(order:ApproveOr):Promise<any>=>{
 return await api.post(`/sap/approve-order/`, order);
 },
 
};

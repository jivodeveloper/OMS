import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import type { Order, OrderItem } from "../services/ordersService";
import { sapService } from "../services/sapService";
import { loadManagerOrders } from "../utils/orderHistory";
import { ordersService } from "../services/ordersService";
import "../styles/Order_Status_Tracking.css";
import {
  HiEye,HiArrowDownTray
}from "react-icons/hi2";

type TrackingMode = "auditor" | "billing";

type OrderStatusTrackingProps = {
  mode: TrackingMode;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

const ACCEPTED_KEYWORDS: Record<TrackingMode, string[]> = {
  auditor: ["billing", "billed", "completed", "quotation"],
  billing: ["completed"],
};
const REJECTED_KEYWORDS = ["rejected", "declined", "cancelled", "canceled"];
const BILLING_REJECTED_KEYWORDS = ["billing rejected", "rejected by billing", "billing reject"];
const AUDITOR_REJECTED_CODES = ["REJECTED"];
const BILLING_REJECTED_CODES = ["BILLING_REJECTED"];

const normalizeStatusClass = (status: string) => status.toLowerCase().replace(/\s+/g, "-");

const getDecisionType = (order: Order, mode: TrackingMode) => {
  const normalized = (order.status_display || "").toLowerCase();
  const statusCode = String(order.status || "").toUpperCase();

  if (mode === "auditor") {
    if (BILLING_REJECTED_CODES.includes(statusCode) || BILLING_REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return "accepted";
    }
    if (AUDITOR_REJECTED_CODES.includes(statusCode) || normalized === "rejected") {
      return "rejected";
    }
  }

  if (mode === "billing") {
    if (AUDITOR_REJECTED_CODES.includes(statusCode) || normalized === "rejected") {
      return "other";
    }
  }

  if (ACCEPTED_KEYWORDS[mode].some((keyword) => normalized.includes(keyword))) {
    return "accepted";
  }
  if (REJECTED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "rejected";
  }
  return "other";
};

export default function Order_Status_Tracking({ mode }: OrderStatusTrackingProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [currentPage, setCurrentPage] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);

  const itemsPerPage = 10;
  const pageTitle = mode === "auditor" ? "Auditor Status Tracking" : "Billing Status Tracking";
  const pageSubtitle =
    mode === "auditor"
      ? "Track orders reviewed and marked accepted or rejected by the auditor stage."
      : "Track orders handled at billing stage and review accepted or rejected outcomes.";

  useEffect(() => {
    void fetchOrders();
  }, [mode]);

  const fetchOrders = async () => {
    try {
      const data = await loadManagerOrders();
      setOrders(data || []);
    } catch (error) {
      console.log("Error fetching orders:", error);
    }
  };

  const trackedOrders = useMemo(
    () => orders.filter((order) => getDecisionType(order, mode) !== "other"),
    [orders, mode],
  );

  const dateFilteredOrders = useMemo(() => {
    return trackedOrders.filter((order) => {
      let matchesDate = true;
      if (fromDate && toDate) {
        const orderDate = new Date(order.created_at);
        const from = new Date(`${fromDate}T00:00:00.000`);
        const to = new Date(`${toDate}T23:59:59.999`);
        matchesDate = orderDate >= from && orderDate <= to;
      }

      return matchesDate;
    });
  }, [trackedOrders, fromDate, toDate]);

  const filteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((order) => {
      const decisionType = getDecisionType(order, mode);
      return decisionFilter === "all" ? true : decisionType === decisionFilter;
    });
  }, [dateFilteredOrders, decisionFilter, mode]);

  const acceptedCount = dateFilteredOrders.filter((order) => getDecisionType(order, mode) === "accepted").length;
  const rejectedCount = dateFilteredOrders.filter((order) => getDecisionType(order, mode) === "rejected").length;

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const isCompletedStatus = (order?: Order | null) => {
    const s = String(order?.status_display || "").toLowerCase();
    return ["completed", "billing", "billed", "quotation", "approved", "accepted"].some(k => s.includes(k));
  };

  const applyQuotationNumber = (order: Order, quotationNo?: string) =>
    quotationNo && quotationNo !== order.sap_doc_number
      ? { ...order, sap_doc_number: quotationNo }
      : order;

  const cacheQuotationNumber = (orderId: number, quotationNo?: string) => {
    if (!quotationNo) return;
    setOrders((prev) =>
      prev.map((item) => (item.id === orderId ? { ...item, sap_doc_number: quotationNo } : item)),
    );
  };

  const resolveQuotationNumber = async (order: Order) => {
    const existingValue = String(order.sap_doc_number || "").trim();
    if (existingValue) return existingValue;
    if (!isCompletedStatus(order)) return "";

    try {
      const quotationLog = await sapService.getQuotationLog(order.id);
      const quotationNo = String(quotationLog?.sap_doc_num || "").trim();
      if (quotationNo) {
        cacheQuotationNumber(order.id, quotationNo);
      }
      return quotationNo;
    } catch (error) {
      console.log("Error fetching quotation number:", error);
      return "";
    }
  };

     const fetchOrderDetails = async (orderId: number) => {
  try {
    const data = await ordersService.getOrderDetails(orderId);

    const qno = await resolveQuotationNumber(data);
    if (qno) {
      data.sap_doc_number = qno;
    }

    setOrderDetails(data);
    setSelectedItems(data.items || []);
    setShowDetails(true);
  } catch (error) {
    console.log("Error fetching order details:", error);
  }
};

  const totalLtrs = selectedItems.reduce(
    (sum, item) =>
      sum + (Number((item as any).total_ltrs) || (Number(item.ltrs || 0) + Number((item as any).scheme_ltrs || 0))),
    0,
  );
  const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const taxTotal = selectedItems.reduce(
    (sum, item) => sum + ((Number(item.total || 0) * Number(item.tax_rate || 0)) / 100),
    0,
  );
  const grandTotal = subtotal + taxTotal;
  const hasQuotationNumber = Boolean(String(orderDetails?.sap_doc_number || "").trim());
  const isCompletedOrder = isCompletedStatus(orderDetails);

  const downloadExcel = async (order: Order) => {
    const quotationNo = await resolveQuotationNumber(order);
    const exportOrder = applyQuotationNumber(order, quotationNo);
    let excelData: object[] = [];

    if (exportOrder.items && exportOrder.items.length > 0) {
      excelData = exportOrder.items.map((item: OrderItem) => ({
        "Order Number": exportOrder.order_number,
        "Card Code": exportOrder.card_code,
        "Card Name": exportOrder.card_name,
        "Delivery Date": exportOrder.delivery_date,
        Status: exportOrder.status_display,
        ...(String(exportOrder.sap_doc_number || "").trim() ? { "Quotation No": exportOrder.sap_doc_number } : {}),
        "Bill To": exportOrder.bill_to_address,
        "Ship To": exportOrder.ship_to_address,
        "Item Code": item.item_code,
        "Item Name": item.item_name,
        Scheme: item.scheme_name || "",
        "Scheme Qty": item.scheme_qty || "",
        
        Qty: item.qty,
        Boxes: item.boxes,
        Liters: item.ltrs,
        "Total Ltrs": (item as any).total_ltrs || (Number(item.ltrs || 0) + Number((item as any).scheme_qty || 0)).toFixed(2),
        "Total Amount": item.total,
      }));
    } else {
      excelData.push({
        "Order Number": exportOrder.order_number,
        "Card Code": exportOrder.card_code,
        "Card Name": exportOrder.card_name,
        "Delivery Date": exportOrder.delivery_date,
        Status: exportOrder.status_display,
        ...(String(exportOrder.sap_doc_number || "").trim() ? { "Quotation No": exportOrder.sap_doc_number } : {}),
        "Bill To": exportOrder.bill_to_address,
        "Ship To": exportOrder.ship_to_address,
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Status Tracking");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(file, `Tracked_Order_${exportOrder.order_number}.xlsx`);
  };

  return (
    <div className="ot-page">
      {!showDetails && (
        <>
          <div className="ot-head">
            <div>
              <h1 className="ot-title">{pageTitle}</h1>
              {/* <p className="ot-subtitle">{pageSubtitle}</p> */}
            </div>
          </div>

          <div className="ot-kpis">
            
            <div className="ot-kpi-card ot-kpi-card-accepted">
              <span className="ot-kpi-label">Accepted</span>
              <span className="ot-kpi-value">{acceptedCount}</span>
            </div>
            <div className="ot-kpi-card ot-kpi-card-rejected">
              <span className="ot-kpi-label">Rejected</span>
              <span className="ot-kpi-value">{rejectedCount}</span>
            </div>
          </div>

          <div className="ot-toolbar">
            <div className="ot-toolbar-group">
              <button
                type="button"
                className={`ot-chip${decisionFilter === "all" ? " active" : ""}`}
                onClick={() => {
                  setDecisionFilter("all");
                  setCurrentPage(1);
                }}
              >
                All
              </button>
              <button
                type="button"
                className={`ot-chip${decisionFilter === "accepted" ? " active ot-chip-accepted" : ""}`}
                onClick={() => {
                  setDecisionFilter("accepted");
                  setCurrentPage(1);
                }}
              >
                Accepted
              </button>
              <button
                type="button"
                className={`ot-chip${decisionFilter === "rejected" ? " active ot-chip-rejected" : ""}`}
                onClick={() => {
                  setDecisionFilter("rejected");
                  setCurrentPage(1);
                }}
              >
                Rejected
              </button>
            </div>

            <div className="ot-filters">
              {/* <select
                className="ot-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All Statuses</option>
                {filteredStatusOptions.map((status) => (
                  <option key={status.id} value={status.name}>
                    {status.name}
                  </option>
                ))}
              </select> */}

              <div className="ot-date-wrap">
                <label className="ot-date-label">From</label>
                <input
                  type="date"
                  className="ot-date-input"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div className="ot-date-wrap">
                <label className="ot-date-label">To</label>
                <input
                  type="date"
                  className="ot-date-input"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="ot-table-wrap">
            <table className="ot-table">
              <thead>
                <tr>
                  <th>Order ID</th>
              <th>Quotation No</th>
                  <th>Card Code</th>
                  <th>Card Name</th>
                  <th>Delivery Date</th>
                  <th>Status</th>
                  <th>Details</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrders.length > 0 ? (
                  paginatedOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.order_number}</td>
                  <td>
                    {String(order.sap_doc_number || "").trim() ? (
                      <span className="ot-badge" style={{ background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }}>
                        {order.sap_doc_number}
                      </span>
                    ) : "—"}
                  </td>
                      <td>{order.card_code}</td>
                      <td>{order.card_name}</td>
                      <td>{order.delivery_date}</td>
                      <td>
                        <span className={`ot-badge ot-badge-${normalizeStatusClass(order.status_display || "unknown")}`}>
                          {order.status_display || "Unknown"}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="ao-btn-icon view" onClick={() => fetchOrderDetails(order.id)}>
                         <HiEye size={22} />
                        </button>
                      </td>
                      <td>
                        <button type="button" className="ao-btn-icon download" onClick={() => downloadExcel(order)}>
                           <HiArrowDownTray size={22} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                <td colSpan={8} className="ot-empty">No accepted or rejected orders found for this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredOrders.length > itemsPerPage && (
            <div className="ot-pagination">
              <button
                type="button"
                className="ot-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => prev - 1)}
              >
                ← Prev
              </button>
              <span className="ot-pg-info">
                {currentPage} / {Math.ceil(filteredOrders.length / itemsPerPage)}
              </span>
              <button
                type="button"
                className="ot-pg-btn"
                disabled={currentPage === Math.ceil(filteredOrders.length / itemsPerPage)}
                onClick={() => setCurrentPage((prev) => prev + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {showDetails && orderDetails && (
        <div className="ot-detail">
          <div className="ot-detail-nav">
            <button type="button" className="ot-back-btn" onClick={() => setShowDetails(false)}>
              Back to Tracking
            </button>
            <button type="button" className="ot-export-btn" onClick={() => downloadExcel(orderDetails)}>
              Export Excel
            </button>
          </div>

          <div className="ot-detail-card">
            <div className="ot-detail-grid">
              <div className="ot-detail-field ot-detail-span2">
                <span className="ot-detail-label">Order Number</span>
                <div className="ot-detail-order-row">
                  <span className="ot-detail-number">{orderDetails.order_number}</span>
                  <span className={`ot-badge ot-badge-${normalizeStatusClass(orderDetails.status_display || "unknown")}`}>
                    {orderDetails.status_display || "Unknown"}
                  </span>
                </div>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Party State</span>
                <span className="ot-detail-value">{orderDetails.party_state || "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Punched By</span>
                <span className="ot-detail-value">{orderDetails.created_by_name || "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Created Date</span>
                <span className="ot-detail-value">{orderDetails.created_at ? new Date(orderDetails.created_at).toLocaleDateString("en-GB") : "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Delivery Date</span>
                <span className="ot-detail-value">{orderDetails.delivery_date || "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Party Name</span>
                <span className="ot-detail-value">{orderDetails.card_name || "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Card Code</span>
                <span className="ot-detail-value">{orderDetails.card_code || "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Bill To</span>
                <span className="ot-detail-value">{orderDetails.bill_to_address || "—"}</span>
              </div>
              <div className="ot-detail-field">
                <span className="ot-detail-label">Ship To</span>
                <span className="ot-detail-value">{orderDetails.ship_to_address || "—"}</span>
              </div>
              {(isCompletedOrder || hasQuotationNumber) && (
                <div className="ot-detail-field">
                  <span className="ot-detail-label">Quotation No</span>
                  <span className="ot-detail-value">{String(orderDetails.sap_doc_number || "").trim() || "—"}</span>
                </div>
              )}
            </div>
          </div>

          <div className="ot-items-card">
            <div className="ot-items-head">
              <span className="ot-items-title">Items</span>
              <span className="ot-items-count">{selectedItems.length}</span>
              <span className="ot-items-title" style={{ marginLeft: "auto", marginRight: "16px" }}>
                Total Ltrs: {totalLtrs.toFixed(2)}
              </span>
            </div>
            <div className="ot-items-scroll">
              <table className="ot-items-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Code</th>
                    <th style={{ minWidth: '250px' }}>Item Name</th>
                    <th>Category</th>
                    <th>Scheme</th>
                    <th>Scheme Qty</th>
                    <th>Qty</th>
                    <th>Pcs</th>
                    <th>Boxes</th>
                    <th>Ltrs</th>
                    {/* <th>Scheme Ltrs</th> */}
                    <th>Total Ltrs</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, index) => (
                      <tr key={`${item.item_code}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.item_code}</td>
                        <td style={{ minWidth: '250px' }}>{item.item_name}</td>
                        <td>{item.category}</td>
                        <td>{item.scheme_name || "—"}</td>
                        <td>{item.scheme_name ? item.scheme_qty || 0 : "—"}</td>
                        <td>{item.qty}</td>
                        <td>{item.pcs}</td>
                        <td>{Number(item.boxes).toFixed(2)}</td>
                        <td>{item.ltrs}</td>
                        {/* <td>{item.scheme_name ? (item as any).scheme_ltrs || 0 : "—"}</td> */}
                        <td>{(item as any).total_ltrs || (Number(item.ltrs || 0) + Number((item as any).scheme_qty || 0)).toFixed(2)}</td>
                        <td>{Number(item.total).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="ot-empty">No items found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ot-summary-card">
            <div className="ot-summary-row">
              <span className="ot-summary-label">Total Ltrs</span>
              <span className="ot-summary-value">{totalLtrs.toFixed(2)}</span>
            </div>
            <div className="ot-summary-row">
              <span className="ot-summary-label">Subtotal</span>
              <span className="ot-summary-value">{subtotal.toFixed(2)}</span>
            </div>
            <div className="ot-summary-row">
              <span className="ot-summary-label">Tax</span>
              <span className="ot-summary-value">{taxTotal.toFixed(2)}</span>
            </div>
            <div className="ot-summary-row ot-summary-row-grand">
              <span className="ot-summary-label">Grand Total</span>
              <span className="ot-summary-value">{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
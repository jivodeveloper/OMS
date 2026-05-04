import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  getOrderItemSchemeNames,
  getOrderItemSchemes,
  getOrderItemSchemeQtyText,
  getOrderItemTotalLtrs,
  ordersService,
} from "../services/ordersService";
import type { OrderItem, Order, OrderStatus, PartyProduct } from "../services/ordersService";
import { loadCurrentUserOrders } from "../utils/orderHistory";
import "../styles/View_Orders.css";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  HiEye,           // View
  HiArrowDownTray    // Download
} from "react-icons/hi2";

const now = new Date();

// First day of current month
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  .toISOString()
  .split("T")[0];

// Last day of current month
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  .toISOString()
  .split("T")[0];

type PartyFilterOption = {
  cardCode: string;
  cardName: string;
};

type ItemFilterOption = {
  itemCode: string;
  itemName: string;
};

export default function View_Orders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [status, setStatus] = useState<OrderStatus[]>([]);
  const [partyOptions, setPartyOptions] = useState<PartyFilterOption[]>([]);
  const [partyItems, setPartyItems] = useState<PartyProduct[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await loadCurrentUserOrders();
        setOrders(data);
      } catch (error) {
        console.log("Error fetching orders:", error);
      }
    };

    const fetchOrderStatus = async () => {
      try {
        const data = await ordersService.getOrdersStatus();
        setStatus(data);
      } catch (error) {
        console.log("Error fetching order Status:", error);
      }
    };

    const fetchAssignedParties = async () => {
      try {
        const data = await ordersService.getPartyName();
        const parties = Array.isArray(data) ? data : [];
        const uniqueParties = new Map<string, PartyFilterOption>();

        parties.forEach((party) => {
          const cardCode = String(party.value || party.card_code || "").trim();
          const rawLabel = String(party.label || party.card_name || "").trim();
          const cardName = rawLabel.replace(/\s*\([^)]*\)\s*$/, "") || cardCode;
          const key = cardCode || cardName;

          if (!key) return;

          uniqueParties.set(key, { cardCode, cardName });
        });

        setPartyOptions(
          Array.from(uniqueParties.values()).sort((a, b) =>
            a.cardName.localeCompare(b.cardName),
          ),
        );
      } catch (error) {
        console.log("Error fetching assigned parties:", error);
      }
    };

    fetchOrders();
    fetchOrderStatus();
    fetchAssignedParties();
  }, []);

  useEffect(() => {
    if (location.state?.openOrderId) {
      fetchOrderDetails(location.state.openOrderId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openOrderId, location.pathname, navigate]);

  // console.log("Selected Items:", JSON.stringify(selectedItems));
  // console.log("Order Details:", JSON.stringify(orderDetails));

       const fetchOrderDetails = async (orderId: number) => {
  try {
    const data = await ordersService.getOrderDetails(orderId);

    setOrderDetails(data);
    setSelectedItems(data.items || []);
    setShowDetails(true);
  } catch (error) {
    console.log("Error fetching order details:", error);
  }
};

  useEffect(() => {
    let isCancelled = false;

    const fetchPartyItems = async () => {
      if (!partyFilter) {
        setPartyItems([]);
        setItemFilter("");
        return;
      }

      setIsLoadingItems(true);
      setItemFilter("");

      try {
        const data = await ordersService.getPartyProduct(partyFilter);
        if (isCancelled) return;

        setPartyItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.log("Error fetching party items:", error);
        if (!isCancelled) {
          setPartyItems([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingItems(false);
        }
      }
    };

    fetchPartyItems();

    return () => {
      isCancelled = true;
    };
  }, [partyFilter]);

  const itemOptions = useMemo<ItemFilterOption[]>(() => {
    const uniqueItems = new Map<string, ItemFilterOption>();

    partyItems.forEach((item) => {
      const itemCode = String(item.item_code || "").trim();
      const itemName = String(item.item_name || "").trim();
      const key = itemCode || itemName;

      if (!key) return;

      uniqueItems.set(key, {
        itemCode,
        itemName: itemName || itemCode,
      });
    });

    return Array.from(uniqueItems.values()).sort((a, b) =>
      a.itemName.localeCompare(b.itemName),
    );
  }, [partyItems]);

  const filteredOrders = orders.filter((order) => {
    const matchStatus = statusFilter ? order.status_display === statusFilter : true;
    let matchDate = true;

    const matchParty = partyFilter
      ? order.card_code === partyFilter || order.card_name === partyFilter
      : true;
    const matchItem = itemFilter
      ? Boolean(
          order.items?.some(
            (item) => item.item_code === itemFilter || item.item_name === itemFilter,
          ),
        )
      : true;

    if (fromDate && toDate) {
      const orderDate = new Date(order.created_at);
      const from = new Date(`${fromDate}T00:00:00.000`);
      const to = new Date(`${toDate}T23:59:59.999`);

      matchDate = orderDate >= from && orderDate <= to;
    }

    return matchStatus && matchDate && matchParty && matchItem;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const pageNumber = Math.min(currentPage, totalPages);
  const paginatedOrders = filteredOrders.slice(
    (pageNumber - 1) * itemsPerPage,
    pageNumber * itemsPerPage,
  );

  const downloadExcel = (order: Order) => {
    let excelData = [];

    // If items exist → flatten data
    if (order.items && order.items.length > 0) {
      excelData = order.items.map((item: OrderItem) => ({
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Delivery Date": order.delivery_date,
        "Status": order.status_display,

        "Bill To": order.bill_to_address,
        "Ship To": order.ship_to_address,

        "Item Code": item.item_code,
        "Item Name": item.item_name,
        "Scheme": getOrderItemSchemeNames(item),
        "Scheme Qty": getOrderItemSchemeQtyText(item),
        // "Scheme Ltrs": (item as any).scheme_ltrs || "",
        "Qty": item.qty,
        "Boxes": item.boxes,
        "Liters": item.ltrs,
        "Total Ltrs": getOrderItemTotalLtrs(item),
        "Total Amount": item.total,
      }));
    } else {
      // If no items → still export order
      excelData.push({
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Delivery Date": order.delivery_date,
        "Status": order.status_display,
        "Bill To": order.bill_to_address,
        "Ship To": order.ship_to_address,
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Order Details");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const file = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(file, `Order_${order.order_number}.xlsx`);
  };
  return (
    <div className="vo-page">

      {/* ── LIST VIEW ── */}
      {!showDetails && (
        <>
          <div className="vo-toolbar">
            <div className="vo-search-wrap">
              <select
                className="vo-status-select"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">All Statuses</option>
                {status.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>

              <select
                className="vo-status-select"
                value={partyFilter}
                onChange={(e) => {
                  setPartyFilter(e.target.value);
                  setItemFilter("");
                  setCurrentPage(1);
                }}
              >
                <option value="">All Parties</option>
                {partyOptions.map((party) => (
                  <option key={party.cardCode || party.cardName} value={party.cardCode || party.cardName}>
                    {party.cardName}{party.cardCode ? ` (${party.cardCode})` : ""}
                  </option>
                ))}
              </select>

              <select
                className="vo-status-select"
                value={itemFilter}
                disabled={!partyFilter || isLoadingItems}
                onChange={(e) => { setItemFilter(e.target.value); setCurrentPage(1); }}
              >
                <option value="">
                  {partyFilter
                    ? isLoadingItems
                      ? "Loading Items..."
                      : "All Items"
                    : "Select Party First"}
                </option>
                {itemOptions.map((item) => (
                  <option key={item.itemCode || item.itemName} value={item.itemCode || item.itemName}>
                    {item.itemName}{item.itemCode ? ` (${item.itemCode})` : ""}
                  </option>
                ))}
              </select>

              <div className="vo-date-wrap">
                <label className="vo-date-label">From</label>
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} className="vo-date-input" />
              </div>

              <div className="vo-date-wrap">
                <label className="vo-date-label">To</label>
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} className="vo-date-input" />
              </div>
            </div>
            <span className="vo-count">Total: {filteredOrders.length}</span>
          </div>

          {filteredOrders.length > 0 ? (
            <div className="vo-table-wrap">
              <table className="vo-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Card Code</th>
                    <th>Card Name</th>
                    <th>Created Date</th>
                    <th>Delivery Date</th>
                    <th>Status</th>
                    <th>Details</th>
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.order_number}</td>
                        <td>{order.card_code}</td>
                        <td>{order.card_name}</td>
                        <td>{order.created_at ? new Date(order.created_at).toLocaleDateString("en-GB") : "—"}</td>
                        <td>{order.delivery_date}</td>
                        <td>
                          <span className={`vo-badge vo-badge-${(order.status_display || "").toLowerCase().replace(/\s+/g, "-")}`}>
                            {order.status_display}
                          </span>
                        </td>
                        <td>
                          <button
                            className="ao-btn-icon view" 
                            onClick={() => {
                             fetchOrderDetails(order.id);
                            }}
                          >
                           <HiEye size={22} />
                          </button>
                        </td>
                        <td>
                          <button
                                  className="ao-btn-icon download"
                                  onClick={() => downloadExcel(order)}
                                  >
                                  <HiArrowDownTray size={22} />
                             </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vo-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>No orders found</div>
          )}

          {filteredOrders.length > itemsPerPage && (
            <div className="vo-pagination">
              <button className="vo-pg-btn" disabled={pageNumber === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>← Prev</button>
              <span className="vo-pg-info">{pageNumber} / {totalPages}</span>
              <button className="vo-pg-btn" disabled={pageNumber === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* ── DETAIL VIEW ── */}
      {showDetails && orderDetails && (
        <div className="vo-detail">
          {/* Navigation */}
          <div className="vo-d-nav">
            <button className="vo-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Back to Orders
            </button>
            <button className="vo-d-export" onClick={() => downloadExcel(orderDetails)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Export Excel
            </button>
          </div>

          {/* Order Info Card */}
          <div className="vo-d-header-card">
            <div className="vo-d-info-grid">
              <div className="vo-d-info-field vo-d-info-span2">
                <span className="vo-d-hf-label">Order Number</span>
                <div className="vo-d-ordnum-row">
                  <span className="vo-d-ordnum">{orderDetails.order_number}</span>
                  <span className={`vo-badge vo-badge-${(orderDetails.status_display || "").toLowerCase().replace(/\s+/g, "-")}`}>{orderDetails.status_display}</span>
                </div>
              </div>
              <div className="vo-d-info-field">
                <span className="vo-d-hf-label">Created Date</span>
                <span className="vo-d-hf-value">{orderDetails.created_at ? new Date(orderDetails.created_at).toLocaleDateString("en-GB") : "—"}</span>
              </div>
              <div className="vo-d-info-field">
                <span className="vo-d-hf-label">Delivery Date</span>
                <span className="vo-d-hf-value">{orderDetails.delivery_date || "—"}</span>
              </div>
              <div className="vo-d-info-field">
                <span className="vo-d-hf-label">Party Name</span>
                <span className="vo-d-hf-value">{orderDetails.card_name}</span>
              </div>
              <div className="vo-d-info-field">
                <span className="vo-d-hf-label">Card Code</span>
                <span className="vo-d-hf-value">{orderDetails.card_code}</span>
              </div>
              <div className="vo-d-info-field">
                <span className="vo-d-hf-label">Bill To</span>
                <span className="vo-d-hf-value">{orderDetails.bill_to_address || "—"}</span>
              </div>
              <div className="vo-d-info-field">
                <span className="vo-d-hf-label">Ship To</span>
                <span className="vo-d-hf-value">{orderDetails.ship_to_address || "—"}</span>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="vo-d-items">
            <div className="vo-d-items-head">
              <span className="vo-d-items-title">Items</span>
              <span className="vo-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="vo-d-items-scroll">
              <table className="vo-d-tbl">
                <thead>
                  <tr>
                    <th>#</th><th>Item Code</th><th style={{ minWidth: '250px' }}>Item Name</th><th>Category</th><th>Scheme</th><th>Scheme Qty</th><th>Qty</th><th>Pcs</th><th>Boxes</th><th>Ltrs</th>
                    {/* <th>Scheme Ltrs</th> */}
                    <th>Total Ltrs</th><th>Basic Price</th><th>Market Price</th><th>Tax %</th><th style={{textAlign:'right'}}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length > 0 ? selectedItems.map((item, i) => {
                    const schemes = getOrderItemSchemes(item);

                    return (
                    <tr key={i}>
                      <td style={{textAlign:'center',color:'#94a3b8'}}>{i + 1}</td>
                      <td><span className="vo-d-item-code">{item.item_code}</span></td>
                      <td style={{fontWeight:500,color:'#0f172a', minWidth: '250px'}}>{item.item_name}</td>
                      <td>{item.category}</td>
                      <td colSpan={2}>
                        {schemes.length > 0 ? (
                          <div className="order-scheme-stack" aria-label="Applied schemes">
                            {schemes.map((scheme, schemeIndex) => (
                              <div className="order-scheme-chip" key={`${item.item_code}-scheme-${schemeIndex}`}>
                                <span className="order-scheme-name">{scheme.name || "-"}</span>
                                <span className="order-scheme-qty">Qty {scheme.qty || 0}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="order-scheme-empty">No scheme</span>
                        )}
                      </td>
                      <td style={{textAlign:'center'}}>{item.qty}</td>
                      <td style={{textAlign:'center'}}>{item.pcs}</td>
                      <td style={{textAlign:'center'}}>{Number(item.boxes).toFixed(2)}</td>
                      <td style={{textAlign:'center'}}>{item.ltrs}</td>
                      {/* <td style={{textAlign:'center'}}>{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "—"}</td> */}
                      <td style={{textAlign:'center'}}>{getOrderItemTotalLtrs(item).toFixed(2)}</td>
                      <td style={{textAlign:'right'}}>{Number(item.basic_price).toFixed(2)}</td>
                      <td style={{textAlign:'right'}}>{Number(item.market_price).toFixed(2)}</td>
                      <td style={{textAlign:'center'}}>{Number(item.tax_rate).toFixed(2)}</td>
                      <td style={{textAlign:'right',fontWeight:600,color:'#0f172a'}}>{Number(item.total).toFixed(2)}</td>
                    </tr>
                    );
                  }) : (<tr><td colSpan={14} className="vo-empty">No items found</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div className="vo-d-summary">
            <div className="vo-d-sum-row">
              <span className="vo-d-sum-label">Total Ltrs</span>
              <span className="vo-d-sum-val">{selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0).toFixed(2)}</span>
            </div>
            <div className="vo-d-sum-row">
              <span className="vo-d-sum-label">Subtotal</span>
              <span className="vo-d-sum-val">{selectedItems.reduce((s, i) => s + Number(i.total || 0), 0).toFixed(2)}</span>
            </div>
            <div className="vo-d-sum-row">
              <span className="vo-d-sum-label">Tax</span>
              <span className="vo-d-sum-val">{selectedItems.reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0) / 100), 0).toFixed(2)}</span>
            </div>
            <div className="vo-d-sum-row vo-d-sum-grand">
              <span className="vo-d-sum-label">Grand Total</span>
              <span className="vo-d-sum-val">{(selectedItems.reduce((s, i) => s + Number(i.total || 0), 0) + selectedItems.reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0) / 100), 0)).toFixed(2)}</span>
            </div>
          </div>
        </div>

      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { getOrderItemSchemeNames, getOrderItemSchemes, getOrderItemSchemeQtyText, getOrderItemTotalLtrs, ordersService } from "../services/ordersService";
import type { Order, OrderItem } from "../services/ordersService";
import "../styles/Billing_Order.css";
import { useNavigate, useLocation } from "react-router-dom";
import {
  HiCheckCircle,   // Approve
  HiXCircle,       // Reject
  HiEye,           // View
  HiArrowDownTray,  // Download
  // HiEllipsisVertical  
  HiPencilSquare,
} from "react-icons/hi2";
import api from '../services/api'

const now = new Date();


// First day of current month
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  .toISOString()
  .split("T")[0];

// Last day of current month
const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  .toISOString()
  .split("T")[0];

export default function Billing_orders() {

  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  // const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Quotation flow state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
  const [pendingOrderNum, setPendingOrderNum] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [quotationResult, setQuotationResult] = useState<{ number: string; order_id: string } | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const data = await ordersService.getOrders(undefined, true);
      setOrders(data);
    } catch (error) {
      console.log("Error fetching orders:", error);
    }
  };
  console.log("All Orders:", orders);

  useEffect(() => {
    if (location.state?.openOrderId) {
      fetchOrderDetails(location.state.openOrderId);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openOrderId, location.pathname, navigate]);

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

  // Step 1 â€“ open confirm modal
  const initiateApprove = (order: Order) => {
    setPendingOrderId(order.id);
    setPendingOrderNum(order.order_number);
    setShowConfirmModal(true);
  };

  // Step 2 â€“ user confirmed: show loader â†’ call API â†’ show success
  const confirmApprove = async () => {
    if (!pendingOrderId) return;
    setShowConfirmModal(false);
    setIsCreating(true);
    try {
      const salesResponse = await api.post("/sap/approve-order/", {
        order_id: pendingOrderId,
      });
      if (salesResponse.data) {
        const sapData = salesResponse.data.data ?? salesResponse.data;
        const quotationNumber = sapData.DocNum ?? sapData.doc_num ?? sapData.DocEntry ?? "-";
        await ordersService.UpdateStatus(pendingOrderId, 9);
        setQuotationResult({ number: String(quotationNumber), order_id: pendingOrderNum });
        setShowSuccess(true);
      }
      fetchOrders();
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (error: any) {
      alert("Error: " + (error?.response?.data?.message || "Something went wrong"));
    } finally {
      setIsCreating(false);
      setPendingOrderId(null);
    }
  };

  const rejectStatus = async (orderId: number | null) => {
    if (!orderId) return;
    if (!rejectReason.trim()) {
      alert("Reason required");
      return;
    }
    try {
      await ordersService.UpdateStatus(orderId, 8, rejectReason);
      alert("Order Rejected");
      setShowRejectModal(false);
      setRejectReason("");
      fetchOrders();
      window.dispatchEvent(new Event('refresh-notifications'));
    } catch (error: any) {
      alert("Error: " + (error?.response?.data?.message || "Unknown error"));
    }
  };

  // const pendingApproval = async (orderId: number) => {
  //   try {
  //     await ordersService.UpdateStatus(orderId, 5);
  //     alert("Status Updated");
  //     setActiveOrderId(null);
  //     fetchOrders();
  //   } catch (error: any) {
  //     alert("Error: " + (error?.response?.data?.message || "Unknown error"));
  //   }
  // };

  // const needApproval = async (orderId: number) => {
  //   try {
  //     await ordersService.UpdateStatus(orderId, 4);
  //     alert("Status Updated");
  //     setActiveOrderId(null);
  //     fetchOrders();
  //   } catch (error: any) {
  //     alert("Error: " + (error?.response?.data?.message || "Unknown error"));
  //   }
  // };

  const filteredOrders = orders.filter((order) => {
    let matchDate = true;

    if (fromDate && toDate) {
      const orderDate = new Date(order.created_at);
      const from = new Date(`${fromDate}T00:00:00.000`);
      const to = new Date(`${toDate}T23:59:59.999`);


      matchDate = orderDate >= from && orderDate <= to;
    }

    return matchDate;
  });
  console.log("Filtered Orders:", filteredOrders);

  const downloadExcel = (order: Order) => {
    let excelData = [];
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
        "Total Ltrs": getOrderItemTotalLtrs(item).toFixed(2),
        "Total Amount": item.total,
      }));
    } else {
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
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(file, `Order_${order.order_number}.xlsx`);
  };

  const handleEditOrder = (order: Order) => {
    navigate("/Add_Sales", {
      state: {
        editOrderId: order.id,
        returnTo: "/Billing_orders",
        mode: "edit",
        allowPoNumber: true,
      },
    });
  };

  return (
    <div className="bo-page">

      {/* â”€â”€ LIST VIEW â”€â”€ */}
      {!showDetails && (
        <>
          <div className="bo-toolbar">
            <div className="bo-search-wrap">
              <div className="bo-date-wrap">
                <label className="bo-date-label">From</label>
                <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }} className="bo-date-input" />
              </div>
              <div className="bo-date-wrap">
                <label className="bo-date-label">To</label>
                <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }} className="bo-date-input" />
              </div>
            </div>
            <span className="bo-count">Total: {filteredOrders.length}</span>
          </div>

          <div className="bo-table-wrap">
            <table className="bo-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Card Code</th>
                  <th>Card Name</th>
                  <th>Created Date</th>
                  <th>Delivery Date</th>
                  {/* <th>Status</th> */}
                  <th>Details</th>
                  <th>Action</th>
                  <th>Edit Order</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((order) => (
                    <tr key={order.id}>
                      <td>{order.order_number}</td>
                      <td>{order.card_code}</td>
                      <td>{order.card_name}</td>
                      <td>{order.created_at ? new Date(order.created_at).toLocaleDateString("en-GB") : "-"}</td>
                      <td>{order.delivery_date}</td>
                      {/* <td>
                        <span className={`bo-badge bo-badge-${(order.status_display || "").toLowerCase().replace(/\s+/g, "-")}`}>
                          {order.status_display}
                        </span>
                      </td> */}
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
                      <td className="bo-action-cell">
                        <button
                          className="ao-btn-icon approve"
                          onClick={() => initiateApprove(order)}
                        >
                          <HiCheckCircle size={22} />
                        </button>
                        <button
                          className="ao-btn-icon reject"
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setShowRejectModal(true);
                          }}
                        >
                          <HiXCircle size={22} />
                        </button>
                        {/* <div 
  className="bo-more-wrap"
  onClick={(e) => e.stopPropagation()}
>
  <button 
    className="bo-btn-more"
    onClick={() => toggleMore(order.id)}
  >
    <HiEllipsisVertical size={18} />
  </button>

  {activeOrderId === order.id && (
    <div className="bo-dropdown">
      <button className="bo-dropdown-item" onClick={() => needApproval(order.id)}>
        Need Approval
      </button>
      <button className="bo-dropdown-item" onClick={() => pendingApproval(order.id)}>
        Pending Approval
      </button>
    </div>
  )}
</div> */}

                      </td>

                      <td>
                        <button
                          className="ao-btn-icon edit"
                          onClick={() => handleEditOrder(order)}
                          title="Edit Order"
                        >
                          <HiPencilSquare size={22} />
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="bo-empty">No orders found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredOrders.length > itemsPerPage && (
            <div className="bo-pagination">
              <button className="bo-pg-btn" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>Prev</button>
              <span className="bo-pg-info">{currentPage} / {Math.ceil(filteredOrders.length / itemsPerPage)}</span>
              <button className="bo-pg-btn" disabled={currentPage === Math.ceil(filteredOrders.length / itemsPerPage)} onClick={() => setCurrentPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* â”€â”€ DETAIL VIEW â”€â”€ */}
      {showDetails && orderDetails && (
        <div className="bo-detail">
          <div className="bo-d-nav">
            <button className="bo-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 13L5 8l5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back to Orders
            </button>
            <button className="bo-d-export" onClick={() => downloadExcel(orderDetails)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Export Excel
            </button>
          </div>

          <div className="bo-d-header-card">
            <div className="bo-d-info-grid">
              <div className="bo-d-info-field bo-d-info-span2">
                <span className="bo-d-hf-label">Order Number</span>
                <div className="bo-d-ordnum-row">
                  <span className="bo-d-ordnum">{orderDetails.order_number}</span>
                  {/* <span className={`bo-badge bo-badge-${(orderDetails.status_display || "").toLowerCase().replace(/\s+/g, "-")}`}>{orderDetails.status_display}</span> */}
                </div>
                <div className="ao-d-info-field">
                <span className="ao-d-hf-label">Party State</span>
                <span className="ao-d-hf-value">{orderDetails.party_state || "-"}</span>
              </div>
              </div>
               <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Created By</span>
                <span className="bo-d-hf-value">{orderDetails.created_by_name || "-"}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Created Date</span>
                <span className="bo-d-hf-value">{orderDetails.created_at ? new Date(orderDetails.created_at).toLocaleDateString("en-GB") : "-"}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Delivery Date</span>
                <span className="bo-d-hf-value">{orderDetails.delivery_date || "-"}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">PO Number</span>
                <span className="bo-d-hf-value">{orderDetails.po_number || "-"}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Party Name</span>
                <span className="bo-d-hf-value">{orderDetails.card_name}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Card Code</span>
                <span className="bo-d-hf-value">{orderDetails.card_code}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Bill To</span>
                <span className="bo-d-hf-value">{orderDetails.bill_to_address || "-"}</span>
              </div>
              <div className="bo-d-info-field">
                <span className="bo-d-hf-label">Ship To</span>
                <span className="bo-d-hf-value">{orderDetails.ship_to_address || "-"}</span>
              </div>
            </div>
          </div>

          <div className="bo-d-items">
            <div className="bo-d-items-head">
              <span className="bo-d-items-title">Items</span>
              <span className="bo-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="bo-d-items-scroll">
              <table className="bo-d-tbl">
                <thead><tr><th>#</th><th>Item Code</th>
                  <th style={{ minWidth: '250px' }}>Item Name</th>
                  <th>Category</th><th>Scheme</th><th>Scheme Qty</th>
                  <th>Qty</th><th>Pcs</th><th>Boxes</th><th>Ltrs</th>
                  {/* <th>Scheme Ltrs</th> */}
                  <th>Total Ltrs</th><th>Basic Price</th><th>Market Price</th><th>Tax %</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {selectedItems.length > 0 ? selectedItems.map((item, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                      <td><span className="bo-d-item-code">{item.item_code}</span></td>
                      <td style={{ fontWeight: 500, color: '#0f172a', minWidth: '250px' }}>{item.item_name}</td>
                      <td>{item.category}</td>
                      <td colSpan={2}>{getOrderItemSchemes(item).length > 0 ? <div className="order-scheme-stack" aria-label="Applied schemes">{getOrderItemSchemes(item).map((scheme, schemeIndex) => <div className="order-scheme-chip" key={`${item.item_code}-scheme-${schemeIndex}`}><span className="order-scheme-name">{scheme.name || "-"}</span><span className="order-scheme-qty">Qty {scheme.qty || 0}</span></div>)}</div> : <span className="order-scheme-empty">No scheme</span>}</td>
                      <td style={{ textAlign: 'center' }}>{item.qty}</td>
                      <td style={{ textAlign: 'center' }}>{item.pcs}</td>
                      <td style={{ textAlign: 'center' }}>{Number(item.boxes).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>{item.ltrs}</td>
                      {/* <td style={{textAlign:'center'}}>{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "-"}</td> */}
                      <td style={{ textAlign: 'center' }}>{getOrderItemTotalLtrs(item).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{Number(item.basic_price).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{Number(item.market_price).toFixed(2)}</td>
                      <td style={{ textAlign: 'center' }}>{Number(item.tax_rate).toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{Number(item.total).toFixed(2)}</td>
                    </tr>
                  )) : (<tr><td colSpan={14} className="bo-empty">No items found</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bo-d-summary">
            <div className="bo-d-sum-row"><span className="bo-d-sum-label">Total Ltrs</span><span className="bo-d-sum-val">{selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0).toFixed(2)}</span></div>
            <div className="bo-d-sum-row"><span className="bo-d-sum-label">Subtotal</span><span className="bo-d-sum-val">{selectedItems.reduce((s, i) => s + Number(i.total || 0), 0).toFixed(2)}</span></div>
            <div className="bo-d-sum-row"><span className="bo-d-sum-label">Tax</span><span className="bo-d-sum-val">{selectedItems.reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0) / 100), 0).toFixed(2)}</span></div>
            <div className="bo-d-sum-row bo-d-sum-grand"><span className="bo-d-sum-label">Grand Total</span><span className="bo-d-sum-val">{(selectedItems.reduce((s, i) => s + Number(i.total || 0), 0) + selectedItems.reduce((s, i) => s + (Number(i.total || 0) * Number(i.tax_rate || 0) / 100), 0)).toFixed(2)}</span></div>
          </div>
        </div>
      )}

      {/* â”€â”€ CONFIRM MODAL â”€â”€ */}
      {showConfirmModal && (
        <div className="bo-modal-overlay">
          <div className="bo-modal">
            <div className="bo-modal-title">Create Sales Quotation</div>
            <p className="bo-modal-msg">Do you want to create a Sales Quotation for this order?</p>
            <div className="bo-modal-actions">
              <button className="bo-btn-approve" onClick={confirmApprove}>Confirm</button>
              <button className="bo-btn-cancel" onClick={() => { setShowConfirmModal(false); setPendingOrderId(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ LOADING OVERLAY â”€â”€ */}
      {isCreating && (
        <div className="bo-modal-overlay">
          <div className="bo-modal bo-modal-loading">
            <div className="bo-spinner" />
            <p className="bo-loading-text">Creating Sales Quotation...</p>
          </div>
        </div>
      )}

      {/* â”€â”€ SUCCESS MODAL â”€â”€ */}
      {showSuccess && quotationResult && (
        <div className="bo-modal-overlay">
          <div className="bo-modal bo-modal-success">
            <div className="bo-modal-title">Sales Quotation Created!</div>
            <div className="bo-success-info">
              <div className="bo-success-row">
                <span className="bo-success-label">Quotation No.</span>
                <span className="bo-success-value">{quotationResult.number}</span>
              </div>
              <div className="bo-success-row">
                <span className="bo-success-label">Order ID</span>
                <span className="bo-success-value">{quotationResult.order_id}</span>
              </div>
            </div>
            <button className="bo-btn-approve" onClick={() => { setShowSuccess(false); setQuotationResult(null); }}>OK</button>
          </div>
        </div>
      )}

      {/* â”€â”€ REJECT MODAL â”€â”€ */}
      {showRejectModal && (
        <div className="bo-modal-overlay">
          <div className="bo-modal">
            <div className="bo-modal-title">Rejection Reason</div>
            <textarea
              className="bo-modal-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Type reason..."
              rows={4}
            />
            <div className="bo-modal-actions">
              <button
                className="bo-btn-approve"
                onClick={() => rejectStatus(selectedOrderId)}
              >
                Submit
              </button>
              <button
                className="bo-btn-cancel"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



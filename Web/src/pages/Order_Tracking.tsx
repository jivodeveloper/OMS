import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ordersService } from "../services/ordersService";
import type { Order, OrderLog } from "../services/ordersService";
import { loadCurrentUserOrders } from "../utils/orderHistory";
import "../styles/Order_Tracking.css";

export default function Order_Tracking() {
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [tracker, setTracker] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  
  useEffect(() => {
    void fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await loadCurrentUserOrders();
      setOrders(data || []);
    } catch (error) {
      console.log("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location.state?.openOrderId && orders.length > 0) {
      const targetOrder = orders.find(o => o.id === location.state.openOrderId);
      if (targetOrder) {
        void handleTrack(targetOrder);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state?.openOrderId, orders, location.pathname, navigate]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(orders.map((o) => o.status_display).filter(Boolean));
    return Array.from(statuses).sort() as string[];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (statusFilter) {
          return order.status_display === statusFilter;
        }
        return true;
      })
      .sort((a, b) => {
        const first = new Date(b.created_at || "").getTime();
        const second = new Date(a.created_at || "").getTime();

        if (Number.isNaN(first) || Number.isNaN(second)) {
          return String(b.order_number || "").localeCompare(
            String(a.order_number || "")
          );
        }

        return first - second;
      });
  }, [orders, statusFilter]);

  const orderedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      const first = new Date(a.created_at || "").getTime();
      const second = new Date(b.created_at || "").getTime();

      if (Number.isNaN(first) && Number.isNaN(second)) {
        return a.id - b.id;
      }

      if (Number.isNaN(first)) return 1;
      if (Number.isNaN(second)) return -1;

      return first - second;
    });
  }, [logs]);

  const latestStageLogs = useMemo(() => {
    const stageLogs = new Map<string, OrderLog>();
    let lastStageKey: string | null = null;

    const getStageKey = (statusName: string) => {
      const normalizedStatus = String(statusName || "").toLowerCase().trim();

      if (!normalizedStatus) return "unknown";

      const isGenericOutcome =
        normalizedStatus === "approved" ||
        normalizedStatus === "rejected" ||
        normalizedStatus === "accepted" ||
        normalizedStatus === "cancelled" ||
        normalizedStatus === "canceled" ||
        normalizedStatus === "completed" ||
        normalizedStatus === "complete";

      if (isGenericOutcome && lastStageKey) {
        return lastStageKey;
      }

      if (normalizedStatus.includes("auditor")) {
        return "auditor";
      }

      if (normalizedStatus.includes("billing")) {
        return "billing";
      }

      if (normalizedStatus.includes("approval") || normalizedStatus.includes("approve")) {
        return "approval";
      }

      if (
        normalizedStatus.includes("reject") ||
        normalizedStatus.includes("cancel")
      ) {
        return "outcome";
      }

      if (
        normalizedStatus.includes("complete") ||
        normalizedStatus.includes("dispatch")
      ) {
        return "fulfillment";
      }

      return normalizedStatus;
    };

    orderedLogs.forEach((log) => {
      const stageKey = getStageKey(log.status_name);
      const normalizedStatus = String(log.status_name || "").toLowerCase().trim();

      if (
        normalizedStatus !== "approved" &&
        normalizedStatus !== "rejected" &&
        normalizedStatus !== "accepted" &&
        normalizedStatus !== "cancelled" &&
        normalizedStatus !== "canceled" &&
        normalizedStatus !== "completed" &&
        normalizedStatus !== "complete"
      ) {
        lastStageKey = stageKey;
      }

      stageLogs.set(stageKey, log);
    });

    return Array.from(stageLogs.values()).sort((a, b) => {
      const first = new Date(a.created_at || "").getTime();
      const second = new Date(b.created_at || "").getTime();

      if (Number.isNaN(first) && Number.isNaN(second)) {
        return a.id - b.id;
      }

      if (Number.isNaN(first)) return 1;
      if (Number.isNaN(second)) return -1;

      return first - second;
    });
  }, [orderedLogs]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-IN");
  };

  const getLogTone = (status: string, performedBy: string | null) => {
    const normalized = String(status || "").toLowerCase();
    const normalizedPerformer = String(performedBy || "").toLowerCase();

    const isPendingPerformer =
      !normalizedPerformer ||
      normalizedPerformer.includes("pending") ||
      normalizedPerformer.includes("system");

    if (normalized.includes("reject") || normalized.includes("cancel")) {
      return "rejected";
    }

    if (isPendingPerformer) {
      return "pending";
    }

    if (
      normalized.includes("approve") ||
      normalized.includes("accept") ||
      normalized.includes("bill") ||
      normalized.includes("complete")
    ) {
      return "approved";
    }

    return "progress";
  };

  const handleTrack = async (order: Order) => {
    setSelectedOrder(order);
    setTracker(true);
    setLogs([]);
    setLogsLoading(true);

    try {
      const response = await ordersService.getOrderLogs(order.id);
      setLogs(Array.isArray(response) ? response : []);
    } catch (error) {
      console.log("Error fetching order logs:", error);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleBack = () => {
    setTracker(false);
    setSelectedOrder(null);
    setLogs([]);
  };

  const handleEditOrder = (order: Order) => {
    navigate("/Add_Sales", {
      state: {
        editOrderId: order.id,
        returnTo: "/Order_Tracking",
        mode: "edit",
      },
    });
  };

  return (
    <div className="tracker-page">
      <div className="tracker-head">
        <h4>Order Tracker</h4>
      </div>

      {!tracker && (
        <div>
          <div className="tracker-list-head">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                height: 'var(--input-h, 40px)',
                padding: '0 12px',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#0f172a',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 'var(--font-ui, 13px)',
                outline: 'none',
                minWidth: '180px'
              }}
            >
              <option value="">All Orders</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            {!loading && (
              <span className="tracker-count">Total: {filteredOrders.length}</span>
            )}
          </div>

          {loading ? (
            <div className="vo-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>Loading orders...</div>
          ) : filteredOrders.length > 0 ? (
            <div className="tracker-table-wrap">
              <table className="vo-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Card Code</th>
                    <th>Card Name</th>
                    <th>Created Date</th>
                    <th>Delivery Date</th>
                    <th>Status</th>
                    <th>Tracker</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.order_number}</td>
                        <td>{order.card_code}</td>
                        <td>{order.card_name}</td>
                        <td>{order.created_at ? new Date(order.created_at).toLocaleDateString("en-GB") : "—"}</td>
                        <td>{order.delivery_date}</td>
                        <td>
                          <span
                            className={`vo-badge vo-badge-${(
                              order.status_display || ""
                            )
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {order.status_display}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              className="tracker-btn"
                              onClick={() => void handleTrack(order)}
                            >
                              Track
                            </button>
                            {String(order.status_display || "").toLowerCase().includes("reject") && (
                              <button
                                type="button"
                                className="tracker-btn"
                                style={{ backgroundColor: "#ef4444" }}
                                onClick={() => handleEditOrder(order)}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vo-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>No orders found</div>
          )}
        </div>
      )}

      {tracker && selectedOrder && (
        <div className="tracker-detail-card">
          <div className="tracker-detail-top">
            <button
              type="button"
              className="tracker-back-btn"
              onClick={handleBack}
            >
              Back
            </button>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {String(selectedOrder.status_display || "").toLowerCase().includes("reject") && (
                <button
                  type="button"
                  className="tracker-btn"
                  style={{ backgroundColor: "#ef4444" }}
                  onClick={() => handleEditOrder(selectedOrder)}
                >
                  Edit Order
                </button>
              )}
              <span
                className={`vo-badge vo-badge-${(
                  selectedOrder.status_display || ""
                )
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
              >
                {selectedOrder.status_display}
              </span>
            </div>
          </div>

          <div className="tracker-summary-grid">
            <div>
              <p className="tracker-label">Order ID</p>
              <h5>{selectedOrder.order_number}</h5>
            </div>
            <div>
              <p className="tracker-label">Card Code</p>
              <p>{selectedOrder.card_code}</p>
            </div>
            <div>
              <p className="tracker-label">Card Name</p>
              <p>{selectedOrder.card_name}</p>
            </div>
            <div>
              <p className="tracker-label">Created Date</p>
              <p>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString("en-GB") : "-"}</p>
            </div>
            <div>
              <p className="tracker-label">Delivery Date</p>
              <p>{selectedOrder.delivery_date || "-"}</p>
            </div>
            <div>
              <p className="tracker-label">PO Number</p>
              <p>{selectedOrder.po_number || "-"}</p>
            </div>
          </div>

          <div className="tracker-timeline">
            <h5>Order Log Timeline</h5>

            {logsLoading ? (
              <p className="vo-empty">Loading order logs...</p>
            ) : latestStageLogs.length === 0 ? (
              <p className="vo-empty">No tracking logs found for this order.</p>
            ) : (
              latestStageLogs.map((log, index) => {
                const tone = getLogTone(log.status_name, log.performed_by_name);

                return (
                  <div key={log.id} className="tracker-timeline-row">
                    <div className="tracker-timeline-left">
                      <div className={`tracker-dot ${tone}`}>
                        {tone === "approved"
                          ? "✓"
                          : tone === "rejected"
                            ? "✕"
                            : "•"}
                      </div>
                      {index !== latestStageLogs.length - 1 ? (
                        <div className={`tracker-line ${tone}`} />
                      ) : null}
                    </div>

                    <div className={`tracker-log-card ${tone}`}>
                      <div className="tracker-log-head">
                        <h6>{log.status_name}</h6>
                        <span>{formatDateTime(log.created_at)}</span>
                      </div>

                      <p className="tracker-log-meta">
                        Performed By: {log.performed_by_name || "Pending"}
                      </p>

                      {log.remarks ? (
                        <p className="tracker-log-remarks">Remark: {log.remarks}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

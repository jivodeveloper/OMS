import { useState, useEffect, useRef  } from "react";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import type { Order, OrderItem } from "../services/ordersService";
import { loadManagerOrders } from "../utils/orderHistory";
import { getOrderItemSchemeNames, getOrderItemSchemes, getOrderItemSchemeQtyText, getOrderItemTotalLtrs, ordersService } from "../services/ordersService";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import "../styles/Report.css";
import { sapService, type Product, type Party } from "../services/sapService";
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

export default function Sales_Report() {
  const [varietyList, setVarietyList] = useState<Product[]>([]);
  const [selectedVariety, setSelectedVariety] = useState<string>("");
  const [selectedParty, setSelectedParty] = useState<string>("");
  const [partySearch, setPartySearch] = useState<string>("");
  const [partyDropdownOpen, setPartyDropdownOpen] = useState(false);
  const [varietySearch, setVarietySearch] = useState<string>("");
  const [varietyDropdownOpen, setVarietyDropdownOpen] = useState(false);
  const [mainGroup, setMainGroup] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [mgDropdownOpen, setMgDropdownOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);
    // const [selectedUser] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);
  const [orderDetails, setOrderDetails] = useState<Order | null>(null);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(lastDay);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [users, setUsers] = useState<User[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const groupRef = useRef<HTMLDivElement>(null);
  const partyDropdownRef = useRef<HTMLDivElement>(null);
  const varietyRef = useRef<HTMLDivElement>(null);

  const fetchOrders = async () => {
    setIsOrdersLoading(true);
    try {
      const data = await loadManagerOrders();
      setOrders(data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setIsOrdersLoading(false);
    }
  };

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

  const fetchVariety = async () => {
    try {
      const data = await sapService.getProducts();
      setVarietyList(data || []);
    } catch (error) {
      console.error("Failed to fetch variety:", error);
    }
  };

  const fetchmainGroup = async () => {
    try {
      const data = await userService.getMainGroup();
      setMainGroup(data);
    } catch (error) {
      console.error("Failed to fetch main group:", error);
    }
  };

  const fetchParties = async () => {
    try {
      const data = await sapService.getParties();
      console.log(data)
      setParties(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch parties:", error);
    }
  };

  const fetchUsers = async () => {
  try {
    const data = await userService.getUsers();
    setUsers(data.data);
  } catch (e) {
    console.error(e);
  }
};

  useEffect(() => {
    fetchmainGroup();
    fetchVariety();
    fetchParties();
    fetchUsers();
    fetchOrders();
  }, []);

   useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      groupRef.current &&
      !groupRef.current.contains(event.target as Node)
    ) {
      setMgDropdownOpen(false);
    }

    if (
      partyDropdownRef.current &&
      !partyDropdownRef.current.contains(event.target as Node)
    ) {
      setPartyDropdownOpen(false);
    }

      if (
        varietyRef.current &&
        !varietyRef.current.contains(event.target as Node)
      ) {
        setVarietyDropdownOpen(false);
      }
  };

  document.addEventListener("mousedown", handleClickOutside);

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);

  const filteredUsers = users.filter((u) => {
    const userGroupIds = (u.main_groups || []).map((g: any) => g.id);

    const matchGroup =
      selectedGroups.length === 0 ||
      selectedGroups.some((id) => userGroupIds.includes(id));

    return matchGroup;
  });

  const allowedUserIds = filteredUsers.map((u) => u.id);
  const normalize = (value?: string | null) =>
    (value || "").toLowerCase().trim();
  const selectedGroupNames = mainGroup
    .filter((group) => selectedGroups.includes(group.id))
    .map((group) => normalize(group.name));

  const filteredPartyOptions = parties.filter((party) => {
    const partyGroup = normalize(party.main_group);

    const matchGroup =
      selectedGroupNames.length === 0 ||
      selectedGroupNames.some(
        (groupName) =>
          partyGroup === groupName ||
          partyGroup.includes(groupName) ||
          groupName.includes(partyGroup),
      );

    return matchGroup;
  });

  const partyDropdownOptions = Array.from(
    new Map(
      filteredPartyOptions
        .filter((party) => party.card_name?.trim() && party.card_code?.trim())
        .map((party) => [party.card_code.trim(), party]),
    ).values(),
  ).sort((a, b) => a.card_name.localeCompare(b.card_name));

  const filteredPartyDropdownOptions = partyDropdownOptions.filter((party) => {
    const search = normalize(partySearch);
    if (!search) return true;

    return (
      normalize(party.card_name).includes(search) ||
      normalize(party.card_code).includes(search)
    );
  });
  const selectedPartyDetails =
    partyDropdownOptions.find((party) => party.card_code === selectedParty) || null;

  useEffect(() => {
    if (
      selectedParty &&
      !partyDropdownOptions.some((party) => party.card_code === selectedParty)
    ) {
      setSelectedParty("");
      setPartySearch("");
    }
  }, [partyDropdownOptions, selectedParty]);

  const toggleGroup = (id: number) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const toggleAllGroups = () => {
    const allSelected = selectedGroups.length === mainGroup.length;
    setSelectedGroups(allSelected ? [] : mainGroup.map((g) => g.id));
  };

    // const selectedUserObj = filteredUsers.find((u) => u.name === selectedUser);
    // const selectedUsername = selectedUserObj?.username || selectedUserObj?.name || "";

  const filteredOrders = orders.filter((order) => {
    const orderDate = new Date(order.created_at);

    const matchDate =
      (!fromDate || !toDate) ||
      (orderDate >= new Date(`${fromDate}T00:00:00.000`) &&
        orderDate <= new Date(`${toDate}T23:59:59.999`));

    const matchVariety =
      !selectedVariety ||
      order.items?.some((item) => item.variety === selectedVariety);

    const matchUser =
      allowedUserIds.length === 0 ||
      allowedUserIds.includes(Number(order.created_by));

    const matchParty =
      !selectedParty ||
      normalize(order.card_code) === normalize(selectedParty) ||
      normalize(order.card_name) === normalize(selectedParty);

    return matchDate && matchVariety && matchUser && matchParty;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedGroups,
    selectedParty,
    selectedVariety,
    fromDate,
    toDate,
    orders,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // const viewOrderDetails = (order: Order) => {
  //   setOrderDetails(order);
  //   setSelectedItems(order.items || []);
  //   setShowDetails(true);
  // };

  const downloadExcel = (order: Order) => {
    const excelData: Record<string, unknown>[] = [];
    if (order.items && order.items.length > 0) {
      order.items.forEach((item: OrderItem) => {
        excelData.push({
          "Order Number": order.order_number,
          "Card Code": order.card_code,
          "Card Name": order.card_name,
          "Bill To": order.bill_to_address,
          "Ship To": order.ship_to_address,
          "Delivery Date": order.delivery_date,
          Status: order.status_display,
          "Item Code": item.item_code,
          "Item Name": item.item_name,
          Scheme: getOrderItemSchemeNames(item),
          "Scheme Qty": getOrderItemSchemeQtyText(item),
          // "Scheme Ltrs": (item as any).scheme_ltrs || "",
          Qty: item.qty,
          Boxes: item.boxes,
          Liters: item.ltrs,
          "Total Ltrs": getOrderItemTotalLtrs(item).toFixed(2),
          "Tax Rate": item.tax_rate,
          "Total Amount": item.total,
          "Grand Total": (
            Number(item.total || 0) +
            (Number(item.total || 0) * Number(item.tax_rate || 0)) / 100
          ).toFixed(2),
        });
      });
    } else {
      excelData.push({
        "Order Number": order.order_number,
        "Card Code": order.card_code,
        "Card Name": order.card_name,
        "Delivery Date": order.delivery_date,
        Status: order.status_display,
      });
    }
    const totalAmount = excelData.reduce(
      (s, r) => s + Number(r["Total Amount"] || 0),
      0,
    );
    const grandTotal = excelData.reduce(
      (s, r) => s + Number(r["Grand Total"] || 0),
      0,
    );
    excelData.push({
      "Order Number": "",
      "Card Code": "",
      "Card Name": "",
      "Bill To": "",
      "Ship To": "",
      "Delivery Date": "",
      Status: "",
      "Item Code": "",
      "Item Name": "",
      Scheme: "",
      "Scheme Qty": "",
      // "Scheme Ltrs": "",
      Qty: "",
      Boxes: "",
      Liters: "",
      "Total Ltrs": "",
      "Tax Rate": "TOTAL",
      "Total Amount": totalAmount.toFixed(2),
      "Grand Total": grandTotal.toFixed(2),
    });
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

  const downloadAllExcel = () => {
    if (filteredOrders.length === 0) return;
    const excelData: Record<string, unknown>[] = [];
    filteredOrders.forEach((order) => {
      if (order.items && order.items.length > 0) {
        order.items.forEach((item: OrderItem) => {
          excelData.push({
            "Order Number": order.order_number,
            "Card Code": order.card_code,
            "Card Name": order.card_name,
            "Bill To": order.bill_to_address,
            "Ship To": order.ship_to_address,
            "Delivery Date": order.delivery_date,
            Status: order.status_display,
            "Item Code": item.item_code,
            "Item Name": item.item_name,
            Scheme: getOrderItemSchemeNames(item),
            "Scheme Qty": getOrderItemSchemeQtyText(item),
            // "Scheme Ltrs": (item as any).scheme_ltrs || "",
            Qty: item.qty,
            Boxes: item.boxes,
            Liters: item.ltrs,
            "Total Ltrs": getOrderItemTotalLtrs(item).toFixed(2),
            "Tax Rate": item.tax_rate,
            "Total Amount": item.total,
            "Grand Total": (
              Number(item.total || 0) +
              (Number(item.total || 0) * Number(item.tax_rate || 0)) / 100
            ).toFixed(2),
          });
        });
      } else {
        excelData.push({
          "Order Number": order.order_number,
          "Card Code": order.card_code,
          "Card Name": order.card_name,
          "Delivery Date": order.delivery_date,
          Status: order.status_display,
          "Bill To": order.bill_to_address,
          "Ship To": order.ship_to_address,
        });
      }
    });
    const allTotalAmount = excelData.reduce(
      (s, r) => s + Number(r["Total Amount"] || 0),
      0,
    );
    const allGrandTotal = excelData.reduce(
      (s, r) => s + Number(r["Grand Total"] || 0),
      0,
    );
    excelData.push({
      "Order Number": "",
      "Card Code": "",
      "Card Name": "",
      "Bill To": "",
      "Ship To": "",
      "Delivery Date": "",
      Status: "",
      "Item Code": "",
      "Item Name": "",
      Scheme: "",
      "Scheme Qty": "",
      // "Scheme Ltrs": "",
      Qty: "",
      Boxes: "",
      Liters: "",
      "Total Ltrs": "",
      "Tax Rate": "TOTAL",
      "Total Amount": allTotalAmount.toFixed(2),
      "Grand Total": allGrandTotal.toFixed(2),
    });
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "All Orders");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const file = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(file, `Sales_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const uniqueVarieties = [
    ...new Set(
      varietyList
        .map((v) => v.variety)
        .filter((variety): variety is string => Boolean(variety)),
    ),
  ];

  const filteredVarieties = uniqueVarieties.filter((v) =>
    v.toLowerCase().includes(varietySearch.toLowerCase())
  );

  return (
    <div className="dr-page">
      {/* â”€â”€ LIST VIEW â”€â”€ */}
      {!showDetails && (
        <>
          <div className="dr-header">
            <h1 className="dr-title" style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Sales Report</h1>
          </div>

          <div className="dr-filter-card">
            <div className="dr-filter-row">
              {/* Main Group */}
              <div className="dr-field">
                <label className="dr-label">Main Group</label>
                <div className="dr-dropdown" ref={groupRef}>
                  <div
                    className="dr-dropdown-trigger"
                    onClick={() => setMgDropdownOpen((v) => !v)}
                  >
                    {selectedGroups.length === 1
                      ? mainGroup.find((g) => g.id === selectedGroups[0])
                          ?.name || "1 selected"
                      : selectedGroups.length > 1
                        ? `${selectedGroups.length} selected`
                        : "Select Main Group"}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  {mgDropdownOpen && (
                    <div className="dr-dropdown-menu">
                      <label className="dr-dropdown-item dr-select-all">
                        <input
                          type="checkbox"
                          checked={
                            mainGroup.length > 0 &&
                            selectedGroups.length === mainGroup.length
                          }
                          onChange={toggleAllGroups}
                        />
                        Select All
                      </label>
                      {mainGroup.map((g) => (
                        <label key={g.id} className="dr-dropdown-item">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Parties */}
              <div className="dr-field">
                <label className="dr-label">Party</label>
                <div
                  className={`sl-party-dropdown${partyDropdownOpen ? " open" : ""}`}
                  ref={partyDropdownRef}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    onClick={() => setPartyDropdownOpen((prev) => !prev)}
                  >
                    <span className="sl-party-trigger-text">
                      {selectedPartyDetails ? (
                            <>
                              <span className="sl-party-trigger-label">
                                {selectedPartyDetails.card_name}
                              </span>
                              <span className="sl-party-trigger-code">
                                {selectedPartyDetails.card_code}
                              </span>
                            </>
                          ) : (
                            "--select--"
                          )}
                    </span>
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
                        {filteredPartyDropdownOptions.length > 0 ? (
                          filteredPartyDropdownOptions.map((party) => (
                            <button
                              type="button"
                              key={party.card_code}
                              className="sl-party-option"
                              onClick={() => {
                                setSelectedParty(party.card_code);
                                setPartySearch("");
                                setPartyDropdownOpen(false);
                              }}
                            >
                              <span className="sl-party-option-label">
                                {party.card_name}
                              </span>
                              <span className="sl-party-option-code">
                                {party.card_code}
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



              {/* Variety */}
              <div className="dr-field">
                <label className="dr-label">Variety</label>
                <div
                  className={`sl-party-dropdown${varietyDropdownOpen ? " open" : ""}`}
                  ref={varietyRef}
                >
                  <button
                    type="button"
                    className="sl-party-trigger"
                    onClick={() => setVarietyDropdownOpen((prev) => !prev)}
                  >
                    <span className="sl-party-trigger-text">
                      {selectedVariety || "-- Select Variety --"}
                    </span>
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
                  {varietyDropdownOpen && (
                    <div className="sl-party-menu">
                      <div className="sl-party-search-wrap">
                        <input
                          type="text"
                          className="sl-party-search"
                          placeholder="Search variety..."
                          value={varietySearch}
                          onChange={(e) => setVarietySearch(e.target.value)}
                        />
                      </div>
                      <div className="sl-party-options">
                        <button
                          type="button"
                          className="sl-party-option"
                          onClick={() => {
                            setSelectedVariety("");
                            setVarietySearch("");
                            setVarietyDropdownOpen(false);
                          }}
                        >
                          
                        </button>
                        {filteredVarieties.length > 0 ? (
                          filteredVarieties.map((variety, index) => (
                            <button
                              type="button"
                              key={index}
                              className="sl-party-option"
                              onClick={() => {
                                setSelectedVariety(variety);
                                setVarietySearch("");
                                setVarietyDropdownOpen(false);
                              }}
                            >
                              <span className="sl-party-option-label">{variety}</span>
                            </button>
                          ))
                        ) : (
                          <div className="sl-party-empty">No varieties found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* From */}
              <div className="dr-field">
                <label className="dr-label">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="dr-date-input"
                />
              </div>

              {/* To */}
              <div className="dr-field">
                <label className="dr-label">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="dr-date-input"
                />
              </div>
            </div>
          </div>

          {(selectedGroups.length > 0 || selectedParty || selectedVariety) && (
            <div className="dr-report-card">
              <div className="dr-report-header">
                <h2 className="dr-report-title">
                  Orders
                </h2>
                <div className="dr-report-stats">
                  <span className="dr-stat">
                    Total Orders: <strong>{filteredOrders.length}</strong>
                  </span>
                  <span className="dr-stat">
                    Total Amount:{" "}
                    <strong>
                      {filteredOrders
                        .reduce(
                          (sum, o) => sum + Number(o.total_amount || 0),
                          0,
                        )
                        .toFixed(2)}
                    </strong>
                  </span>
                  <button
                    className="dr-d-export"
                    onClick={downloadAllExcel}
                    disabled={filteredOrders.length === 0}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Download All
                  </button>
                </div>
              </div>

              {isOrdersLoading ? (
                <div className="dr-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>Loading orders...</div>
              ) : filteredOrders.length > 0 ? (
                <div className="dr-table-wrap">
                  <table className="dr-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Order Number</th>
                        <th>Card Code</th>
                        <th>Card Name</th>
                        <th>Delivery Date</th>
                        <th>Status</th>
                        <th>Action</th>
                        <th>Generate Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((order, i) => (
                        <tr key={order.id}>
                          <td className="dr-muted">
                            {(currentPage - 1) * itemsPerPage + i + 1}
                          </td>
                          <td className="dr-bold">{order.order_number}</td>
                          <td>{order.card_code}</td>
                          <td>{order.card_name}</td>
                          <td>{order.delivery_date}</td>
                          <td>
                            <span
                              className={`dr-badge dr-badge-${(order.status_display || "").toLowerCase().replace(/\s+/g, "-")}`}
                            >
                              {order.status_display}
                            </span>
                          </td>
                          <td>
                            <button className="ao-btn-icon view" onClick={() => fetchOrderDetails(order.id)}> <HiEye size={22} /></button>
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
                <div className="dr-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>No orders found</div>
              )}
              {filteredOrders.length > itemsPerPage && (
                <div className="dr-pagination">
                  <button
                    className="dr-pg-btn"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => page - 1)}
                  >
                    Prev
                  </button>
                  <span className="dr-pg-info">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className="dr-pg-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((page) => page + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* â”€â”€ DETAIL VIEW â”€â”€ */}
      {showDetails && orderDetails && (
        <div className="dr-detail">
          <div className="dr-d-nav">
            <button className="dr-d-back" onClick={() => setShowDetails(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 13L5 8l5-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to Report
            </button>
            <button
              className="dr-d-export"
              onClick={() => downloadExcel(orderDetails)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 1v8m0 0L4 6.5M7 9l3-2.5M2.5 12h9"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export Excel
            </button>
          </div>

          <div className="dr-d-header-card">
            <div className="dr-d-info-grid">
              <div className="dr-d-info-field dr-d-info-span2">
                <span className="dr-d-hf-label">Order Number</span>
                <div className="dr-d-ordnum-row">
                  <span className="dr-d-ordnum">
                    {orderDetails.order_number}
                  </span>
                  <span
                    className={`dr-badge dr-badge-${(orderDetails.status_display || "").toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {orderDetails.status_display}
                  </span>
                </div>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Delivery Date</span>
                <span className="dr-d-hf-value">
                  {orderDetails.delivery_date || "â€”"}
                </span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">PO Number</span>
                <span className="dr-d-hf-value">{orderDetails.po_number || "â€”"}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Party Name</span>
                <span className="dr-d-hf-value">{orderDetails.card_name}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Card Code</span>
                <span className="dr-d-hf-value">{orderDetails.card_code}</span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Bill To</span>
                <span className="dr-d-hf-value">
                  {orderDetails.bill_to_address || "â€”"}
                </span>
              </div>
              <div className="dr-d-info-field">
                <span className="dr-d-hf-label">Ship To</span>
                <span className="dr-d-hf-value">
                  {orderDetails.ship_to_address || "â€”"}
                </span>
              </div>
            </div>
          </div>

          <div className="dr-d-items">
            <div className="dr-d-items-head">
              <span className="dr-d-items-title">Items</span>
              <span className="dr-d-items-count">{selectedItems.length}</span>
            </div>
            <div className="dr-d-items-scroll">
              <table className="dr-d-tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Code</th>
                    <th style={{ minWidth: '250px' }}>Item Name</th>
                    <th>Category</th>
                    <th>Variety</th>
                    <th>Scheme</th>
                    <th>Scheme Qty</th>
                    <th>Qty</th>
                    <th>Pcs</th>
                    <th>Boxes</th>
                    <th>Ltrs</th>
                    {/* <th>Scheme Ltrs</th> */}
                    <th>Total Ltrs</th>
                    <th>Basic Price</th>
                    <th>Market Price</th>
                    <th>Tax %</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.length > 0 ? (
                    selectedItems.map((item, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: "center", color: "#94a3b8" }}>
                          {i + 1}
                        </td>
                        <td>
                          <span className="dr-d-item-code">
                            {item.item_code}
                          </span>
                        </td>
                    <td style={{ fontWeight: 500, color: "#0f172a", minWidth: '250px' }}>
                          {item.item_name}
                        </td>
                        <td>{item.category}</td>
                        <td>{item.variety}</td>
                        <td colSpan={2}>{getOrderItemSchemes(item).length > 0 ? <div className="order-scheme-stack" aria-label="Applied schemes">{getOrderItemSchemes(item).map((scheme, schemeIndex) => <div className="order-scheme-chip" key={`${item.item_code}-scheme-${schemeIndex}`}><span className="order-scheme-name">{scheme.name || "-"}</span><span className="order-scheme-qty">Qty {scheme.qty || 0}</span></div>)}</div> : <span className="order-scheme-empty">No scheme</span>}</td>
                        <td style={{ textAlign: "center" }}>{item.qty}</td>
                        <td style={{ textAlign: "center" }}>{item.pcs}</td>
                        <td style={{ textAlign: "center" }}>
                          {Number(item.boxes).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>{item.ltrs}</td>
                          {/* <td style={{ textAlign: "center" }}>{item.scheme_name ? ((item as any).scheme_ltrs || 0) : "â€”"}</td> */}
                        <td style={{ textAlign: "center" }}>{getOrderItemTotalLtrs(item).toFixed(2)}</td>
                        <td style={{ textAlign: "right" }}>
                          {Number(item.basic_price).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {Number(item.market_price).toFixed(2)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {Number(item.tax_rate).toFixed(2)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 600,
                            color: "#0f172a",
                          }}
                        >
                          {Number(item.total).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={15} className="dr-empty">
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dr-d-summary">
            <div className="dr-d-sum-row">
              <span className="dr-d-sum-label">Total Ltrs</span>
              <span className="dr-d-sum-val">{selectedItems.reduce((s, i) => s + getOrderItemTotalLtrs(i), 0).toFixed(2)}</span>
            </div>
            <div className="dr-d-sum-row">
              <span className="dr-d-sum-label">Subtotal</span>
              <span className="dr-d-sum-val">
                {selectedItems
                  .reduce((s, i) => s + Number(i.total || 0), 0)
                  .toFixed(2)}
              </span>
            </div>
            <div className="dr-d-sum-row">
              <span className="dr-d-sum-label">Tax</span>
              <span className="dr-d-sum-val">
                {selectedItems
                  .reduce(
                    (s, i) =>
                      s +
                      (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100,
                    0,
                  )
                  .toFixed(2)}
              </span>
            </div>
            <div className="dr-d-sum-row dr-d-sum-grand">
              <span className="dr-d-sum-label">Grand Total</span>
              <span className="dr-d-sum-val">
                {(
                  selectedItems.reduce((s, i) => s + Number(i.total || 0), 0) +
                  selectedItems.reduce(
                    (s, i) =>
                      s +
                      (Number(i.total || 0) * Number(i.tax_rate || 0)) / 100,
                    0,
                  )
                ).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




import { useEffect, useRef, useState } from "react";
import { userService } from "../services/userService";
import {
  HiOutlinePaperAirplane,
  HiOutlinePlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import { FaRegSave } from "react-icons/fa";
import "../styles/NewInvoice.css";
import { sapService } from "../services/sapService";

const tabs = [
  "Contents",
  "Logistics",
  "Accounting",
  "Tag",
  "Electronic Documents",
  "Customer Details",
];

const emptyRow = {
  type: "Item",
  item_code: "",
  item_name: "",
  description: "",
  qty: 1,
  unit_price: 0,
  disc: 0,
  tax_rate: 5,
  whse: "PB_SP",
  variety: "",
};

export default function NewInvoice() {
  const today = new Date().toISOString().split("T")[0];

  const [states, setStates] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([{ ...emptyRow }]);

  const [selectedTab, setSelectedTab] = useState("Contents");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [activeRow, setActiveRow] = useState(0);

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [selectedState, setSelectedState] = useState("");
  const [selectedChain, setSelectedChain] = useState("All");
  const [customerSearch, setCustomerSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [showAllStates, setShowAllStates] = useState(false);
  const [showAllChains, setShowAllChains] = useState(false);
  const [showAllParties, setShowAllParties] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [placeSupplySearch, setPlaceSupplySearch] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [selectedPlaceSupply, setSelectedPlaceSupply] = useState<any>(null);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [showPlaceSupplyDrop, setShowPlaceSupplyDrop] = useState(false);
  const [showBranchDrop, setShowBranchDrop] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [selectedVariety, setSelectedVariety] = useState("All");
  const [selectedPack, setSelectedPack] = useState("All");
  const [selectedFinderItem, setSelectedFinderItem] = useState<any>(null);
  const [finderBoxes, setFinderBoxes] = useState("");
  const [finderQty, setFinderQty] = useState(1);
  const [finderPrice, setFinderPrice] = useState(0);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [showAllItemVarieties, setShowAllItemVarieties] = useState(false);
  const [showAllPacks, setShowAllPacks] = useState(false);

  const [discount, setDiscount] = useState(0);
  const placeSupplyRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStates();
    fetchPartyName();
    fetchProducts();
    fetchUsers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        placeSupplyRef.current &&
        !placeSupplyRef.current.contains(event.target as Node)
      ) {
        setShowPlaceSupplyDrop(false);
      }

      if (
        branchRef.current &&
        !branchRef.current.contains(event.target as Node)
      ) {
        setShowBranchDrop(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchStates = async () => {
    try {
      const data = await userService.getState();
      setStates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching states:", error);
      setStates([]);
    }
  };

  const fetchPartyName = async () => {
    try {
      const data = await sapService.getParties();
      const filtered = data.filter(
        (d: any) => (d.category || "").toLowerCase() === "oil",
      );
      setParties(filtered);
      console.log("Fetched parties:", filtered);
    } catch (error) {
      console.log("Error fetching parties name:", error);
      setParties([]);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await sapService.getProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Error fetching products:", error);
      setProducts([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await userService.getUsers();
      const data2 = data.data.filter(
        (u: any) =>
          u.role_id === 2 ||
          Number(u.role) === 2 ||
          u.role?.toLowerCase() === "manager",
      );
      setUsers(data2);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const getDocNo = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `PB_${y}${m}${day}${h}${min}`;
  };

  const getText = (value: unknown) => String(value || "").trim();
  const normalizeText = (value: unknown) =>
    getText(value).toLowerCase().replace(/\s+/g, " ");
  const getProductCode = (item: any) => getText(item.item_code || item.ItemCode);
  const getProductName = (item: any) => getText(item.item_name || item.ItemName);
  const getProductBrand = (item: any) => getText(item.brand || item.U_Brand);
  const getProductVariety = (item: any) => getText(item.variety || item.U_Sub_Group || item.U_Variety);
  const getProductPack = (item: any) =>
    getText(item.pack_size || item.U_Pack || item.U_SKU || item.sal_pack_unit || item.sal_factor2);
  const getProductQtyPerBox = (item: any) =>
    Number(item.sal_factor2 || item.SalFactor2 || item.pcs || item.Pcs || 1) || 1;
  const getProductStock = (item: any) =>
    Number(item.stock || item.Stock || item.on_hand || item.OnHand || 0);
  const getUniqueOptions = (values: string[]) => [
    "All",
    ...Array.from(new Set(values.filter(Boolean))).sort(),
  ];
  const getTopOptions = (values: string[]) => values.slice(0, 5);
  const getStateValue = (state: any) =>
    getText(state.code || state.state_code || state.name || state.id);

  const getPartyCode = (party: any) =>
    party.card_code || party.code || party.CardCode || party.id || "";
  const getPartyName = (party: any) =>
    party.card_name || party.name || party.CardName || "";
  const getPartyState = (party: any) =>
    party.state_name ||
    party.StateName ||
    party.state ||
    party.state_code ||
    "";
  const getPartyStateValues = (party: any) =>
    [party.state_code, party.state, party.state_name, party.StateName]
      .map(normalizeText)
      .filter(Boolean);
  const getPartyChain = (party: any) => party.chain || party.U_Chain || "";

  const chains = [
    "All",
    ...Array.from(
      new Set(parties.map((p: any) => getPartyChain(p)).filter(Boolean)),
    ),
  ];

  const visibleStates = showAllStates ? states : states.slice(0, 5);
  const visibleChains = showAllChains ? chains : chains.slice(0, 5);
  const placeSupplyStates = states.filter((state: any) =>
    getText(state.name).toLowerCase().includes(placeSupplySearch.toLowerCase()),
  );
  const branchStates = states.filter((state: any) =>
    getText(state.name).toLowerCase().includes(branchSearch.toLowerCase()),
  );

  const brands = getUniqueOptions(products.map((p: any) => getProductBrand(p)));
  const varieties = getUniqueOptions(
    products
      .filter((p: any) => selectedBrand === "All" || getProductBrand(p) === selectedBrand)
      .map((p: any) => getProductVariety(p)),
  );
  const packs = getUniqueOptions(
    products
      .filter((p: any) => selectedBrand === "All" || getProductBrand(p) === selectedBrand)
      .filter((p: any) => selectedVariety === "All" || getProductVariety(p) === selectedVariety)
      .map((p: any) => getProductPack(p)),
  );

  const filteredParties = parties.filter((party: any) => {
    const partyName = getPartyName(party).toLowerCase();
    const partyCode = String(getPartyCode(party)).toLowerCase();
    const partyStates = getPartyStateValues(party);
    const partyChain = normalizeText(getPartyChain(party));
    const stateFilter = normalizeText(selectedState);
    const chainFilter = normalizeText(selectedChain);
    const search = customerSearch.toLowerCase();

    if (stateFilter && !partyStates.includes(stateFilter)) return false;
    if (chainFilter !== "all" && partyChain !== chainFilter) return false;
    if (search && !partyName.includes(search) && !partyCode.includes(search))
      return false;

    return true;
  });

  const filteredProducts = products.filter((item: any) => {
    const code = getProductCode(item).toLowerCase();
    const name = getProductName(item).toLowerCase();
    const brand = getProductBrand(item);
    const variety = getProductVariety(item);
    const pack = getProductPack(item);
    const search = itemSearch.toLowerCase();

    if (selectedBrand !== "All" && brand !== selectedBrand) return false;
    if (selectedVariety !== "All" && variety !== selectedVariety) return false;
    if (selectedPack !== "All" && pack !== selectedPack) return false;

    return !search || code.includes(search) || name.includes(search);
  });
  const visibleBrands = showAllBrands ? brands : getTopOptions(brands);
  const visibleVarieties = showAllItemVarieties ? varieties : getTopOptions(varieties);
  const visiblePacks = showAllPacks ? packs : getTopOptions(packs);
  const finderQtyPerBox = selectedFinderItem
    ? getProductQtyPerBox(selectedFinderItem)
    : 1;
  const finderTotal = finderQty * finderPrice;
  const finderLitres = (() => {
    const pack = selectedFinderItem ? getProductPack(selectedFinderItem) : "";
    const match = pack.match(/[\d.]+/);
    return match ? Number(match[0]) * finderQty : 0;
  })();

  const visibleParties = showAllParties
    ? filteredParties
    : filteredParties.slice(0, 5);

  const selectCustomer = (party: any) => {
    setSelectedCustomer(party);
    setShowCustomerModal(false);
    setShowAllParties(false);
  };

  const selectProduct = (item: any, qty = 1, price?: number) => {
    const updatedRows = [...rows];
    updatedRows[activeRow] = {
      ...updatedRows[activeRow],
      item_code: getProductCode(item),
      item_name: getProductName(item),
      description: getProductName(item),
      qty,
      unit_price: price ?? Number(item.basic_rate || item.Price || item.price || 0),
      tax_rate: Number(item.tax_rate || item.TaxRate || 5),
      variety: getProductVariety(item),
      whse: item.warehouse || item.WarehouseCode || "PB_SP",
    };
    setRows(updatedRows);
    setShowItemModal(false);
    setItemSearch("");
    setSelectedBrand("All");
    setSelectedVariety("All");
    setSelectedPack("All");
    setSelectedFinderItem(null);
    setFinderBoxes("");
    setFinderQty(1);
    setFinderPrice(0);
    setShowAllBrands(false);
    setShowAllItemVarieties(false);
    setShowAllPacks(false);
  };

  const chooseFinderItem = (item: any) => {
    setSelectedFinderItem(item);
    setFinderQty((Number(finderBoxes) || 0) * getProductQtyPerBox(item));
    setFinderPrice(Number(item.basic_rate || item.Price || item.price || 0));
  };

  const updateFinderBoxes = (value: string) => {
    setFinderBoxes(value);
    setFinderQty((Number(value) || 0) * finderQtyPerBox);
  };

  const addFinderItem = () => {
    if (!selectedFinderItem) return;
    selectProduct(selectedFinderItem, finderQty, finderPrice);
  };

  const updateRow = (index: number, field: string, value: string | number) => {
    const updatedRows = [...rows];
    updatedRows[index] = { ...updatedRows[index], [field]: value };
    setRows(updatedRows);
  };

  const addRow = () => {
    setRows([...rows, { ...emptyRow }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    setRows([{ ...emptyRow }]);
    setSelectedCustomer(null);
    setSelectedState("");
    setSelectedChain("All");
    setCustomerSearch("");
    setItemSearch("");
    setSelectedEmployee("");
    setPlaceSupplySearch("");
    setBranchSearch("");
    setSelectedPlaceSupply(null);
    setSelectedBranch(null);
    setSelectedBrand("All");
    setSelectedVariety("All");
    setSelectedPack("All");
    setSelectedFinderItem(null);
    setFinderBoxes("");
    setFinderQty(1);
    setFinderPrice(0);
    setDiscount(0);
    setSelectedTab("Contents");
  };

  const getLineAmount = (row: any) => {
    const qty = Number(row.qty || 0);
    const price = Number(row.unit_price || 0);
    const disc = Number(row.disc || 0);
    return qty * price * (1 - disc / 100);
  };

  const subTotal = rows.reduce(
    (sum, row) => sum + Number(row.qty || 0) * Number(row.unit_price || 0),
    0,
  );
  const lineTotal = rows.reduce((sum, row) => sum + getLineAmount(row), 0);
  const discountAmount = subTotal * (Number(discount || 0) / 100);
  const taxableAmount = lineTotal - discountAmount;
  const taxAmount = rows.reduce(
    (sum, row) => sum + getLineAmount(row) * (Number(row.tax_rate || 0) / 100),
    0,
  );
  const totalAmount = taxableAmount + taxAmount;

  const money = (value: number) =>
    `Rs. ${Math.round(value).toLocaleString("en-IN")}`;

  return (
    <main className="ni-page">
      <div className="entry-wrap">
        <div className="entry-fields">
          <div className="section-title">Customer Details</div>

          <div className="doc-info-box">
            <div className="doc-info-row">
              <div className="doc-info-main">
                <div className="lbl">Document No.</div>
                <div className="doc-num-big">{getDocNo()}</div>
                <span className="status-pill sp-open">Open</span>
              </div>

              <div className="fg doc-info-field">
                <label>Posting Date</label>
                <input type="date" defaultValue={today} />
              </div>

              <div className="fg doc-info-field">
                <label>Due Date</label>
                <input type="date" defaultValue={today} />
              </div>

              <div className="fg doc-info-field">
                <label>Document Date</label>
                <input type="date" defaultValue={today} />
              </div>
            </div>
          </div>

          <div className="fg">
            <label>Customer *</label>
            <div className="cust-trigger empty">
              <button
                className="cust-seg pickable"
                type="button"
                onClick={() => setShowCustomerModal(true)}
              >
                <span className="cust-seg-label">Customer No. / Name</span>
                <span className="cust-seg-value">
                  {selectedCustomer
                    ? `${getPartyCode(selectedCustomer)} - ${getPartyName(selectedCustomer)}`
                    : "Select Customer..."}
                </span>
              </button>
              <div className="cust-seg">
                <span className="cust-seg-label">State</span>
                <span className="cust-seg-value">
                  {selectedCustomer
                    ? getPartyState(selectedCustomer) || "-"
                    : "-"}
                </span>
              </div>
              <div className="cust-seg">
                <span className="cust-seg-label">U-Chain</span>
                <span className="cust-seg-value">
                  {selectedCustomer
                    ? getPartyChain(selectedCustomer) || "-"
                    : "-"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="ftabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={selectedTab === tab ? "ftab active" : "ftab"}
              type="button"
              onClick={() => setSelectedTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="ftab-panel active">
          {selectedTab === "Contents" && (
            <>
              <div className="li-wrap">
                <table className="li-tbl">
                  <thead>
                    <tr>
                      <th className="nc">#</th>
                      <th>Type</th>
                      <th>Item No.</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Disc%</th>
                      <th>Price After Disc</th>
                      <th>Tax Code</th>
                      <th>Total (LC)</th>
                      <th>Whse</th>
                      <th>Variety</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <td className="nc">{index + 1}</td>
                        <td>
                          <select
                            className="ci"
                            value={row.type}
                            onChange={(e) =>
                              updateRow(index, "type", e.target.value)
                            }
                          >
                            <option>Item</option>
                            <option>Service</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className={
                              row.item_code
                                ? "item-trigger"
                                : "item-trigger empty"
                            }
                            type="button"
                            onClick={() => {
                              setActiveRow(index);
                              setShowItemModal(true);
                              setSelectedFinderItem(null);
                              setFinderBoxes("");
                              setFinderQty(Number(row.qty || 1));
                              setFinderPrice(Number(row.unit_price || 0));
                            }}
                          >
                            {row.item_code || "Click to Select..."}
                          </button>
                        </td>
                        <td>
                          <input
                            className="ci"
                            value={row.description}
                            onChange={(e) =>
                              updateRow(index, "description", e.target.value)
                            }
                            placeholder="Description"
                          />
                        </td>
                        <td>
                          <input
                            className="ci"
                            type="number"
                            value={row.qty}
                            onChange={(e) =>
                              updateRow(index, "qty", Number(e.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="ci"
                            type="number"
                            value={row.unit_price}
                            onChange={(e) =>
                              updateRow(
                                index,
                                "unit_price",
                                Number(e.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="ci"
                            type="number"
                            value={row.disc}
                            onChange={(e) =>
                              updateRow(index, "disc", Number(e.target.value))
                            }
                          />
                        </td>
                        <td className="tc">{money(getLineAmount(row))}</td>
                        <td>
                          <select
                            className="ci"
                            value={row.tax_rate}
                            onChange={(e) =>
                              updateRow(
                                index,
                                "tax_rate",
                                Number(e.target.value),
                              )
                            }
                          >
                            <option value={5}>CG+SG@5</option>
                            <option value={12}>CG+SG@12</option>
                            <option value={18}>CG+SG@18</option>
                            <option value={0}>Exempt</option>
                          </select>
                        </td>
                        <td className="tc">{money(getLineAmount(row))}</td>
                        <td>
                          <input
                            className="ci"
                            value={row.whse}
                            onChange={(e) =>
                              updateRow(index, "whse", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="ci"
                            value={row.variety}
                            onChange={(e) =>
                              updateRow(index, "variety", e.target.value)
                            }
                            placeholder="Variety"
                          />
                        </td>
                        <td>
                          <button
                            className="del-btn"
                            type="button"
                            onClick={() => removeRow(index)}
                          >
                            <HiOutlineXMark />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="add-row-btn" type="button" onClick={addRow}>
                <HiOutlinePlus /> Add Row
              </button>

              <div className="entry-footer">
                <div className="logistics-sec">
                  <div className="section-title">Driver / Logistics Info</div>
                  <div className="ef-grid3">
                    <div className="fg">
                      <label>Driver Name</label>
                      <input type="text" placeholder="Driver name" />
                    </div>
                    <div className="fg">
                      <label>Vehicle Number</label>
                      <input type="text" placeholder="PB-01-AB-1234" />
                    </div>
                    <div className="fg">
                      <label>Bill Number</label>
                      <input type="text" placeholder="Bill number" />
                    </div>
                    <div className="fg">
                      <label>Bill Date</label>
                      <input type="date" defaultValue={today} />
                    </div>
                    <div className="fg">
                      <label>Driver Mobile</label>
                      <input type="text" placeholder="+91-xxxxx-xxxxx" />
                    </div>
                    <div className="fg">
                      <label>Sales Employee</label>
                      <select
                        value={selectedEmployee}
                        onChange={(e) => setSelectedEmployee(e.target.value)}
                      >
                        <option value="">Select Manager</option>

                        {users.map((user: any) => (
                          <option key={user.id} value={user.id}>
                            {user.name || user.username || user.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="totals-box">
                  <table>
                    <tbody>
                      <tr>
                        <td>Total Before Discount</td>
                        <td>{money(subTotal)}</td>
                      </tr>
                      <tr>
                        <td>
                          Discount{" "}
                          <input
                            type="number"
                            value={discount}
                            onChange={(e) =>
                              setDiscount(Number(e.target.value))
                            }
                          />
                          %
                        </td>
                        <td>-{money(discountAmount)}</td>
                      </tr>
                      <tr>
                        <td>Taxable Amount</td>
                        <td>{money(taxableAmount)}</td>
                      </tr>
                      <tr>
                        <td>Tax (GST)</td>
                        <td>{money(taxAmount)}</td>
                      </tr>
                      <tr className="gt">
                        <td>Total Amount</td>
                        <td>{money(totalAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {selectedTab === "Logistics" && (
            <div className="ef-grid">
              <div className="fg">
                <label>Ship To</label>
                <input type="text" placeholder="Shipping address" />
              </div>
              <div className="fg">
                <label>Pay To</label>
                <input type="text" placeholder="Billing address" />
              </div>
              <div className="fg">
                <label>Shipping Type</label>
                <select>
                  <option>Road</option>
                  <option>Rail</option>
                  <option>Air</option>
                  <option>Ship</option>
                </select>
              </div>
              <div className="fg">
                <label>E-Way Bill No.</label>
                <input type="text" placeholder="E-Way bill number" />
              </div>
              <div className="fg">
                <label>LR / GR Number</label>
                <input type="text" placeholder="LR / GR Number" />
              </div>
              <div className="fg">
                <label>Shipping Priority</label>
                <select>
                  <option>Normal</option>
                  <option>Urgent</option>
                </select>
              </div>
            </div>
          )}

          {selectedTab === "Accounting" && (
            <div className="ef-grid">
              <div className="fg">
                <label>GL Account</label>
                <input type="text" defaultValue="4110014" />
              </div>
              <div className="fg">
                <label>Payment Terms</label>
                <select>
                  <option>Immediate</option>
                  <option>Net 7</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                </select>
              </div>
              <div className="fg">
                <label>Cost Centre</label>
                <input type="text" placeholder="Cost centre code" />
              </div>
              <div className="fg">
                <label>Project Code</label>
                <input type="text" placeholder="Project code" />
              </div>
            </div>
          )}

          {selectedTab === "Tag" && (
            <p className="ni-placeholder">No tags assigned.</p>
          )}
          {selectedTab === "Electronic Documents" && (
            <p className="ni-placeholder">No electronic documents attached.</p>
          )}

          {selectedTab === "Customer Details" && (
            <div className="ef-grid">
              <div className="fg">
                <label>Contact Person</label>
                <input type="text" placeholder="Auto from customer" />
              </div>
              <div className="fg">
                <label>Customer Ref. No.</label>
                <input type="text" placeholder="Optional" />
              </div>
              <div className="fg">
                <label>Transaction Type</label>
                <select>
                  <option>GST Tax Invoice</option>
                  <option>Export Invoice</option>
                  <option>Bill of Supply</option>
                </select>
              </div>
              <div className="fg">
                <label>Local Currency</label>
                <select>
                  <option>INR-Indian Rupee</option>
                  <option>USD-US Dollar</option>
                </select>
              </div>
              <div className="fg">
                <label>Place of Supply</label>
                <div className="state-dropdown" ref={placeSupplyRef}>
                  <button
                    className="state-dropdown-btn"
                    type="button"
                    onClick={() => setShowPlaceSupplyDrop(!showPlaceSupplyDrop)}
                  >
                    {selectedPlaceSupply
                      ? selectedPlaceSupply.name
                      : "Select state"}
                  </button>
                  {showPlaceSupplyDrop && (
                    <div className="state-dropdown-menu">
                      <input
                        className="state-select-search"
                        type="text"
                        value={placeSupplySearch}
                        onChange={(e) => setPlaceSupplySearch(e.target.value)}
                        placeholder="Search state..."
                        autoFocus
                      />
                      <div className="state-dropdown-list">
                        {placeSupplyStates.map((state: any) => (
                          <button
                            className="state-dropdown-option"
                            type="button"
                            key={state.id}
                            onClick={() => {
                              setSelectedPlaceSupply(state);
                              setShowPlaceSupplyDrop(false);
                              setPlaceSupplySearch("");
                            }}
                          >
                            {state.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="fg">
                <label>Branch</label>
                <div className="state-dropdown" ref={branchRef}>
                  <button
                    className="state-dropdown-btn"
                    type="button"
                    onClick={() => setShowBranchDrop(!showBranchDrop)}
                  >
                    {selectedBranch ? selectedBranch.name : "Select branch"}
                  </button>
                  {showBranchDrop && (
                    <div className="state-dropdown-menu">
                      <input
                        className="state-select-search"
                        type="text"
                        value={branchSearch}
                        onChange={(e) => setBranchSearch(e.target.value)}
                        placeholder="Search branch..."
                        autoFocus
                      />
                      <div className="state-dropdown-list">
                        {branchStates.map((state: any) => (
                          <button
                            className="state-dropdown-option"
                            type="button"
                            key={state.id}
                            onClick={() => {
                              setSelectedBranch(state);
                              setShowBranchDrop(false);
                              setBranchSearch("");
                            }}
                          >
                            {state.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="fg">
                <label>GST Reg. No.</label>
                <input type="text" placeholder="Auto from customer" readOnly />
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button className="btn-clr" type="button" onClick={handleClear}>
            <HiOutlineXMark /> Clear
          </button>
          <button className="btn-draft" type="button">
            <FaRegSave /> Save as Draft
          </button>
          <button className="btn-post" type="button">
            <HiOutlinePaperAirplane /> Post to SAP HANA
          </button>
        </div>
      </div>

      {showCustomerModal && (
        <div className="finder-modal on">
          <div
            className="modal-bg"
            onClick={() => setShowCustomerModal(false)}
          ></div>
          <div className="finder-box">
            <div className="finder-head">
              <h3>Smart Customer Finder</h3>
              <button
                className="modal-close-btn"
                type="button"
                onClick={() => setShowCustomerModal(false)}
              >
                ×
              </button>
            </div>
            <div className="finder-body">
              <div className="section-title">Step 1: Choose State</div>
              <div className="chip-grid">
                {visibleStates.map((state: any) => (
                  <button
                    className={
                      selectedState === getStateValue(state)
                        ? "chip active"
                        : "chip"
                    }
                    type="button"
                    key={state.id}
                    onClick={() => {
                      setSelectedState(getStateValue(state));
                      setShowAllParties(false);
                    }}
                  >
                    {state.name}
                  </button>
                ))}
                <button
                  className={selectedState === "" ? "chip active" : "chip"}
                  type="button"
                  onClick={() => {
                    setSelectedState("");
                    setShowAllParties(false);
                  }}
                >
                  All
                </button>
                {states.length > 5 && (
                  <button
                    className="chip more-chip"
                    type="button"
                    onClick={() => setShowAllStates(!showAllStates)}
                  >
                    {showAllStates ? "Less" : "More..."}
                  </button>
                )}
              </div>

              <div className="section-title">Step 2: Choose Chain</div>
              <div className="chip-grid">
                {visibleChains.map((chain) => (
                  <button
                    className={selectedChain === chain ? "chip active" : "chip"}
                    type="button"
                    key={chain}
                    onClick={() => {
                      setSelectedChain(chain);
                      setShowAllParties(false);
                    }}
                  >
                    {chain}
                  </button>
                ))}
                {chains.length > 5 && (
                  <button
                    className="chip more-chip"
                    type="button"
                    onClick={() => setShowAllChains(!showAllChains)}
                  >
                    {showAllChains ? "Less" : "More..."}
                  </button>
                )}
              </div>

              <div className="finder-product-toolbar">
                <div className="section-title">Step 3: Results</div>
                <div className="finder-search-box">
                  <input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search..."
                  />
                </div>
              </div>

              <div className="finder-results">
                <div className="customer-result-grid">
                  {visibleParties.map((party: any) => (
                    <button
                      className="customer-result-card"
                      type="button"
                      key={getPartyCode(party)}
                      onClick={() => selectCustomer(party)}
                    >
                      <strong>{getPartyCode(party)}</strong>
                      <span>{getPartyName(party)}</span>
                      <em>{getPartyChain(party) || "-"}</em>
                    </button>
                  ))}
                  {filteredParties.length > 5 && (
                    <button
                      className="customer-result-card more-result-card"
                      type="button"
                      onClick={() => setShowAllParties(!showAllParties)}
                    >
                      <strong>
                        {showAllParties ? "Show Less" : "More..."}
                      </strong>
                      <span>
                        {showAllParties
                          ? "Hide extra customers"
                          : `${filteredParties.length - 5} more customers`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="finder-modal on">
          <div
            className="modal-bg"
            onClick={() => setShowItemModal(false)}
          ></div>
          <div className="finder-box">
            <div className="finder-head">
              <h3>Smart Item Finder</h3>
              <button
                className="modal-close-btn"
                type="button"
                onClick={() => setShowItemModal(false)}
              >
                ×
              </button>
            </div>
            <div className="finder-body">
              <div className="item-filter-title">Step 1: Filter Items</div>
              <div className="item-filter-box">
                <div className="item-filter-row">
                  <p>Select Brand</p>
                  <div className="item-filter-chips">
                  {visibleBrands.map((b) => (
                    <button
                      key={b}
                      className={selectedBrand === b ? "active" : ""}
                      type="button"
                      onClick={() => {
                        setSelectedBrand(b);
                        setSelectedVariety("All");
                        setSelectedPack("All");
                      }}
                    >
                      {b}
                    </button>
                  ))}
                  {brands.length > 5 && (
                    <button
                      type="button"
                      className="more-chip"
                      onClick={() => setShowAllBrands(!showAllBrands)}
                    >
                      {showAllBrands ? "Less" : "More..."}
                    </button>
                  )}
                  </div>
                </div>

                {/* <div className="item-filter-row">
                  <p>Sub Group</p>
                  <div className="item-filter-chips">
                  {visibleVarieties.map((v) => (
                    <button
                      key={v}
                      className={selectedVariety === v ? "active" : ""}
                      type="button"
                      onClick={() => {
                        setSelectedVariety(v);
                        setSelectedPack("All");
                      }}
                    >
                      {v}
                    </button>
                  ))}
                  {varieties.length > 5 && (
                    <button
                      type="button"
                      className="more-chip"
                      onClick={() => setShowAllItemVarieties(!showAllItemVarieties)}
                    >
                      {showAllItemVarieties ? "Less" : "More..."}
                    </button>
                  )}
                  </div>
                </div> */}

                <div className="item-filter-row">
                  <p>Variety</p>
                  <div className="item-filter-chips">
                  {visibleVarieties.map((v) => (
                    <button
                      key={`var-${v}`}
                      className={selectedVariety === v ? "active" : ""}
                      type="button"
                      onClick={() => {
                        setSelectedVariety(v);
                        setSelectedPack("All");
                      }}
                    >
                      {v}
                    </button>
                  ))}
                  {varieties.length > 5 && (
                    <button
                      type="button"
                      className="more-chip"
                      onClick={() => setShowAllItemVarieties(!showAllItemVarieties)}
                    >
                      {showAllItemVarieties ? "Less" : "More..."}
                    </button>
                  )}
                  </div>
                </div>

                <div className="item-filter-row">
                  <p>Pack Size</p>
                  <div className="item-filter-chips">
                  {visiblePacks.map((p) => (
                    <button
                      key={p}
                      className={selectedPack === p ? "active" : ""}
                      type="button"
                      onClick={() => setSelectedPack(p)}
                    >
                      {p}
                    </button>
                  ))}
                  {packs.length > 5 && (
                    <button
                      type="button"
                      className="more-chip"
                      onClick={() => setShowAllPacks(!showAllPacks)}
                    >
                      {showAllPacks ? "Less" : "More..."}
                    </button>
                  )}
                  </div>
                </div>
              </div>
              <div className="finder-product-toolbar">
                <div>
                  <div className="item-filter-title">Step 2: Select Product</div>
                  <strong className="finder-product-count">{filteredProducts.length} items available</strong>
                </div>
                <div className="finder-search-box">
                  <input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search items..."
                  />
                </div>
                <button
                  className="finder-clear-btn"
                  type="button"
                  onClick={() => {
                    setSelectedBrand("All");
                    setSelectedVariety("All");
                    setSelectedPack("All");
                    setItemSearch("");
                    setSelectedFinderItem(null);
                    setShowAllBrands(false);
                    setShowAllItemVarieties(false);
                    setShowAllPacks(false);
                  }}
                >
                  Clear All
                </button>
              </div>
              <div className="finder-product-grid">
                {filteredProducts.length === 0 && (
                  <div className="finder-empty-state">No matching items found.</div>
                )}
                {filteredProducts.map((item: any) => (
                  <button
                    className={
                      selectedFinderItem && getProductCode(selectedFinderItem) === getProductCode(item)
                        ? "finder-product-card active"
                        : "finder-product-card"
                    }
                    type="button"
                    key={getProductCode(item)}
                    onClick={() => chooseFinderItem(item)}
                  >
                    <div className="finder-product-top">
                      <span className="finder-product-code">{getProductCode(item)}</span>
                      <span className="finder-product-stock">{getProductStock(item).toLocaleString("en-IN")} in stock</span>
                    </div>
                    <strong className="finder-product-name">
                      {getProductName(item)}
                    </strong>
                    <div className="finder-product-meta">
                      <em>{getProductBrand(item) || "Item"}</em>
                      <em>{getProductVariety(item) || "Variety"}</em>
                      <em>{getProductPack(item) || "Pack"}</em>
                    </div>
                  </button>
                ))}
              </div>
              <div className="finder-add-panel">
                <div className="fg">
                  <label>Boxes</label>
                  <input
                    type="number"
                    value={finderBoxes}
                    min={0}
                    onChange={(e) => updateFinderBoxes(e.target.value)}
                    placeholder="Enter boxes"
                  />
                </div>
                <div className="fg">
                  <label>Qty (Bottles)</label>
                  <input
                    type="number"
                    value={finderQty}
                    readOnly
                  />
                </div>
                <div className="fg">
                  <label>Qty / Box</label>
                  <input type="number" value={selectedFinderItem ? finderQtyPerBox : ""} readOnly />
                </div>
                <div className="fg">
                  <label>Total Litres</label>
                  <input type="text" value={finderLitres ? finderLitres.toFixed(2) : ""} readOnly />
                </div>
                <div className="fg">
                  <label>Unit Price (LC)</label>
                  <input
                    type="number"
                    value={finderPrice}
                    onChange={(e) => setFinderPrice(Number(e.target.value || 0))}
                  />
                </div>
                <div className="finder-add-actions">
                  <strong>Row Total: {money(finderTotal)}</strong>
                  <button className="btn-draft" type="button" onClick={() => setShowItemModal(false)}>
                    Cancel
                  </button>
                  <button className="btn-post" type="button" disabled={!selectedFinderItem} onClick={addFinderItem}>
                    Add to List
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

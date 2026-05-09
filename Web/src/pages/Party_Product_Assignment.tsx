import { useEffect, useRef, useState } from "react";
import type { Product } from "../services/ordersService";
import { sapService, type Party } from "../services/sapService";
import { userService } from "../services/userService";
import api from "../services/api";

interface PartyProduct {
  id: number;
  item_code: string;
  item_name: string;
  category: string;
  brand: string;
  variety: string;
  sal_pack_unit: string;
  basic_rate: number;
}

type SearchableParty = Party & {
  CardCode?: string | number | null;
  CardName?: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();
const normalizeSearch = (value: unknown) => asText(value).toLowerCase();

const getPartyCode = (party: SearchableParty) => asText(party.card_code || party.CardCode);
const getPartyName = (party: SearchableParty) => asText(party.card_name || party.CardName);
const getPartyCategory = (party: SearchableParty) => asText(party.category);
const normalizeCategory = (value: unknown) => asText(value).toUpperCase();
const getPartySelectionKey = (party: SearchableParty) =>
  `${getPartyCode(party)}||${normalizeCategory(getPartyCategory(party))}`;
const getPartyKey = (party: SearchableParty) =>
  [getPartyCode(party), asText(party.category), asText(party.id)].filter(Boolean).join("-");

const getSelectionFromKey = (key: string) => {
  const [cardCode, category = ""] = key.split("||");
  return {
    card_code: cardCode,
    category: category || null,
  };
};

const getPartyMetaLine = (party: SearchableParty) =>
  [getPartyCode(party), party.state, getPartyCategory(party)].filter(Boolean).join(" | ");

const mergeParties = (partyList: Party[]) => {
  const seen = new Set<string>();

  return partyList.filter((party) => {
    const key = getPartyKey(party);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getPartyList = (data: unknown): Party[] => {
  if (Array.isArray(data)) return data as Party[];
  if (data && typeof data === "object") {
    const response = data as { data?: unknown; results?: unknown };
    if (Array.isArray(response.data)) return response.data as Party[];
    if (Array.isArray(response.results)) return response.results as Party[];
  }
  return [];
};

export default function Party_Product_Assignment() {
  const [parties, setParties] = useState<Party[]>([]);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [assignedProducts, setAssignedProducts] = useState<PartyProduct[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [selectedNewProducts, setSelectedNewProducts] = useState<Product[]>([]);
  const [newProductRates, setNewProductRates] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const partySearchRequestRef = useRef(0);

  useEffect(() => {
    fetchParties();
    fetchProducts();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fetchParties(partySearch);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [partySearch]);

  useEffect(() => {
    if (selectedParties.length === 1) {
      const selectedParty = getSelectionFromKey(selectedParties[0]);
      fetchPartyProducts(selectedParty.card_code, selectedParty.category);
    } else {
      setAssignedProducts([]);
    }
  }, [selectedParties]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchParties = async (search = "") => {
    const requestId = ++partySearchRequestRef.current;
    try {
      const searchValue = search.trim();
      const response = searchValue
        ? await api.get("/sap/parties/", { params: { search: searchValue } })
        : { data: await sapService.getParties() };
      const partyList = getPartyList(response.data);

      if (requestId !== partySearchRequestRef.current) return;

      if (!searchValue) {
        setAllParties(partyList);
      }

      setParties((prev) => mergeParties(searchValue ? [...allParties, ...partyList, ...prev] : partyList));
    } catch (error) {
      console.error("Error fetching parties:", error);
      if (requestId === partySearchRequestRef.current && !search.trim()) {
        setParties([]);
        setAllParties([]);
      }
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await sapService.getProducts();
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchPartyProducts = async (card_code: string, category?: string | null) => {
    try {
      const res = await userService.getPartyProducts(card_code, category);
      setAssignedProducts(res.data?.products || res.products || []);
    } catch (error) {
      console.error("Error fetching party products:", error);
      setAssignedProducts([]);
    }
  };

  const handleRemoveProduct = async (product: PartyProduct) => {
    if (selectedParties.length !== 1) return;
    if (!window.confirm(`Are you sure you want to remove ${product.item_name}?`)) return;
    try {
      const selectedParty = getSelectionFromKey(selectedParties[0]);
      await userService.removePartyProduct(selectedParty.card_code, product.item_code, product.category);
      alert("Product removed successfully");
      fetchPartyProducts(selectedParty.card_code, selectedParty.category);
    } catch (error) {
      console.error("Error removing product:", error);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedNewProducts.length === 0 || selectedParties.length === 0) return;
    setIsSaving(true);
    try {
      const payload = selectedNewProducts.map((p) => ({
        item_code: p.item_code,
        category: p.category,
        basic_rate: Number(newProductRates[`${p.item_code}-${p.category}`]) || 0,
      }));

      const partySelections = selectedParties.map(getSelectionFromKey);
      const cardCodes = [...new Set(partySelections.map((party) => party.card_code))];

      await api.post("/auth/bulk-party/assign-products/", {
        card_codes: cardCodes,
        party_selections: partySelections,
        products: payload,
      });

      const label = selectedParties.length > 1
        ? `${selectedParties.length} parties`
        : getPartyName(partyOptions.find((p) => getPartySelectionKey(p) === selectedParties[0]) || ({} as SearchableParty)) || getSelectionFromKey(selectedParties[0]).card_code;
      alert(`Products assigned to ${label} successfully`);

      setShowAddModal(false);
      setSelectedNewProducts([]);
      setNewProductRates({});
      setModalSearch("");

      if (selectedParties.length === 1) {
        const selectedParty = getSelectionFromKey(selectedParties[0]);
        fetchPartyProducts(selectedParty.card_code, selectedParty.category);
      }
    } catch (error) {
      console.error("Error assigning products:", error);
      alert("Failed to assign products");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRate = async (product: PartyProduct) => {
    if (selectedParties.length !== 1) return;
    const selectedParty = getSelectionFromKey(selectedParties[0]);
    const newRate = prompt(`Enter new basic rate for ${product.item_name}:`, product.basic_rate.toString());
    if (newRate === null) return;
    const parsedRate = parseFloat(newRate);
    if (isNaN(parsedRate) || parsedRate < 0) {
      alert("Invalid rate entered.");
      return;
    }
    try {
      await userService.editRate(selectedParty.card_code, product.item_code, product.category, parsedRate);
      alert("Rate updated successfully");
      setAssignedProducts((prev) =>
        prev.map((p) =>
          p.item_code === product.item_code && p.category === product.category
            ? { ...p, basic_rate: parsedRate }
            : p
        )
      );
    } catch (error) {
      console.error("Error updating rate:", error);
      alert("Failed to update rate.");
    }
  };

  const toggleParty = (partyKey: string) => {
    setSelectedParties((prev) =>
      prev.includes(partyKey) ? prev.filter((p) => p !== partyKey) : [...prev, partyKey]
    );
  };

  const removeSelectedParty = (partyKey: string) => {
    setSelectedParties((prev) => prev.filter((p) => p !== partyKey));
  };

  const partyOptions = mergeParties([...allParties, ...parties]);
  const searchTerm = normalizeSearch(partySearch);
  const filteredParties = partyOptions.filter((p) => {
    if (!searchTerm) return true;

    return [
      getPartyCode(p),
      getPartyName(p),
      p.state,
      p.main_group,
      p.category,
    ].some((value) => normalizeSearch(value).includes(searchTerm));
  });

  const isSingleParty = selectedParties.length === 1;
  const selectedPartyDetails = isSingleParty
    ? partyOptions.find((p) => getPartySelectionKey(p) === selectedParties[0])
    : null;
  const selectedPartyCategories = new Set(
    selectedParties
      .map((partyKey) => getSelectionFromKey(partyKey).category)
      .filter(Boolean)
      .map(normalizeCategory)
  );

  const displayProducts = assignedProducts.filter((p) =>
    categoryFilter === "ALL" ? true : p.category === categoryFilter
  );

  const totalProducts = assignedProducts.length;
  const oilCount = assignedProducts.filter((p) => p.category === "OIL").length;
  const beverageCount = assignedProducts.filter((p) => p.category === "BEVERAGES").length;
  const martCount = assignedProducts.filter((p) => p.category === "MART").length;

  const availableProducts = products.filter(
    (p) =>
      (selectedPartyCategories.size === 0 || selectedPartyCategories.has(normalizeCategory(p.category))) &&
      !assignedProducts.some((ap) => ap.item_code === p.item_code && ap.category === p.category)
  );

  const filteredAvailable = availableProducts.filter(
    (p) =>
      (p.item_name || "").toLowerCase().includes(modalSearch.toLowerCase()) ||
      (p.item_code || "").toLowerCase().includes(modalSearch.toLowerCase())
  );

  const modalTitle =
    selectedParties.length > 1
      ? `Add Products to ${selectedParties.length} Parties`
      : `Add Products to ${selectedPartyDetails ? `${getPartyName(selectedPartyDetails)} (${getPartyCategory(selectedPartyDetails)})` : ""}`;

  return (
    <div className="pa-page app-page">

      {/* Party Selector Card */}
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "24px",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ margin: "0 0 4px", fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Party Product Assignment
          </h1>
          {/* <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Search &amp; select one or more parties to assign products.</p> */}
        </div>

        <div ref={dropdownRef} style={{ position: "relative", maxWidth: "480px", zIndex: 10 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#334155",
              marginBottom: "8px",
            }}
          >
            Search &amp; select one or more parties
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Type name or code to search..."
              style={{
                width: "100%",
                height: "var(--input-h, 40px)",
                padding: "0 12px",
                background: "rgba(248, 250, 252, 0.9)",
                border: "1px solid #cbd5e1",
                borderRadius: "var(--radius-sm, 8px)",
                fontSize: "var(--font-ui, 13px)",
              color: "#0f172a",
                outline: "none",
                boxSizing: "border-box",
              }}
              value={partySearch}
              onChange={(e) => {
                setPartySearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
            />
          </div>

          {showDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "4px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "var(--radius-md, 12px)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                maxHeight: "250px",
                overflowY: "auto",
              }}
            >
              {filteredParties.length > 0 ? (
                filteredParties.map((party) => {
                  const partyName = getPartyName(party);
                  const partyKey = getPartySelectionKey(party);
                  const isChecked = selectedParties.includes(partyKey);
                  return (
                    <div
                      key={getPartyKey(party)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: "1px solid #f1f5f9",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        background: isChecked ? "#eff6ff" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked) e.currentTarget.style.backgroundColor = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isChecked ? "#eff6ff" : "transparent";
                      }}
                      onClick={() => toggleParty(partyKey)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        style={{
                          width: "15px",
                          height: "15px",
                          accentColor: "#2563eb",
                          pointerEvents: "none",
                          flexShrink: 0,
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 500, color: "#0f172a" }}>{partyName || "Unnamed party"}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
                          {getPartyMetaLine(party)}
                        </div>

                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "10px 14px", color: "#64748b" }}>No parties found</div>
              )}
            </div>
          )}
        </div>

        {/* Selected party chips */}
        {selectedParties.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <span
                  key={partyKey}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "20px",
                    padding: "4px 10px",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: "#1d4ed8",
                  }}
                >
                  {p ? getPartyName(p) || fallback.card_code : fallback.card_code}
                  <span style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 600 }}>
                    {p ? getPartyCategory(p) : fallback.category}
                  </span>
                  <button
                    onClick={() => removeSelectedParty(partyKey)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#64748b",
                      fontSize: "1rem",
                      lineHeight: 1,
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {selectedParties.length > 1 && (
              <button
                onClick={() => setSelectedParties([])}
                style={{
                  background: "none",
                  border: "1px solid #fca5a5",
                  borderRadius: "20px",
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                  color: "#ef4444",
                  cursor: "pointer",
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Multi-party assignment panel */}
      {selectedParties.length > 1 && (
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "24px",
            border: "1px solid #bfdbfe",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                Multi-Party Assignment
              </h2>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#475569" }}>
                {selectedParties.length} parties selected — products will be assigned to all of them at once.
              </p>
            </div>
            <button
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
              onClick={() => setShowAddModal(true)}
            >
              + Add Products to All
            </button>
          </div>

          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {selectedParties.map((partyKey) => {
              const p = partyOptions.find((x) => getPartySelectionKey(x) === partyKey);
              const fallback = getSelectionFromKey(partyKey);
              return (
                <div
                  key={partyKey}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "8px 14px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>{p ? getPartyName(p) || fallback.card_code : fallback.card_code}</span>
                  <span style={{ color: "#64748b", marginLeft: "6px" }}>
                    {p ? getPartyMetaLine(p) : [fallback.card_code, fallback.category].filter(Boolean).join(" | ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single-party product details */}
      {selectedPartyDetails && (
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "24px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                {getPartyName(selectedPartyDetails)}
              </h2>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "0.875rem",
                    color: "#475569",
                    fontWeight: 600,
                    background: "#f1f5f9",
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                >
                  {getPartyCode(selectedPartyDetails)}
                </span>
                <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  {selectedPartyDetails.state || "Unknown State"} •{" "}
                  {selectedPartyDetails.main_group || "Unknown Group"} •{" "}
                  {getPartyCategory(selectedPartyDetails) || "Unknown Category"}
                </span>
              </div>
            </div>
            <button
              style={{
                background: "#2563eb",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                fontWeight: 500,
                cursor: "pointer",
              }}
              onClick={() => setShowAddModal(true)}
            >
              + Add Products
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            {[
              { label: "Total Assigned", value: totalProducts, bg: "#f8fafc", border: "#e2e8f0", color: "#0f172a", labelColor: "#64748b" },
              { label: "Oil", value: oilCount, bg: "#fffbeb", border: "#fde68a", color: "#d97706", labelColor: "#b45309" },
              { label: "Beverages", value: beverageCount, bg: "#eff6ff", border: "#bfdbfe", color: "#2563eb", labelColor: "#1d4ed8" },
              { label: "Mart", value: martCount, bg: "#f1f5f9", border: "#cbd5e1", color: "#334155", labelColor: "#475569" },
            ].map(({ label, value, bg, border, color, labelColor }) => (
              <div
                key={label}
                style={{
                  background: bg,
                  padding: "16px",
                  borderRadius: "8px",
                  border: `1px solid ${border}`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: labelColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginTop: "4px",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {["ALL", "OIL", "BEVERAGES", "MART"].map((cat) => (
              <button
                key={cat}
                style={{
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: categoryFilter === cat ? "none" : "1px solid #cbd5e1",
                  background: categoryFilter === cat ? "#1e293b" : "#fff",
                  color: categoryFilter === cat ? "#fff" : "#475569",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {displayProducts.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "16px",
              }}
            >
              {displayProducts.map((product) => (
                <div
                  key={`${product.item_code}-${product.category}`}
                  style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b", fontFamily: "monospace" }}>
                        {product.item_code}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            color: "#fff",
                            background:
                              product.category === "OIL"
                                ? "#f59e0b"
                                : product.category === "BEVERAGES"
                                ? "#3b82f6"
                                : "#1e3a5f",
                          }}
                        >
                          {product.category}
                        </span>
                        <button
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            fontSize: "1.25rem",
                            cursor: "pointer",
                            lineHeight: 1,
                            padding: 0,
                          }}
                          onClick={() => handleRemoveProduct(product)}
                          title="Remove Product"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "#0f172a", marginBottom: "4px", lineHeight: 1.4 }}>
                      {product.item_name}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                      {product.brand || "-"} • {product.variety || "-"} • {product.sal_pack_unit || "-"}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: "16px",
                      paddingTop: "12px",
                      borderTop: "1px solid #f1f5f9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Basic Rate</div>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#16a34a" }}>
                        ₹{Number(product.basic_rate || 0).toFixed(2)}
                      </div>
                    </div>
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                      onClick={() => handleEditRate(product)}
                    >
                      Edit Rate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                background: "#f8fafc",
                borderRadius: "8px",
                border: "1px dashed #cbd5e1",
                color: "#64748b",
              }}
            >
              No products found for the selected filter.
            </div>
          )}
        </div>
      )}

      {/* Add Products Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>{modalTitle}</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedNewProducts([]);
                  setNewProductRates({});
                  setModalSearch("");
                }}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#64748b" }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
              <input
                type="text"
                placeholder="Search available products..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                style={{
                  width: "100%",
                  height: "var(--input-h, 40px)",
                  padding: "0 12px",
                  background: "rgba(248, 250, 252, 0.9)",
                  border: "1px solid #cbd5e1",
                  borderRadius: "var(--radius-sm, 8px)",
                  fontSize: "var(--font-ui, 13px)",
              color: "#0f172a",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px", background: "#f8fafc" }}>
              {filteredAvailable.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {filteredAvailable.map((product) => {
                    const isSelected = selectedNewProducts.some(
                      (p) => p.item_code === product.item_code && p.category === product.category
                    );
                    return (
                      <div
                        key={`${product.item_code}-${product.category}`}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          padding: "12px",
                          border: `1px solid ${isSelected ? "#bfdbfe" : "#e2e8f0"}`,
                          borderRadius: "8px",
                          cursor: "pointer",
                          background: isSelected ? "#eff6ff" : "#fff",
                        }}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedNewProducts(
                              selectedNewProducts.filter(
                                (p) => !(p.item_code === product.item_code && p.category === product.category)
                              )
                            );
                          } else {
                            setSelectedNewProducts([...selectedNewProducts, product]);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{
                            marginTop: "4px",
                            marginRight: "12px",
                            width: "16px",
                            height: "16px",
                            accentColor: "#2563eb",
                            pointerEvents: "none",
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                            {product.item_name}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                            {product.item_code} • {product.category}
                          </div>
                          {isSelected && (
                            <div style={{ marginTop: "12px" }} onClick={(e) => e.stopPropagation()}>
                              <label
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#475569",
                                  display: "block",
                                  marginBottom: "4px",
                                  fontWeight: 500,
                                }}
                              >
                                Basic Rate (₹)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={newProductRates[`${product.item_code}-${product.category}`] || ""}
                                onChange={(e) =>
                                  setNewProductRates((prev) => ({
                                    ...prev,
                                    [`${product.item_code}-${product.category}`]: e.target.value,
                                  }))
                                }
                                style={{
                                  width: "100%",
                                  height: "var(--input-h, 40px)",
                                  padding: "0 12px",
                                  background: "rgba(248, 250, 252, 0.9)",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "var(--radius-sm, 8px)",
                                  fontSize: "var(--font-ui, 13px)",
                              color: "#0f172a",
                                  outline: "none",
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#64748b" }}>
                  No products match your search
                </div>
              )}
            </div>

            <div
              style={{
                padding: "20px 24px",
                borderTop: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedNewProducts([]);
                  setNewProductRates({});
                  setModalSearch("");
                }}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 500,
                  color: "#475569",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={isSaving || selectedNewProducts.length === 0}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 500,
                  opacity: isSaving || selectedNewProducts.length === 0 ? 0.7 : 1,
                }}
              >
                {isSaving
                  ? "Saving..."
                  : selectedParties.length > 1
                  ? `Add ${selectedNewProducts.length} Products to ${selectedParties.length} Parties`
                  : `Add ${selectedNewProducts.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

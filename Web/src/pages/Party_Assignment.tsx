import { useEffect, useState } from "react";
import { userService } from "../services/userService";
import type { User } from "../services/userService";
import { sapService } from "../services/sapService";
import type { Party } from "../services/sapService";
import "../styles/Party_Assignment.css";

type SearchableParty = Party & {
  CardCode?: string | number | null;
  CardName?: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();
const normalizeSearch = (value: unknown) =>
  asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const getPartyCode = (party: SearchableParty) => asText(party.card_code || party.CardCode);
const getPartyName = (party: SearchableParty) => asText(party.card_name || party.CardName);
const getPartyCategory = (party: SearchableParty) => asText(party.category);
const normalizeCategory = (value: unknown) => asText(value).toUpperCase();
const getPartySelectionKey = (party: SearchableParty) =>
  `${getPartyCode(party)}||${normalizeCategory(getPartyCategory(party))}`;
const getPartyKey = (party: SearchableParty) =>
  [getPartyCode(party), asText(party.category), asText(party.id)].filter(Boolean).join("-");

const getUserCategory = (user?: User) => {
  const category = user?.category;
  if (!category) return "";
  if (typeof category === "string" || typeof category === "number") return asText(category);
  return asText(category.category);
};

const isPartyInUserCategory = (party: Party, userCategory: string) =>
  !userCategory || normalizeSearch(party.category) === normalizeSearch(userCategory);

const getSelectionFromKey = (key: string) => {
  const [cardCode, category = ""] = key.split("||");
  return {
    card_code: cardCode,
    category: category || null,
  };
};

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

export default function Party_Assignment() {
  const [users, setUsers] = useState<User[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isPartiesLoading, setIsPartiesLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<number | "">("");
  const [showParties, setShowParties] = useState(false);
  const [search, setSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  // const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchParties();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await userService.getUsers();
      const data2 = data.data.filter(
        (u: any) =>
          u.role_id === 2 ||
          u.role_id === 4 ||
          Number(u.role) === 2 ||
          Number(u.role) === 4 ||
          u.role?.toLowerCase() === "manager" ||
          u.role?.toLowerCase() === "billing",
      );
      setUsers(data2);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchParties = async () => {
    setIsPartiesLoading(true);
    try {
      const data = await sapService.getParties();
      setParties(mergeParties(getPartyList(data)));
    } catch (error) {
      console.error("Error fetching parties:", error);
      setParties([]);
    } finally {
      setIsPartiesLoading(false);
    }
  };

  const fetchUserParties = async (userId: number) => {
    try {
      const res = await userService.getUserParties(userId);

      const userCategory = getUserCategory(users.find((user) => user.id === userId));
      const assigned = (res.data?.parties || [])
        .filter((p: any) => isPartyInUserCategory(p, userCategory))
        .map((p: any) => asText(p.party_key) || getPartySelectionKey(p));
          console.log("Assigned parties for user", userId, assigned);

      setSelectedParties(assigned);
    } catch (err) {
      console.error("Error fetching assigned parties", err);
    }
  };

  const selectedUserRecord = users.find((user) => user.id === selectedUser);
  const selectedUserCategory = getUserCategory(selectedUserRecord);
  const partyOptions = parties.filter((party) => isPartyInUserCategory(party, selectedUserCategory));
  const partySearchTerm = normalizeSearch(search);
  const visibleParties = partyOptions.filter((party) => {
    if (!partySearchTerm) return true;

    const searchableText = [
      getPartyName(party),
      getPartyCode(party),
      party.state,
      party.main_group,
      getPartyCategory(party),
    ].map(normalizeSearch).join(" ");

    return partySearchTerm
      .split(" ")
      .every((term) => searchableText.includes(term));
  });
  const visiblePartyKeys = visibleParties.map(getPartySelectionKey);

  const filteredUsers = users.filter((user) =>
    normalizeSearch(user.name).includes(normalizeSearch(userSearch)),
  );

 const handleSave = async () => {
  try {
    if (!selectedUser) {
      alert("Please select user");
      return;
    }

   
    const selectedPartySelections = selectedParties.map(getSelectionFromKey);
    const selectedPartyCodes = [...new Set(selectedPartySelections.map((party) => party.card_code))];

    const res = await userService.assignPartiesToUser(
      Number(selectedUser),
      selectedPartyCodes,
      selectedPartySelections,
    );

    console.log("API Response:", res);

    alert("Parties saved successfully ✅");

    // close dropdown
    setShowParties(false);

    // reload assigned parties
    fetchUserParties(Number(selectedUser));

  } catch (error) {
    console.error("Error saving parties:", error);
    alert("Failed to save ❌");
  }
};

const handleDel =  async (partyKey: string) => {
  try {
    if (!selectedUser) return;

    console.log("Removing party", partyKey, "from user", selectedUser);

    const newParties = selectedParties.filter((p) => p !== partyKey);
    const selectedPartySelections = newParties.map(getSelectionFromKey);
    const selectedPartyCodes = [...new Set(selectedPartySelections.map((party) => party.card_code))];
    await userService.assignPartiesToUser(
      Number(selectedUser),
      selectedPartyCodes,
      selectedPartySelections,
    );

    alert("Party removed ✅");

     fetchUserParties(Number(selectedUser));

  } catch (error) {
    console.error(error);
    alert("Failed ❌");
  }
};

  return (
    <div className="pa-page app-page">

      {!showParties && (
        <div 
          className="pa-card" 
          style={{ 
            background: '#fff', 
            borderRadius: '12px', 
            padding: '24px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)', 
            marginBottom: '24px' 
          }}
        >
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Party Assignment</h1>
            {/* <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Search and select a user to manage their assigned parties.</p> */}
          </div>

          <div style={{ position: 'relative', maxWidth: '400px', zIndex: 10 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#334155', marginBottom: '8px' }}>
              User Search
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Type name to search..."
                style={{ 
                  width: '100%', 
                  height: 'var(--input-h, 40px)',
                  padding: '0 12px',
                  background: 'rgba(248, 250, 252, 0.9)',
                  border: '1px solid #cbd5e1', 
                  borderRadius: 'var(--radius-sm, 8px)', 
                  fontSize: 'var(--font-ui, 13px)', 
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
            </div>

            {showDropdown && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                left: 0, 
                right: 0, 
                marginTop: '4px', 
                background: '#fff', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px', 
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                maxHeight: '250px', 
                overflowY: 'auto' 
              }}>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => {
                        setSelectedUser(user.id);
                        setUserSearch(user.name);
                        setShowDropdown(false);
                        fetchUserParties(user.id);
                      }}
                    >
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>{user.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user.role || 'Unknown Role'}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '10px 14px', color: '#64748b' }}>No users found</div>
                )}
              </div>
            )}
          </div>

          {selectedUser && (
            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Assigned Parties</h3>
                  <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>
                    <strong>{[...new Set(selectedParties)].length}</strong> parties assigned to <strong>{selectedUserRecord?.name}</strong>
                    {selectedUserCategory && <> in <strong>{selectedUserCategory}</strong></>}
                  </p>
                </div>
                <button
                  style={{ 
                    background: '#2563eb', 
                    color: '#fff', 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    border: 'none', 
                    fontWeight: 500, 
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
                  }}
                  onClick={() => {
                    setSearch("");
                    setShowParties(true);
                    if (parties.length === 0) fetchParties();
                  }}
                >
                  + Assign New Parties
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {(selectedParties || []).length > 0 ? (
                  [...new Set(selectedParties)].map((partyKey) => {
                    const party = partyOptions.find((p) => getPartySelectionKey(p) === partyKey);
                    return party ? (
                      <div key={getPartyKey(party)} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start', 
                        background: '#f8fafc', 
                        padding: '14px 16px', 
                        borderRadius: '8px', 
                        border: '1px solid #e2e8f0' 
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{getPartyName(party)}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                            {[getPartyCode(party), party.state, getPartyCategory(party)].filter(Boolean).join(" • ")}
                          </div>
                        </div>
                        <button
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#ef4444', 
                            fontSize: '1.25rem', 
                            cursor: 'pointer', 
                            padding: '0 4px', 
                            lineHeight: 1,
                            opacity: 0.7 
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                          onClick={() => handleDel(getPartySelectionKey(party))}
                          title="Remove Party"
                        >
                          ×
                        </button>
                      </div>
                    ) : null;
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b', border: '1px dashed #cbd5e1' }}>
                    No parties assigned to this user yet. Click "Assign New Parties" to get started.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showParties && (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Assign Parties</h2>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '4px 0 0' }}>
                Select multiple {selectedUserCategory && <strong>{selectedUserCategory} </strong>}parties to map to <strong>{selectedUserRecord?.name}</strong>
              </p>
            </div>
            <button
              style={{ 
                background: '#fff', 
                border: '1px solid #cbd5e1', 
                padding: '8px 16px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 500,
                color: '#334155'
              }}
              onClick={() => setShowParties(false)}
            >
              ← Back
            </button>
          </div>

          <div style={{ marginBottom: '16px', maxWidth: '500px' }}>
            <input
              type="text"
              placeholder="Search party by name or code..."
              style={{ 
                width: '100%', 
                padding: '10px 14px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '8px', 
                fontSize: '0.95rem', 
                outline: 'none',
                boxSizing: 'border-box'
              }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            key={`party-list-${partySearchTerm}-${visibleParties.length}`}
            style={{ 
            maxHeight: '400px', 
            overflowY: 'auto', 
            border: '1px solid #e2e8f0', 
            borderRadius: '8px', 
            background: '#f8fafc' 
          }}
          >
            {!isPartiesLoading && visibleParties.length > 0 && (
              <label 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '14px 16px', 
                  borderBottom: '2px solid #cbd5e1', 
                  cursor: 'pointer', 
                  background: '#f1f5f9', 
                  margin: 0,
                  position: 'sticky',
                  top: 0,
                  zIndex: 10
                }}
              >
                <input
                  type="checkbox"
                  style={{ marginRight: '16px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
                  checked={visibleParties.length > 0 && visiblePartyKeys.every((key) => selectedParties.includes(key))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newKeys = visiblePartyKeys.filter(key => !selectedParties.includes(key));
                      setSelectedParties([...selectedParties, ...newKeys]);
                    } else {
                      setSelectedParties(selectedParties.filter(key => !visiblePartyKeys.includes(key)));
                    }
                  }}
                />
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>
              Select All ({visiblePartyKeys.filter((key) => selectedParties.includes(key)).length}/{visibleParties.length})
            </div>
              </label>
            )}
            {isPartiesLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>Loading parties...</div>
            ) : visibleParties.length > 0 ? (
              visibleParties.map((party) => {
                const partyCode = getPartyCode(party);
                const partyName = getPartyName(party);
                const partyKey = getPartySelectionKey(party);

                return (
                <label 
                  key={getPartyKey(party)} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '14px 16px', 
                    borderBottom: '1px solid #e2e8f0', 
                    cursor: 'pointer', 
                    background: selectedParties.includes(partyKey) ? '#eff6ff' : '#fff', 
                    transition: 'background 0.2s',
                    margin: 0
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: '16px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2563eb' }}
                    checked={selectedParties.includes(partyKey)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedParties([...selectedParties, partyKey]);
                      } else {
                        setSelectedParties(selectedParties.filter((key) => key !== partyKey));
                      }
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '0.95rem' }}>
                      {partyName || "Unnamed party"}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>
                      {[partyCode, party.state, getPartyCategory(party)].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                </label>
              );
            })
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>No matching parties found</div>
            )}
          </div>

          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
            <button
              style={{ 
                background: '#fff', 
                border: '1px solid #cbd5e1', 
                padding: '10px 20px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 500, 
                color: '#475569' 
              }}
              onClick={() => setShowParties(false)}
            >
              Cancel
            </button>
            <button
              style={{ 
                background: '#2563eb', 
                color: '#fff', 
                padding: '10px 20px', 
                borderRadius: '8px', 
                border: 'none', 
                fontWeight: 500, 
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
              }}
              onClick={handleSave}
            >
          Save Assignments ({[...new Set(selectedParties)].length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

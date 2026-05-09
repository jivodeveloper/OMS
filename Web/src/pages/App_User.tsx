import { useState, useEffect, useRef } from "react";
import { userService } from "../services/userService";
import type { User, Option, CreateUserData, CategoryOption } from "../services/userService";
import "../styles/App_User.css";
import {
  HiAtSymbol,
  HiBuildingOffice2,
  HiEnvelope,
  HiLockClosed,
  HiMapPin,
  HiPencilSquare,
  HiPhone,
  HiShieldCheck,
  HiTag,
  HiUser,
  HiUserGroup,
} from "react-icons/hi2";

export default function App_User() {

  const stateRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [mainGroup, setMainGroup] = useState<Option[]>([]);
  const [state, setState] = useState<Option[]>([]);
  const [role, setRole] = useState<Option[]>([]);
  const [company, setCompany] = useState<Option[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState<CreateUserData>({
    name: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    mainGroup: 0,
    mainGroups: [],
    state: 0,
    states: [],
    role: 0,
    company: 0,
    category: null,
  });
  const [showForm, setShowForm] = useState(false);
  const [showUsers, setShowUsers] = useState(true);
  const [mgDropdownOpen, setMgDropdownOpen] = useState(false);
  const [stDropdownOpen, setStDropdownOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const [isEditMode, setIsEditMode] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchMainGroup();
    fetchState();
    fetchRole();
    fetchCompany();
    fetchCategories();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        stateRef.current &&
        !stateRef.current.contains(event.target as Node)
      ) {
        setStDropdownOpen(false);
      }

      if (
        groupRef.current &&
        !groupRef.current.contains(event.target as Node)
      ) {
        setMgDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await userService.getUsers();
      setUsers(data.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchMainGroup = async () => {
    try {
      let data2 = await userService.getMainGroup();
      setMainGroup(data2);
    } catch (error) {
      console.log("Error fetching main group:", error);
    }
  };

  const fetchState = async () => {
    try {
      let data3 = await userService.getState();
      setState(data3);
    } catch (error) {
      console.log("Error fetching State:", error);
    }
  };

  const fetchRole = async () => {
    try {
      let data4 = await userService.getRole();
      setRole(data4);

    } catch (error) {
      console.log("Error fetching User Role:", error);
    }
  };

  const fetchCompany = async () => {
    try {
      let data5 = await userService.getCompany();
      setCompany(data5);
    } catch (error) {
      console.log("Error fetching Company:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await userService.getCategories();
      setCategories(data);
    } catch (error) {
      console.log("Error fetching Category:", error);
    }
  };

  const toggleMainGroup = (id: number) => {
    setFormData((prev) => {
      const current = prev.mainGroups || [];
      const isSelected = current.includes(id);
      const updated = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
      return {
        ...prev,
        mainGroup: isSelected ? updated[0] || 0 : id,
        mainGroups: updated,
      };
    });
  };

  const toggleAllMainGroups = () => {
    setFormData((prev) => {
      const allSelected = (prev.mainGroups || []).length === mainGroup.length;
      const updated = allSelected ? [] : mainGroup.map((g) => g.id);
      return {
        ...prev,
        mainGroup: updated[0] || 0,
        mainGroups: updated,
      };
    });
  };

  const toggleState = (id: number) => {
    setFormData((prev) => {
      const current = prev.states || [];
      const isSelected = current.includes(id);
      const updated = current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id];
      return {
        ...prev,
        state: isSelected ? updated[0] || 0 : id,
        states: updated,
      };
    });
  };

  const toggleAllStates = () => {
    setFormData((prev) => {
      const allSelected = (prev.states || []).length === state.length;
      const updated = allSelected ? [] : state.map((s) => s.id);
      return { ...prev, state: updated[0] || 0, states: updated };
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "role"
          ? (value === "" ? 0 : Number(value))
          : name === "company" || name === "category"
            ? (value === "" ? null : Number(value))
            : value,
    }));
  };

  const getCreateUserErrorMessage = (source: any) => {
    const responseData = source?.response?.data || source;
    const errorBag = responseData?.errors || {};

    const errorsToScan = Object.keys(errorBag).length > 0 ? errorBag : responseData;

    if (errorsToScan && typeof errorsToScan === "object" && !Array.isArray(errorsToScan)) {
      const usernameError = errorsToScan.username?.[0] || (typeof errorsToScan.username === "string" ? errorsToScan.username : null);
      const emailError = errorsToScan.email?.[0] || (typeof errorsToScan.email === "string" ? errorsToScan.email : null);
      const passwordError = errorsToScan.password?.[0] || (typeof errorsToScan.password === "string" ? errorsToScan.password : null);
      const nonFieldError = errorsToScan.non_field_errors?.[0];

      const isDuplicate = (val: any) => {
        const msg = String(val || "").toLowerCase();
        return msg.includes("already exist") || msg.includes("duplicate") || msg.includes("already taken");
      };

      if (isDuplicate(usernameError) && isDuplicate(emailError)) {
        return "Username and email already exist.";
      }
      if (isDuplicate(usernameError)) return "Username already exists.";
      if (isDuplicate(emailError)) return "Email already exists.";

      if (passwordError) return `Password: ${passwordError}`;
      if (usernameError) return `Username: ${usernameError}`;
      if (emailError) return `Email: ${emailError}`;
      if (nonFieldError) return String(nonFieldError);

      // Dynamically extract any other field error (e.g., phone, name)
      for (const [key, value] of Object.entries(errorsToScan)) {
        if (key !== "message" && key !== "error" && key !== "detail" && key !== "success") {
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
            const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
            return `${fieldName}: ${value[0]}`;
          }
        }
      }
    }

    if (typeof responseData?.message === "string" && responseData.message) return responseData.message;
    if (typeof responseData?.error === "string" && responseData.error) return responseData.error;
    if (typeof responseData?.detail === "string" && responseData.detail) return responseData.detail;

    return typeof responseData === "string" && responseData.trim() !== ""
      ? responseData
      : "Something went wrong while creating the user.";
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      let result;

      if (isEditMode && editUserId) {
        result = await userService.updateUser(editUserId, formData);
      } else {
        result = await userService.createUser(formData);
      }

      if (result.success) {
        alert(isEditMode ? "User Updated ✅" : "User Added ✅");

        setFormData({
          name: "",
          username: "",
          password: "",
          email: "",
          phone: "",
          mainGroup: 0,
          mainGroups: [],
          state: 0,
          states: [],
          role: 0,
          company: 0,
          category: null,
        });

        setIsEditMode(false);
        setEditUserId(null);

        fetchUsers();
        setShowForm(false);
        setShowUsers(true);
      } else {
        alert("Error: " + getCreateUserErrorMessage(result));
      }
    } catch (error: any) {
      alert("Error: " + getCreateUserErrorMessage(error));
    }
  };

  const handleEditUser = (user: User) => {
    setIsEditMode(true);
    setEditUserId(user.id);

    const getId = (value: unknown) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") return Number(value) || 0;
      if (value && typeof value === "object" && "id" in value) {
        return Number((value as { id?: number | string }).id) || 0;
      }
      return 0;
    };
    const getIds = (values: unknown) =>
      Array.isArray(values) ? values.map(getId).filter(Boolean) : [];
    const editableUser = user as User & {
      main_group?: unknown;
      main_groups?: unknown;
      state?: unknown;
      states?: unknown;
      company?: unknown;
      category?: unknown;
      role?: unknown;
      role_display?: string;
    };
    const mainGroupIds = getIds(editableUser.main_groups);
    const stateIds = getIds(editableUser.states);
    const roleName = String(
      editableUser.role || editableUser.role_name || editableUser.role_display || "",
    ).toLowerCase();
    const roleId =
      getId(editableUser.role) ||
      role.find((r) => r.name.toLowerCase() === roleName)?.id ||
      0;

    setFormData({
      name: user.name || "",
      username: user.username || "",
      password: "",
      email: user.email || "",
      phone: user.phone || "",
      mainGroup: getId(editableUser.main_group) || mainGroupIds[0] || 0,
      mainGroups: mainGroupIds,
      state: getId(editableUser.state) || stateIds[0] || 0,
      states: stateIds,
      role: roleId,
      company: getId(editableUser.company) || null,
      category: getId(editableUser.category) || null,
    });

    setShowForm(true);
    setShowUsers(false);
  };

  return (
    <div className="au-page app-page">
      {/* ── PAGE HEADER ── */}
      <div className="au-header app-page-head" style={{ marginBottom: '24px', alignItems: 'center' }}>
        <div>
          <h1 className="au-title app-page-title">
            {showForm ? (isEditMode ? "Update User" : "Add New User") : "App Users"}
          </h1>
          <p className="au-subtitle app-page-subtitle" style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            {showForm ? (isEditMode ? "Update application user details, role, territory mapping and company assignment." : "Create application users with roles, territory mapping and company assignment.") : "Manage user access, review account status and keep operational roles aligned."}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {!showForm && (
            <span className="au-table-count" style={{ margin: 0 }}>
              Total: {users.length}
            </span>
          )}
          <button
            className="au-toggle-btn"
            onClick={() => {
            setShowForm(!showForm);
            setShowUsers(showForm);
          }}
        >
          <span>{showForm ? "← Back to Users" : "+ Add User"}</span>
          </button>
        </div>
      </div>

      {/* ── USERS TABLE ── */}
      {showUsers && (
        <div className="au-table-card">
            {users.length > 0 ? (
              <div className="au-table-wrap">
                <table className="au-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Edit User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users
                        .slice(
                          (currentPage - 1) * itemsPerPage,
                          currentPage * itemsPerPage,
                        )
                        .map((user) => (
                          <tr key={user.id}>
                            <td className="au-muted">{user.id}</td>
                            <td className="au-name">{user.name}</td>
                            <td>{user.email}</td>
                            <td>{user.role}</td>
                            <td>
                              <span
                                className={
                                  user.is_active ? "au-active" : "au-inactive"
                                }
                              >
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="ao-btn-icon edit"
                                onClick={() => {
                                  handleEditUser(user);
                                  setShowForm(true);
                                  setShowUsers(false);
                                }} title="Edit User"
                              >
                                <HiPencilSquare size={22} />
                              </button>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", margin: "20px 0" }}>No users found</div>
            )}

          {users.length > itemsPerPage && (
            <div className="au-pagination">
              <button
                className="au-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ← Prev
              </button>

              <span className="au-pg-info">
                {currentPage} / {Math.ceil(users.length / itemsPerPage)}
              </span>

              <button
                className="au-pg-btn"
                disabled={
                  currentPage === Math.ceil(users.length / itemsPerPage)
                }
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── ADD USER FORM ── */}
      {showForm && (
        <div className="au-form-card">
          <div className="au-form-head" style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              {isEditMode ? "Update User Details" : "User Details"}
            </h2>
            {/* <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              {isEditMode
                ? "Update credentials, role and mapping information."
                : "Fill in credentials, role and mapping information."}
            </p> */}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="au-form-grid">
              <div className="au-field">
                <label className="au-label">Full Name</label>
                <div className="au-input-wrap au-has-icon">
                  <HiUser className="au-field-icon" aria-hidden="true" />
                  <input
                    type="text"
                    name="name"
                    placeholder="Name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field">
                <label className="au-label">Username</label>
                <div className="au-input-wrap au-has-icon">
                  <HiAtSymbol className="au-field-icon" aria-hidden="true" />
                  <input
                    type="text"
                    name="username"
                    placeholder="Username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field">
                <label className="au-label">Password</label>
                <div className="au-input-wrap au-has-icon">
                  <HiLockClosed className="au-field-icon" aria-hidden="true" />
                  <input
                    className="au-password-input"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    required={!isEditMode}
                  />
                  <button
                    type="button"
                    className="au-eye-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 3l18 18M10.477 10.477A3 3 0 0013.5 13.5M6.228 6.228A10.45 10.45 0 002.458 12C3.732 16.057 7.523 19 12 19c1.7 0 3.3-.425 4.7-1.175M9.756 4.82A9.568 9.568 0 0112 4.5c4.478 0 8.268 2.943 9.542 7a10.49 10.49 0 01-1.552 3.145"
                        />
                      </svg>
                    ) : (
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field">
                <label className="au-label">Email Address</label>
                <div className="au-input-wrap au-has-icon">
                  <HiEnvelope className="au-field-icon" aria-hidden="true" />
                  <input
                    type="email"
                    name="email"
                    placeholder="abc@gmail.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field">
                <label className="au-label">Contact No.</label>
                <div className="au-input-wrap au-has-icon">
                  <HiPhone className="au-field-icon" aria-hidden="true" />
                  <input
                    type="tel"
                    name="phone"
                    maxLength={10}
                    placeholder="10-digit number"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                  />
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field" ref={groupRef}>
                <label className="au-label">Main Group</label>
                <div className="au-mg-dropdown">
                  <div
                    className="au-mg-trigger"
                    onClick={() => setMgDropdownOpen((v) => !v)}
                  >
                    <span className="au-trigger-label">
                      <HiUserGroup className="au-field-icon" aria-hidden="true" />
                      <span>
                        {(formData.mainGroups?.length || 0) === 1
                          ? mainGroup.find((g) => g.id === formData.mainGroups![0])
                            ?.name || "1 selected"
                          : (formData.mainGroups?.length || 0) > 1
                            ? `${formData.mainGroups!.length} selected`
                            : "Select Main Group"}
                      </span>
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
                  </div>
                  {mgDropdownOpen && (
                    <div className="au-mg-menu">
                      <label className="au-mg-option au-mg-selectall">
                        <input
                          type="checkbox"
                          checked={
                            mainGroup.length > 0 &&
                            formData.mainGroups?.length === mainGroup.length
                          }
                          onChange={toggleAllMainGroups}
                        />
                        Select All
                      </label>
                      {mainGroup.map((g) => (
                        <label key={g.id} className="au-mg-option">
                          <input
                            type="checkbox"
                            checked={
                              formData.mainGroups?.includes(g.id) || false
                            }
                            onChange={() => toggleMainGroup(g.id)}
                          />
                          {g.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="au-field" ref={stateRef}>
                <label className="au-label">State</label>
                <div className="au-mg-dropdown">
                  <div
                    className="au-mg-trigger"
                    onClick={() => setStDropdownOpen((v) => !v)}
                  >
                    <span className="au-trigger-label">
                      <HiMapPin className="au-field-icon" aria-hidden="true" />
                      <span>
                        {(formData.states?.length || 0) === 1
                          ? state.find((s) => s.id === formData.states![0])?.name ||
                          "1 selected"
                          : (formData.states?.length || 0) > 1
                            ? `${formData.states!.length} selected`
                            : "Select State"}
                      </span>
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
                  </div>
                  {stDropdownOpen && (
                    <div className="au-mg-menu">
                      <label className="au-mg-option au-mg-selectall">
                        <input
                          type="checkbox"
                          checked={
                            state.length > 0 &&
                            formData.states?.length === state.length
                          }
                          onChange={toggleAllStates}
                        />
                        Select All
                      </label>
                      {state.map((s) => (
                        <label key={s.id} className="au-mg-option">
                          <input
                            type="checkbox"
                            checked={formData.states?.includes(s.id) || false}
                            onChange={() => toggleState(s.id)}
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="au-field">
                <label className="au-label">User Role</label>
                <div className="au-input-wrap au-has-icon">
                  <HiShieldCheck className="au-field-icon" aria-hidden="true" />

                  <select
                    name="role"
                    value={formData.role || ""}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Role</option>
                    {role.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field au-full">
                <label className="au-label">Company</label>
                <div className="au-input-wrap au-has-icon">
                  <HiBuildingOffice2 className="au-field-icon" aria-hidden="true" />
                  <select
                    name="company"
                    value={formData.company ?? ""}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Company</option>
                    {company.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="au-focus-line" />
                </div>
              </div>
              <div className="au-field au-full">
                <label className="au-label">Category</label>
                <div className="au-input-wrap au-has-icon">
                  <HiTag className="au-field-icon" aria-hidden="true" />
                  <select
                    name="category"
                    value={formData.category ?? ""}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.category}
                      </option>
                    ))}
                  </select>
                  <div className="au-focus-line" />
                </div>
              </div>
            </div>

            <button type="submit" className="au-submit">
              <span>{isEditMode ? "Update User" : "Create User"}</span>
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
                style={{
                  width: "13px",
                  height: "13px",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

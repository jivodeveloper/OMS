import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCurrentUser } from "../services/authService";
import api from "../services/api";
import "../styles/Dashboard.css";

interface KPIData {
  total_orders: number;
  total_revenue: string;
  today_orders: number;
  this_month_orders: number;
  status_counts: Record<string, number>;
  user_counts: Record<string, number>;
  accepted_orders?: number;
  rejected_orders?: number;
  pending_review_orders?: number;
  reviewed_orders?: number;
}

interface ChartsData {
  monthly_sales: { month: string; label: string; revenue: number; count: number }[];
  statewise_orders: { state: string; orders: number }[];
  status_distribution: { status: string; label: string; count: number }[];
  top_parties: { card_code: string; card_name: string; count: number; revenue: number }[];
  category_sales: { category: string; total_sales: number; count: number }[];
}

interface CurrentUser {
  role?: string;
  username?: string;
  full_name?: string;
  name?: string;
}

type SupportedRole = "admin" | "auditor" | "manager" | "billing";
type TopPartyView = "all" | 5 | 10;

const PALETTE = ["#0f766e", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#4f46e5", "#ea580c"];
const TOP_PARTY_VIEW_OPTIONS: Array<{ label: string; value: TopPartyView }> = [
  { label: "All", value: "all" },
  { label: "Top 5", value: 5 },
  { label: "Top 10", value: 10 },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, index) => currentYear - index);

const fmt = (n: number | string) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtCurrency = (n: number | string) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const roleContent: Record<SupportedRole, { title: string; subtitle: string; focus: string; accent: string }> = {
  admin: {
    title: "Welcome",
    subtitle: "Platform-wide sales, orders and team performance at a glance.",
    focus: "System overview",
    accent: "Admin control center",
  },
  auditor: {
    title: "Welcome",
    subtitle: "Track received orders, audit value, accepted decisions and pending review workload.",
    focus: "Audit visibility",
    accent: "Review and exception tracking",
  },
  manager: {
    title: "Welcome",
    subtitle: "Monitor sales output, order progress and daily execution for your territory.",
    focus: "Field performance",
    accent: "Sales execution snapshot",
  },
  billing: {
    title: "Welcome",
    subtitle: "Track billing-stage orders, invoicing workload and order value ready for processing.",
    focus: "Billing operations",
    accent: "Invoice and billing queue",
  },
};

const normalizeRole = (role?: string): SupportedRole => {
  const value = role?.toLowerCase();
  if (value === "admin" || value === "auditor" || value === "manager" || value === "billing") {
    return value;
  }
  return "manager";
};

const EMPTY_KPI: KPIData = {
  total_orders: 0,
  total_revenue: "0",
  today_orders: 0,
  this_month_orders: 0,
  status_counts: {},
  user_counts: {},
};

const EMPTY_CHARTS: ChartsData = {
  monthly_sales: [],
  statewise_orders: [],
  status_distribution: [],
  top_parties: [],
  category_sales: [],
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [charts, setCharts] = useState<ChartsData | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(currentYear);
  const [topPartyView, setTopPartyView] = useState<TopPartyView>(5);

  const isUnauthorized = (result: PromiseSettledResult<unknown>) =>
    result.status === "rejected" &&
    (result.reason?.response?.status === 401 || result.reason?.status === 401);

  useEffect(() => {
    void fetchData(year, true);
  }, [year]);

  const hasVisibleData = (nextKpi: KPIData, nextCharts: ChartsData) => {
    if ((nextKpi.total_orders ?? 0) > 0) {
      return true;
    }

    return (nextCharts.monthly_sales ?? []).some(
      (item) => (item.count ?? 0) > 0 || (item.revenue ?? 0) > 0
    );
  };

  const fetchData = async (selectedYear: number, allowFallback = false) => {
    setLoading(true);
    setError("");

    try {
      const [profileRes, kpiRes, chartsRes] = await Promise.allSettled([
        getCurrentUser(),
        api.get(`/orders/dashboardW/?year=${selectedYear}`),
        api.get(`/orders/dashboardW/charts/?line_year=${selectedYear}&year=${selectedYear}&month=0`),
      ]);

      if (isUnauthorized(profileRes) || isUnauthorized(kpiRes) || isUnauthorized(chartsRes)) {
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        navigate("/");
        return;
      }

      if (profileRes.status === "fulfilled") {
        setUser(profileRes.value);
      }

      const nextKpi = kpiRes.status === "fulfilled" ? { ...EMPTY_KPI, ...kpiRes.value.data } : EMPTY_KPI;
      const nextCharts = chartsRes.status === "fulfilled" ? { ...EMPTY_CHARTS, ...chartsRes.value.data } : EMPTY_CHARTS;

      if (allowFallback && selectedYear === currentYear && !hasVisibleData(nextKpi, nextCharts)) {
        const fallbackYear = currentYear - 1;
        const [fallbackKpiRes, fallbackChartsRes] = await Promise.allSettled([
          api.get(`/orders/dashboardW/?year=${fallbackYear}`),
          api.get(`/orders/dashboardW/charts/?line_year=${fallbackYear}&year=${fallbackYear}&month=0`),
        ]);

        const fallbackKpi =
          fallbackKpiRes.status === "fulfilled" ? { ...EMPTY_KPI, ...fallbackKpiRes.value.data } : EMPTY_KPI;
        const fallbackCharts =
          fallbackChartsRes.status === "fulfilled"
            ? { ...EMPTY_CHARTS, ...fallbackChartsRes.value.data }
            : EMPTY_CHARTS;

        if (hasVisibleData(fallbackKpi, fallbackCharts)) {
          setYear(fallbackYear);
          setKpi(fallbackKpi);
          setCharts(fallbackCharts);
          return;
        }
      }

      setKpi(nextKpi);
      setCharts(nextCharts);

      if (kpiRes.status === "rejected" && chartsRes.status === "rejected") {
        setError("Unable to load dashboard data right now.");
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError("Unable to load dashboard data right now.");
    } finally {
      setLoading(false);
    }
  };

  const role = normalizeRole(user?.role);
  const roleMeta = roleContent[role];
  const isBilling = role === "billing";

  const activeStatus = useMemo(
    () => (charts?.status_distribution ?? []).filter((item) => item.count > 0),
    [charts?.status_distribution]
  );

  const topCategory = useMemo(() => {
    const [best] = [...(charts?.category_sales ?? [])].sort((a, b) => b.total_sales - a.total_sales);
    return best;
  }, [charts?.category_sales]);
  const topParties = useMemo(
    () =>
      (charts?.top_parties ?? [])
        .filter((item) => (item.count ?? 0) > 0 || (item.revenue ?? 0) > 0),
    [charts?.top_parties]
  );
  const visibleTopParties = useMemo(
    () => (topPartyView === "all" ? topParties : topParties.slice(0, topPartyView)),
    [topParties, topPartyView]
  );
  const topParty = topParties[0];

  const monthlySales = charts?.monthly_sales ?? [];
  const peakMonth = useMemo(() => {
    const [best] = [...monthlySales].sort((a, b) => b.revenue - a.revenue);
    return best;
  }, [monthlySales]);

  const acceptedCount = activeStatus
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return ["approved", "accepted", "completed", "delivered"].some((value) => statusValue.includes(value));
    })
    .reduce((sum, item) => sum + item.count, 0);
  const rejectedCount = activeStatus
    .filter((item) => {
      const statusValue = `${item.status} ${item.label}`.toLowerCase();
      return ["rejected", "declined", "cancelled", "canceled"].some((value) => statusValue.includes(value));
    })
    .reduce((sum, item) => sum + item.count, 0);

  // Billing-specific counts derived from status_counts (more accurate than keyword matching)
  const statusCounts = kpi?.status_counts ?? {};
  const billingRejectedCount = Object.entries(statusCounts).reduce(
    (sum, [key, val]) => key.toLowerCase().includes("billing rejected") ? sum + val : sum, 0
  );
  const billingQueueCount = Object.entries(statusCounts).reduce((sum, [key, val]) => {
    const k = key.toLowerCase();
    return (k === "billing" || k === "billing pending") ? sum + val : sum;
  }, 0);
  const auditorAcceptedCount = kpi?.accepted_orders ?? 0;
  // rejected_orders from the API can undercount; cross-check with status_counts["Rejected"]
  const auditorRejectedCount = Math.max(
    kpi?.rejected_orders ?? 0,
    Object.entries(statusCounts).reduce(
      (sum, [key, val]) => key.toLowerCase() === "rejected" ? sum + val : sum, 0
    )
  );
  const auditorPendingCount = kpi?.pending_review_orders ?? 0;
  const auditorReviewedCount = kpi?.reviewed_orders ?? (auditorAcceptedCount + auditorRejectedCount);
  const billingHandledCount = acceptedCount + rejectedCount;
  const totalOrders = kpi?.total_orders ?? 0;
  const billingPendingCount = Math.max(totalOrders - acceptedCount - rejectedCount, 0);
  const completionCount = role === "auditor" ? auditorAcceptedCount : role === "billing" ? billingHandledCount : acceptedCount;
  const completionRate = totalOrders > 0 ? Math.round((completionCount / totalOrders) * 100) : 0;
  const monthlyMomentum = totalOrders > 0 ? Math.round(((kpi?.this_month_orders ?? 0) / totalOrders) * 100) : 0;
  const reviewedRate = totalOrders > 0
    ? Math.round(((role === "auditor" ? auditorReviewedCount : acceptedCount + rejectedCount) / totalOrders) * 100)
    : 0;
  const outstandingOrders = role === "auditor"
    ? auditorPendingCount
    : Math.max(totalOrders - acceptedCount - rejectedCount, 0);
  const auditorDecisionChart = [
    { status: "accepted", label: "Accepted", count: auditorAcceptedCount },
    { status: "rejected", label: "Rejected", count: auditorRejectedCount },
    { status: "pending", label: "Pending Review", count: auditorPendingCount },
  ].filter((item) => item.count > 0);
  const billingDecisionChart = [
    { status: "accepted", label: "Accepted", count: acceptedCount },
    { status: "rejected", label: "Rejected", count: billingRejectedCount || rejectedCount },
    { status: "queue", label: "Pending", count: billingQueueCount || billingPendingCount },
  ].filter((item) => item.count > 0);
  const statusItems = role === "auditor" ? auditorDecisionChart : role === "billing" ? billingDecisionChart : activeStatus;

  const kpiConfig = {
    admin: [
      { icon: "₹", tone: "db-card--teal", label: "Total Sales", value: fmtCurrency(kpi?.total_revenue ?? 0), sub: `${year} revenue` },
      { icon: "⚡", tone: "db-card--dark", label: "This Month", value: fmt(kpi?.this_month_orders ?? 0), sub: "Monthly order momentum" },
      { icon: "🗓️", tone: "db-card--teal", label: "Today Orders", value: fmt(kpi?.today_orders ?? 0), sub: "Orders created today" },
    ],
    auditor: [
      { icon: "📥", tone: "db-card--teal", label: "Received Orders", value: fmt(kpi?.total_orders ?? 0), sub: "Orders assigned for audit review" },
      { icon: "🕒", tone: "db-card--blue", label: "Pending Review", value: fmt(outstandingOrders), sub: "Orders still awaiting decision" },
      { icon: "✅", tone: "db-card--dark", label: "Accepted Orders", value: fmt(auditorAcceptedCount), sub: "Orders accepted by auditor" },
    ],
    manager: [
      { icon: "₹", tone: "db-card--teal", label: "Total Sales", value: fmtCurrency(kpi?.total_revenue ?? 0), sub: `${year} revenue` },
      { icon: "📦", tone: "db-card--blue", label: "Completed  Orders", value: fmt(completionCount ?? 0), sub: "Across selected year" },
      { icon: "⚡", tone: "db-card--dark", label: "Today Orders", value: fmt(kpi?.today_orders ?? 0), sub: "Live operational pace" },
    ],
    billing: [
      { icon: "🕒", tone: "db-card--blue", label: "Pending Orders", value: fmt(billingQueueCount || billingPendingCount), sub: "Orders waiting in billing queue" },
      { icon: "📌", tone: "db-card--teal", label: "Handled Orders", value: fmt(billingHandledCount), sub: "Orders completed or rejected by billing" },
      { icon: "🗓️", tone: "db-card--blue", label: "Today Orders", value: fmt(kpi?.today_orders ?? 0), sub: "Billing orders updated today" },
    ],
  } satisfies Record<SupportedRole, { icon: string; tone: string; label: string; value: string; sub: string }[]>;

  const chartCopy = {
    admin: {
      salesTitle: `Monthly Sales Trend (${year})`,
      salesSubtitle: "Revenue movement across the selected year",
      statusTitle: `Order Status (${year})`,
      statusSubtitle: "Current mix of order stages",
      volumeTitle: `Monthly Order Volume (${year})`,
      volumeSubtitle: "How order count moves across the year",
      categoryTitle: `Category Sales (${year})`,
      categorySubtitle: "Revenue split by product category",
    },
    auditor: {
      salesTitle: `Monthly Audit Value (${year})`,
      salesSubtitle: "Received order value across the selected year",
      statusTitle: `Audit Decisions (${year})`,
      statusSubtitle: "Accepted, rejected and in-review mix",
      volumeTitle: `Monthly Orders Received (${year})`,
      volumeSubtitle: "Audit intake across the year",
      categoryTitle: `Category Value Under Review (${year})`,
      categorySubtitle: "Product categories covered in audit scope",
    },
    manager: {
      salesTitle: `Monthly Sales Trend (${year})`,
      salesSubtitle: "Revenue movement across the selected year",
      statusTitle: `Order Status (${year})`,
      statusSubtitle: "Current mix of order stages",
      volumeTitle: `Monthly Order Volume (${year})`,
      volumeSubtitle: "How order count moves across the year",
      categoryTitle: `Category Sales (${year})`,
      categorySubtitle: "Revenue split by product category",
    },
    billing: {
      salesTitle: `Monthly Billing Orders (${year})`,
      salesSubtitle: "Billing order movement across the selected year",
      statusTitle: `Billing Decisions (${year})`,
      statusSubtitle: "Accepted, rejected and queued billing orders",
      volumeTitle: `Monthly Billing Orders (${year})`,
      volumeSubtitle: "Billing-stage order volume across the year",
      categoryTitle: `Category Billing Orders (${year})`,
      categorySubtitle: "Billing orders split by product category",
    },
  } satisfies Record<SupportedRole, {
    salesTitle: string;
    salesSubtitle: string;
    statusTitle: string;
    statusSubtitle: string;
    volumeTitle: string;
    volumeSubtitle: string;
    categoryTitle: string;
    categorySubtitle: string;
  }>;

  if (loading) {
    return (
      <div className="db-loading">
        <div className="db-spinner" />
        Loading dashboard...
      </div>
    );
  }

  if (error && !kpi && !charts) {
    return (
      <div className="db-root">
        <div className="db-empty-state">
          <h2>Dashboard unavailable</h2>
          <p>{error}</p>
          <button className="db-retry-btn" onClick={() => void fetchData(year, true)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="db-root">
      <div className="db-hero">
        <div className="db-hero-main">
          <div className="db-header">
            <div>
              <h1 className="db-title">{roleMeta.title}</h1>
              <p className="db-subtitle">{roleMeta.subtitle}</p>
              <div className="db-hero-stats">
                <div className="db-hero-stat">
                  <span className="db-hero-stat-label">Selected year</span>
                  <strong>{year}</strong>
                </div>
                <div className="db-hero-stat">
                  <span className="db-hero-stat-label">View</span>
                  <strong>{roleMeta.focus}</strong>
                </div>
              </div>
            </div>
            <select
              className="db-year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {YEARS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="db-hero-summary">
            {/* <div className="db-hero-summary-item">
              <span>{isBilling ? "Handled" : "Revenue"}</span>
              <strong>{isBilling ? fmt(completionCount) : fmtCurrency(kpi?.total_revenue ?? 0)}</strong>
            </div> */}
            <div className="db-hero-summary-item">
              <span>Total Orders</span>
              <strong>{fmt(kpi?.total_orders ?? 0)}</strong>
            </div>
            <div className="db-hero-summary-item">
              <span>Peak Month</span>
              <strong>{peakMonth?.label ?? "N/A"}</strong>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="db-inline-alert">
          {error}
        </div>
      ) : null}

      <div className="db-kpi-row">
        {kpiConfig[role].map((item) => (
          <div className={`db-card ${item.tone}`} key={item.label}>
            <div className="db-card-icon">{item.icon}</div>
            <div className="db-card-label">{item.label}</div>
            <div className={`db-card-value ${item.label.toLowerCase().includes("sales") ? "db-card-value--sm" : ""}`}>{item.value}</div>
            <div className="db-card-sub">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="db-panel db-panel--overview">
        <div className="db-highlights-head">
          <div>
            <div className="db-panel-title">Visual Overview</div>
            <div className="db-highlights-subtitle">Quick chart summaries for {roleMeta.focus.toLowerCase()}</div>
          </div>
          <div className="db-highlights-badge">3 charts</div>
        </div>
        <div className="db-overview-grid">
          <div className="db-overview-card db-overview-card--pulse">
            <div className="db-overview-top db-overview-top--compact">
              <div>
                <div className="db-highlight-label">Top Parties</div>
                <div className="db-highlight-sub">
                  {topParty
                    ? `${topParty.card_name} leads with ${fmt(topParty.count)} orders`
                    : "No party data available"}
                </div>
              </div>
              <div className="db-segmented-control" role="tablist" aria-label="Top parties view">
                {TOP_PARTY_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`db-segmented-btn${topPartyView === option.value ? " is-active" : ""}`}
                    onClick={() => setTopPartyView(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {topParties.length === 0 ? (
              <div className="db-no-data" style={{ minHeight: 80 }}>No party data for this period</div>
            ) : (
              <div className="db-party-list db-party-list--spacious">
                {visibleTopParties.map((item, index) => (
                  <div key={item.card_code} className="db-party-list-item db-party-list-item--detailed">
                    <span
                      className="db-party-list-badge"
                      style={{ background: PALETTE[index % PALETTE.length] }}
                    >
                      {index + 1}
                    </span>
                    <div className="db-party-list-details">
                      <span className="db-party-list-name db-party-list-name--wrap">{item.card_name}</span>
                      <span className="db-party-list-code">{item.card_code}</span>
                    </div>
                    <span className="db-party-list-count db-party-list-count--detailed">
                      {fmt(item.count)} orders
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="db-overview-card db-overview-card--progress">
            <div className="db-overview-top">
              <div>
                <div className="db-highlight-label">
                  {role === "auditor" ? "Review Completion" : role === "manager" ? "Monthly Momentum" : role === "admin" ? "Order Throughput" : "Handling Progress"}
                </div>
                <div className="db-overview-hero">
                  {role === "auditor" ? fmt(auditorReviewedCount) : role === "manager" ? fmt(kpi?.this_month_orders ?? 0) : role === "admin" ? fmt(kpi?.this_month_orders ?? 0) : `${completionRate}%`}
                </div>
                <div className="db-highlight-sub">
                  {role === "auditor"
                    ? auditorReviewedCount > 0
                      ? `${fmt(auditorPendingCount)} pending review in ${year}`
                      : "No audit reviews completed yet"
                    : role === "manager"
                      ? (kpi?.this_month_orders ?? 0) > 0
                        ? `${fmt(kpi?.today_orders ?? 0)} created today in ${year}`
                        : "No orders created this month yet"
                    : role === "admin"
                      ? (kpi?.this_month_orders ?? 0) > 0
                        ? `${fmt(kpi?.today_orders ?? 0)} orders created today across the platform`
                        : "No order activity recorded this month yet"
                    : completionCount > 0
                      ? `${fmt(billingQueueCount || billingPendingCount)} still waiting in billing queue`
                      : "No handled orders yet"}
                </div>
              </div>
            </div>
            <div className="db-progress">
              <div className="db-progress-bar">
                <div className="db-progress-fill" style={{ width: `${role === "auditor" ? reviewedRate : role === "manager" || role === "admin" ? monthlyMomentum : completionRate}%` }} />
              </div>
              <div className="db-progress-meta">
                <span>
                  {role === "auditor"
                    ? `${fmt(auditorPendingCount)} pending`
                    : role === "manager"
                      ? `${fmt(kpi?.today_orders ?? 0)} today`
                      : role === "admin"
                        ? `${fmt(kpi?.today_orders ?? 0)} today`
                        : `${fmt(completionCount)} handled`}
                </span>
                <strong>
                  {role === "auditor"
                    ? `${fmt(auditorReviewedCount)} reviewed`
                    : role === "manager" || role === "admin"
                      ? `${fmt(totalOrders)} total`
                      : `${fmt(totalOrders)} total`}
                </strong>
              </div>
            </div>
          </div>

          <div className="db-overview-card db-overview-card--summary">
            <div className="db-highlight-label">{chartCopy[role].statusTitle}</div>
            <div className="db-highlight-sub">{chartCopy[role].statusSubtitle}</div>
            {statusItems.length === 0 ? (
              <div className="db-no-data">No data for this period</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie
                      data={statusItems}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={55}
                      innerRadius={32}
                    >
                      {statusItems.map((item, index) => (
                        <Cell key={item.status} fill={PALETTE[index % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="db-legend">
                  {statusItems.map((item, index) => (
                    <div key={item.status} className="db-legend-item">
                      <span className="db-legend-dot" style={{ background: PALETTE[index % PALETTE.length] }} />
                      <span className="db-legend-label">{item.label}</span>
                      <span className="db-legend-val">{item.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {!isBilling && (
      <div className="db-charts-row">
        <div className="db-chart-box db-chart-box--wide" style={{ gridColumn: "1 / -1" }}>
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">{chartCopy[role].salesTitle}</div>
              <div className="db-chart-subtitle">{chartCopy[role].salesSubtitle}</div>
            </div>
            <div className="db-chart-metric">
              <span>Peak Revenue</span>
              <strong>{peakMonth ? fmtCurrency(peakMonth.revenue) : "N/A"}</strong>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthlySales} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b6878" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#5b6878" }}
                tickFormatter={isBilling ? undefined : (v) => `₹${(v / 1000).toFixed(1)}k`}
                width={52}
              />
              <Tooltip formatter={(v) => isBilling ? [v, "Orders"] : [`₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Revenue"]} />
              <Area type="monotone" dataKey={isBilling ? "count" : "revenue"} stroke="#0f172a" strokeWidth={2} fill="url(#revGrad)" dot={{ r: 3, fill: "#0f766e" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>
      )}

      <div className="db-charts-row">
        <div className="db-chart-box db-chart-box--wide">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">{chartCopy[role].volumeTitle}</div>
              <div className="db-chart-subtitle">{chartCopy[role].volumeSubtitle}</div>
            </div>
            <div className="db-chart-metric">
              <span>Year Total</span>
              <strong>{fmt(totalOrders)}</strong>
            </div>
          </div>
          {monthlySales.length === 0 ? (
            <div className="db-no-data">No monthly order data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlySales} margin={{ top: 10, right: 16, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b6878" }} />
                <YAxis tick={{ fontSize: 11, fill: "#5b6878" }} width={42} />
                <Tooltip formatter={(v) => [v, "Orders"]} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {monthlySales.map((item, index) => (
                    <Cell key={item.label} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="db-chart-box">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">{chartCopy[role].categoryTitle}</div>
              <div className="db-chart-subtitle">{chartCopy[role].categorySubtitle}</div>
            </div>
            <div className="db-chart-metric">
              <span>Top Category</span>
              <strong>{topCategory?.category ?? "N/A"}</strong>
            </div>
          </div>
          {(charts?.category_sales ?? []).length === 0 ? (
            <div className="db-no-data">No category data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={charts?.category_sales ?? []} margin={{ top: 10, right: 16, bottom: 24, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: "#5b6878" }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: "#5b6878" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} width={52} />
                <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Sales"]} />
                <Bar dataKey="total_sales" radius={[5, 5, 0, 0]} maxBarSize={40}>
                  {(charts?.category_sales ?? []).map((item, index) => (
                    <Cell key={item.category} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

export interface MonthlySalesEntry {
  month: string;
  label: string;
  revenue: number;
  count: number;
}

export interface StatewiseEntry {
  state: string;
  orders: number;
}

export interface StatusDistEntry {
  status: string;
  count: number;
}

export interface TopPartyEntry {
  card_code: string;
  card_name: string;
  revenue: number;
}

export interface ManagerPerformanceEntry {
  manager_id: number;
  manager_name: string;
  orders: number;
  sales: number;
}

export interface ManagerStatePerformanceEntry {
  manager_id: number;
  manager_name: string;
  state: string;
  orders: number;
  sales: number;
}

export interface CategorySalesEntry {
  category: string;
  total_sales: number;
  count: number;
}

export interface DashboardChartsData {
  filter: { year: number; month: number };
  monthly_sales: MonthlySalesEntry[];
  statewise_orders: StatewiseEntry[];
  status_distribution: StatusDistEntry[];
  top_parties: TopPartyEntry[];
  category_sales: CategorySalesEntry[];
  manager_performance?: ManagerPerformanceEntry[];
  manager_state_performance?: ManagerStatePerformanceEntry[];
}

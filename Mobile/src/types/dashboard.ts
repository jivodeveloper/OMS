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
  label: string;
  count: number;
}

export interface TopPartyEntry {
  card_code: string;
  card_name: string;
  revenue: number;
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
}
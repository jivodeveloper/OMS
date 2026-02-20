import { api } from './api';
import { DashboardChartsData } from '../types/dashboard';

export interface DashboardData {
  total_orders: number;
  total_revenue: string;
  today_orders: number;
  this_month_orders: number;
  status_counts: {
    submitted: number;
    pending_approval: number;
    approved: number;
    rejected: number;
    sap_created: number;
  };
}

export const dashboardService = {
  getDashboard: async (): Promise<DashboardData> => {
    return await api.get('/orders/dashboard/');
  },

  getChartData: async (lineYear: number, donutYear: number, donutMonth: number): Promise<DashboardChartsData> => {
    return await api.get(
      `/orders/dashboard/charts/?line_year=${lineYear}&year=${donutYear}&month=${donutMonth}`,
    );
  },
};

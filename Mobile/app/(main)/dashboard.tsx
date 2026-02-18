import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Dropdown } from "react-native-element-dropdown";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import { api } from "@/src/services/api";
import { storage } from "@/src/utils/storage";
import { DashboardChartsData } from "@/src/types/dashboard";
import MonthPicker from "@/src/components/dashboard/MonthPicker";
import SalesLineChart from "@/src/components/dashboard/SalesLineChart";
import TopPartiesChart from "@/src/components/dashboard/TopPartiesChart";
import StatusPieChart from "@/src/components/dashboard/StatusPieChart";
import CategorySalesChart from "@/src/components/dashboard/CategorySalesChart";
import StatewiseBarChart from "@/src/components/dashboard/StateWiseBarChart";
import AnimatedCard from "@/src/components/dashboard/AnimatedCard";
import AnimatedNumber from "@/src/components/dashboard/AnimatedNumber";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2023 }, (_, i) => ({
  label: String(2024 + i),
  value: 2024 + i,
}));

interface DashboardData {
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

export default function DashboardScreen() {
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const isNarrow = screenWidth < 400;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<DashboardChartsData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  // Line chart: year only
  const [lineYear, setLineYear] = useState(new Date().getFullYear());
  // Donut charts: year + month (0 = year-to-date)
  const [donutYear, setDonutYear] = useState(new Date().getFullYear());
  const [donutMonth, setDonutMonth] = useState(0);

  useEffect(() => {
    fetchDashboard();
    fetchChartData(lineYear, donutYear, donutMonth);
  }, []);

  useEffect(() => {
    fetchChartData(lineYear, donutYear, donutMonth);
  }, [lineYear, donutYear, donutMonth]);

  const fetchDashboard = async () => {
    try {
      const token = await storage.getAccessToken();
      const result = await api.get(
        "/orders/dashboard/",
        token || undefined,
      );

      console.log("Dashboard fetch result:", JSON.stringify(result));
      if (result && !result.error && result.total_orders !== undefined) {
        setData(result);
      }
    } catch (error) {
      console.log("Dashboard fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async (ly: number, dy: number, dm: number) => {
    setChartLoading(true);
    try {
      const token = await storage.getAccessToken();
      const result = await api.get(
        `/orders/dashboard/charts/?line_year=${ly}&year=${dy}&month=${dm}`,
        token || undefined,
      );
      if (result && !result.error && result.monthly_sales) {
        setChartData(result);
      }
    } catch (error) {
      console.log("Chart data fetch error:", error);
    } finally {
      setChartLoading(false);
    }
  };

  const stats = data
    ? [
        {
          title: "Revenue",
          value: `₹${Number(data.total_revenue).toLocaleString("en-IN")}`,
          icon: "cash",
          color: "#059669",
        },
        {
          title: "Today",
          value: String(data.today_orders),
          icon: "today",
          color: "#8B5CF6",
        },
        {
          title: "This Month",
          value: String(data.this_month_orders),
          icon: "calendar",
          color: "#0891B2",
        },
        {
          title: "Total Orders",
          value: String(data.total_orders),
          icon: "document-text",
          color: "#2563EB",
        },
      ]
    : [];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.welcomeCard}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.userName}>{user?.name || user?.username}!</Text>
        <Text style={styles.welcomeSubtext}>
          Here's what's happening with your orders today.
        </Text>
      </LinearGradient>

      {/* Analytics Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Analytics</Text>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: SPACING.xl }}
        />
      ) : (
        <View style={[styles.statsGrid, isNarrow && styles.statsGridWrap]}>
          {stats.map((stat, index) => (
            <AnimatedCard
              key={index}
              style={[
                styles.statCard,
                isNarrow && { width: (screenWidth - SPACING.md * 2 - SPACING.sm) / 2 },
              ]}
            >
              <View
                style={[
                  styles.statIcon,
                  { backgroundColor: `${stat.color}15` },
                ]}
              >
                <Ionicons
                  name={stat.icon as any}
                  size={24}
                  color={stat.color}
                />
              </View>
              <AnimatedNumber value={stat.value} style={styles.statValue} />
              <Text style={styles.statTitle}>{stat.title}</Text>
            </AnimatedCard>
          ))}
        </View>
      )}
      
      {chartLoading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginVertical: SPACING.xl }}
        />
      ) : chartData ? (
        <View style={styles.chartsContainer}>
          {/* Line chart with its own year picker */}
          <View style={styles.lineChartHeader}>
            <Text style={styles.chartSectionLabel}>Revenue Trend</Text>
            <Dropdown
              data={YEAR_OPTIONS}
              labelField="label"
              valueField="value"
              value={lineYear}
              onChange={(item) => setLineYear(item.value)}
              style={styles.yearDropdown}
              selectedTextStyle={styles.yearDropdownText}
            />
          </View>
          <SalesLineChart data={chartData.monthly_sales} />

          {/* Donut charts with their own month+year filter */}
          <View style={styles.donutFilterRow}>
            <Text style={styles.chartSectionLabel}>Overview</Text>
          </View>
          <MonthPicker
            year={donutYear}
            month={donutMonth}
            onChangeYear={setDonutYear}
            onChangeMonth={setDonutMonth}
          />
          <View style={styles.chartsGrid}>
            <View style={[styles.chartsRow, isNarrow && styles.chartsRowWrap]}>
              <StatusPieChart data={chartData.status_distribution} />
              <CategorySalesChart data={chartData.category_sales} />
            </View>
            <TopPartiesChart data={chartData.top_parties} />
            <StatewiseBarChart data={chartData.statewise_orders} />
          </View>
        </View>
      ) : null}

      {/* <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <Surface style={styles.actionCard}>
            <Ionicons name="add-circle" size={28} color={COLORS.primary} />
            <Text style={styles.actionText}>New Order</Text>
          </Surface>
          <Surface style={styles.actionCard}>
            <Ionicons name="search" size={28} color={COLORS.primary} />
            <Text style={styles.actionText}>Search</Text>
          </Surface>
          <Surface style={styles.actionCard}>
            <Ionicons name="stats-chart" size={28} color={COLORS.primary} />
            <Text style={styles.actionText}>Reports</Text>
          </Surface>
        </View>
      </View> */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  welcomeCard: {
    margin: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    position: "relative",
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: -20,
    left: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  welcomeText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
  },
  userName: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.textLight,
    marginTop: 4,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  statsGridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statCard: {
    flex: 1,
    minWidth: 70,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    elevation: 2,
    alignItems: "center",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  statTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  chartsContainer: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  lineChartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  chartSectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  yearDropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 100,
  },
  yearDropdownText: {
    fontSize: 15,
    color: COLORS.text,
  },
  donutFilterRow: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  chartsGrid: {
    gap: SPACING.sm,
  },
  chartsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  chartsRowWrap: {
    flexDirection: "column",
  },
  section: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    elevation: 2,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
    marginTop: SPACING.sm,
  },
});

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { orderService } from "@/src/services/order.service";
import { useLocalSearchParams } from "expo-router";

interface RateApprovalEntry {
  approver_name: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}

interface OrderLog {
  id: number;
  status_id: number;
  status_name: string;
  remarks: string;
  performed_by_name: string;
  created_at: string;
}

// Status IDs that belong to the rate-approval phase
const RATE_APPROVAL_STATUS_IDS = [2, 6, 7];

export default function OrderFlowScreen() {
  const { orderId } = useLocalSearchParams();

  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [rateApprovals, setRateApprovals] = useState<RateApprovalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [logsRes, detailRes] = await Promise.all([
        orderService.getOrderLogs(Number(orderId)),
        orderService.getOrderDetails(Number(orderId)),
      ]);
      setLogs(Array.isArray(logsRes) ? logsRes : []);
      const detail = detailRes?.data || detailRes;
      const approvals: any[] = Array.isArray(detail?.rate_approvals)
        ? detail.rate_approvals
        : [];
      setRateApprovals(
        approvals.map((a) => ({
          approver_name: String(a.approver_name || ""),
          status: a.status as "PENDING" | "APPROVED" | "REJECTED",
        }))
      );
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item, index }: any) => {
    const isRateApprovalRelated = RATE_APPROVAL_STATUS_IDS.includes(
      item.status_id
    );

    let isRejected: boolean;
    let isApproved: boolean;

    if (isRateApprovalRelated && rateApprovals.length > 0) {
      // Base color on actual individual approver decisions
      isApproved = rateApprovals.every((a) => a.status === "APPROVED");
      isRejected = rateApprovals.some((a) => a.status === "REJECTED");
    } else {
      isRejected = item.status_name === "REJECTED";
      isApproved = item.status_name === "APPROVED";
    }

    // Show the per-approver breakdown only on the "Rate Approval" step (id=2)
    const showApprovers =
      item.status_id === 2 && rateApprovals.length > 0;

    return (
      <View style={styles.timelineRow}>
        {/* LEFT TIMELINE */}
        <View style={styles.timelineLeft}>
          <View
            style={[
              styles.circle,
              isRejected && styles.redCircle,
              isApproved && styles.greenCircle,
              !isRejected && !isApproved && styles.orangeCircle,
            ]}
          >
            <Ionicons
              name={
                isRejected ? "close" : isApproved ? "checkmark" : "time-outline"
              }
              size={16}
              color="#fff"
            />
          </View>

          {/* Vertical line */}
          {index !== logs.length - 1 && (
            <View
              style={[
                styles.verticalLine,
                isRejected && { backgroundColor: "#F44336" },
                isApproved && { backgroundColor: "#4CAF50" },
                !isRejected && !isApproved && { backgroundColor: "#FF9800" },
              ]}
            />
          )}
        </View>

        {/* RIGHT CARD */}
        <View
          style={[
            styles.card,
            isRejected && styles.redCard,
            isApproved && styles.greenCard,
            !isRejected && !isApproved && styles.orangeCard,
          ]}
        >
          <Text style={styles.statusTitle}>{item.status_name}</Text>

          {showApprovers && (
            <View style={styles.approverList}>
              {rateApprovals.map((a, i) => (
                <View key={i} style={styles.approverRow}>
                  <View
                    style={[
                      styles.approverDot,
                      a.status === "APPROVED" && { backgroundColor: "#4CAF50" },
                      a.status === "REJECTED" && { backgroundColor: "#F44336" },
                      a.status === "PENDING" && { backgroundColor: "#FF9800" },
                    ]}
                  />
                  <Text style={styles.approverName}>{a.approver_name}</Text>
                  <Text
                    style={[
                      styles.approverStatus,
                      a.status === "APPROVED" && { color: "#2E7D32" },
                      a.status === "REJECTED" && { color: "#C62828" },
                      a.status === "PENDING" && { color: "#E65100" },
                    ]}
                  >
                    {a.status === "PENDING"
                      ? "Pending"
                      : a.status === "APPROVED"
                      ? "Approved"
                      : "Rejected"}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {item.remarks ? (
            <Text style={styles.remarks}>{item.remarks}</Text>
          ) : null}

          <Text style={styles.meta}>
            {item.performed_by_name || "System"} •{" "}
            {new Date(item.created_at).toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#7B1FA2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      {/* <LinearGradient colors={["#7B1FA2", "#512DA8"]} style={styles.header}>
        <Text style={styles.headerTitle}>Order Status Timeline</Text>
      </LinearGradient> */}

      <View style={styles.content}>
        <Text style={styles.pageTitle}>Order Progress</Text>
        <Text style={styles.subtitle}>Track your order through all stages</Text>

        <FlatList
          data={logs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F5F7" },

  remarks: {
    fontSize: 13,
    color: "#333",
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 6,
  },

  metaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginRight: 6,
  },

  metaValue: {
    fontSize: 12,
    color: "#444",
  },
  meta: {
    fontSize: 12,
    color: "#666",
    marginTop: 12,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    alignItems: "center",
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },

  content: {
    padding: 16,
  },

  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },

  subtitle: {
    color: "#777",
    marginBottom: 20,
  },

  timelineRow: {
    flexDirection: "row",
    marginBottom: 30,
  },

  timelineLeft: {
    width: 40,
    alignItems: "center",
  },

  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },

  greenCircle: {
    backgroundColor: "#4CAF50",
  },

  orangeCircle: {
    backgroundColor: "#FF9800",
  },

  redCircle: {
    backgroundColor: "#F44336",
  },

  verticalLine: {
    width: 3,
    flex: 1,
    marginTop: 4,
    borderRadius: 2,
  },

  card: {
    flex: 1,
    borderRadius: 18,
    padding: 18,
  },

  greenCard: {
    backgroundColor: "#E8F5E9",
  },

  orangeCard: {
    backgroundColor: "#FFF3E0",
  },

  redCard: {
    backgroundColor: "#FFEBEE",
  },

  statusTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },

  label: {
    fontSize: 13,
    color: "#555",
    marginTop: 6,
  },

  value: {
    fontSize: 14,
    fontWeight: "500",
  },

  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  approverList: {
    marginTop: 6,
    marginBottom: 8,
  },
  approverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  approverDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#FF9800",
  },
  approverName: {
    flex: 1,
    fontSize: 12,
    color: "#444",
  },
  approverStatus: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E65100",
  },
});

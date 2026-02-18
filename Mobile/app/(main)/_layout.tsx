import React, { useEffect } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import CustomDrawer from "@/src/components/common/CustomDrawer";
import { useAuth } from "@/src/context/AuthContext";
import { COLORS, RADIUS } from "@/src/constants/theme";

export default function MainLayout() {
  const { user } = useAuth();
  const userRole = user?.role?.toLowerCase() || "";

  const canSee: Record<string, string[]> = {
    dashboard: ["admin", "manager", "approver"],
    "orders/create": ["manager"],
    "orders/orderlist": ["billing"],
    "users/create": ["admin"],
    "sap/sap-sync": ["admin"],
    "sap/party-assignment": ["admin"],
    "sap/party-product-assignment": ["admin"],
    "approver/pending_approval": ["approver"],
    "orders/ordertracking": ["manager"],
  };

  const visibleStyle = {
    borderRadius: RADIUS.md,
    marginHorizontal: 8,
    marginVertical: 2,
    paddingLeft: 8,
  };
  const hiddenStyle = { display: "none" as const };

  const isVisible = (screen: string) => {
    const roles = canSee[screen];
    return roles?.includes(userRole);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawer {...props} />}
        screenOptions={
          {
            /* ...your existing screenOptions */
          }
        }
      >
        <Drawer.Screen
          name="dashboard"
          options={{
            drawerLabel: "Dashboard",
            title: "Dashboard",
            drawerIcon: ({ color }) => (
              <Ionicons name="grid-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("dashboard")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="orders/create"
          options={{
            drawerLabel: "Create Order",
            title: "Create Order",
            drawerIcon: ({ color }) => (
              <Ionicons name="add-circle-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/create")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
        
        <Drawer.Screen
          name="orders/orderlist"
          options={{
            drawerLabel: "Order List",
            title: "Order List",
            drawerIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/orderlist")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="users/create"
          options={{
            drawerLabel: "Create User",
            title: "Create User",
            drawerIcon: ({ color }) => (
              <Ionicons name="person-add-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("users/create")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="sap/sap-sync"
          options={{
            drawerLabel: "Sap Sync",
            title: "Sap Sync",
            drawerIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("sap/sap-sync")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="sap/party-assignment"
          options={{
            drawerLabel: "Sap Party Assignment",
            title: "Sap Party Assignment",
            drawerIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("sap/party-assignment")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="sap/party-product-assignment"
          options={{
            drawerLabel: "Sap Party Product Assignment",
            title: "Sap Party Product Assignment",
            drawerIcon: ({ color }) => (
              <Ionicons name="document-text-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("sap/party-product-assignment")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="orders/OrderFlow"
          options={{
            drawerItemStyle: { display: "none" },
          }}
        />

        <Drawer.Screen
          name="orders/ordertracking"
          options={{
            drawerLabel: "Order Tracking",
            title: "Order Tracking",
            drawerIcon: ({ color }) => (
              <Ionicons name="locate-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("orders/ordertracking")
              ? visibleStyle
              : hiddenStyle,
          }}
        />

        <Drawer.Screen
          name="approver/pending_approval"
          options={{
            drawerLabel: "Pending Approvals",
            title: "Pending Approvals",
            drawerIcon: ({ color }) => (
              <Ionicons name="checkmark-done-outline" size={22} color={color} />
            ),
            drawerItemStyle: isVisible("approver/pending_approval")
              ? visibleStyle
              : hiddenStyle,
          }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}

import React, { useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Alert,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from "react-native";
import { Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { userService } from "@/src/services/user.service";
import { COLORS, SPACING, RADIUS } from "@/src/constants/theme";
import StateWrapper from "@/src/components/common/StateWrapper";

type User = {
  id: number;
  name: string;
  phone: number;
  states: { id: number; name: string; code: string }[];
  main_group__name: string;
  is_active: boolean;
  category?: { id: number; category: string } | string | null;
};

export default function AllUsersScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStates, setExpandedStates] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const toggleStates = (userId: number) => {
    setExpandedStates((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  useFocusEffect(
    useCallback(() => {
      getUsers();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await getUsers();
    setRefreshing(false);
  }, []);

  const getUsers = async () => {
    try {
      if (users.length === 0) setLoading(true);
      const response = await userService.users();

      console.log("DATA:", response.data);

      setUsers(response.data);
    } catch (error) {
      console.log("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const confirmRemoveUser = (userId: number) => {
    Alert.alert("Remove User", "Are you sure you want to remove this user?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeuser(userId),
      },
    ]);
  };

  const removeuser = async (userId: number) => {
    try {
      setLoading(true);
      const response = await userService.removeUser(userId);

    
      console.log("Delete API Response:", JSON.stringify(response, null, 2));

      
      const successMessage =
        response?.message ||
        response?.data?.message ||
        "User removed successfully";
      Alert.alert("Success", successMessage);

      await getUsers();
    } catch (error) {
      console.error("Delete API Error:", error);
      Alert.alert("Error", "Failed to remove user");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      user.name?.toLowerCase().startsWith(query) ||
      user.states?.some((s) => s.name.toLowerCase().startsWith(query)) ||
      user.phone?.toString().startsWith(query)
    );
  });

  const renderItem = ({ item }: { item: User }) => (
    <Surface style={styles.card} elevation={2}>
      {/* 🔹 Avatar */}
      <View style={styles.avatarContainer}>
        <View style={styles.iconWrapper}>
          <MaterialCommunityIcons
            name="clipboard-account-outline"
            size={24}
            color={COLORS.textSecondary}
          />
        </View>
      </View>

      
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        {(() => {
          const states = item.states ?? [];
          const isExpanded = expandedStates.has(item.id);
          const visible = isExpanded ? states : states.slice(0, 2);
          return (
            <View>
              <Text style={styles.state}>
                {visible.length ? visible.map((s) => s.name).join(", ") : "N/A"}
              </Text>
              {states.length > 2 && (
                <TouchableOpacity onPress={() => toggleStates(item.id)}>
                  <Text style={styles.viewMore}>
                    {isExpanded ? "View less" : `+${states.length - 2} more`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}
        <Text style={styles.phone}>{item.phone || "N/A"}</Text>
      </View>

    
      <View style={styles.rightColumn}>
        
        <View style={[styles.status, !item.is_active && styles.statusInactive]}>
          <View
            style={[
              styles.statusIndicator,
              !item.is_active && styles.statusIndicatorInactive,
            ]}
          />
          <Text style={[styles.active, !item.is_active && styles.textInactive]}>
            {item.is_active ? "Active" : "Inactive"}
          </Text>
        </View>

        
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.iconButton}
            // onPress={() =>
            //   router.push({
            //     pathname: "/(main)/users/editUser",
            //     params: { user: JSON.stringify(item) },
            //   })
            // }
            onPress={() =>
              router.push({
                pathname: "/(main)/users/editUser",
                params: { id: item.id, from: "users/allUsers" },
              })
            }
          >
            <MaterialCommunityIcons
              name="pencil-outline"
              size={20}
              color={COLORS.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.deleteButton]}
            onPress={() => confirmRemoveUser(item.id)}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color="#F44336"
            />
          </TouchableOpacity>
        </View>
      </View>
    </Surface>
  );

  return (
    <StateWrapper loading={loading}>
      <View style={styles.container}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="magnify"
            size={24}
            color={COLORS.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, state, or phone..."
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, filteredUsers.length === 0 && { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="account-search-outline" size={60} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>No users found</Text>
              {searchQuery.length > 0 && (
                <Text style={styles.emptySubtext}>
                  We couldn&apos;t find anyone matching &quot;{searchQuery}&quot;
                </Text>
              )}
            </View>
          }
        />
      </View>
    </StateWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerIndicator: {
    width: 3,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    height: 48,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1A1A1A",
  },

  listContent: {
    padding: SPACING.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  avatarContainer: {
    marginRight: SPACING.md,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: "#F1F5F9", 
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    flex: 1,
    justifyContent: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  state: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  phone: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  viewMore: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "600",
    marginTop: 2,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4CAF5015",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  statusInactive: {
    backgroundColor: "#F4433615",
  },
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4CAF50",
    marginRight: 4,
  },
  statusIndicatorInactive: {
    backgroundColor: "#F44336",
  },
  active: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 11,
  },
  textInactive: {
    color: "#F44336",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A1A",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  rightColumn: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  actionContainer: {
    flexDirection: "row",
    marginTop: 8,
  },
  iconButton: {
    marginLeft: 8,
    padding: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: RADIUS.sm,
  },
  deleteButton: {
    backgroundColor: "#F4433615", 
  },
});

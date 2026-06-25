import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  RefreshControl,
} from "react-native";
import { Surface, Button, Checkbox } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { COLORS, SPACING, RADIUS, SHADOWS, GRADIENTS } from "@/src/constants/theme";
import { userService } from "@/src/services/user.service";
import { ASSIGNABLE_PAGES } from "@/src/constants/pages";
import StateWrapper from "@/src/components/common/StateWrapper";

type PermUser = {
  id: number;
  name?: string;
  username?: string;
  role?: string | null;
  extra_pages?: string[];
};

const GRANTABLE_KEYS = ASSIGNABLE_PAGES.map((page) => page.key);
const isAdminRole = (role?: string | null) =>
  String(role || "").trim().toLowerCase() === "admin";

export default function PagePermissionsScreen() {
  const [users, setUsers] = useState<PermUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const fetchUsers = async () => {
    try {
      setError(null);
      if (users.length === 0) setLoading(true);
      const response = await userService.users();
      const list: PermUser[] = Array.isArray(response)
        ? response
        : response?.data ?? [];
      setUsers(list);
    } catch (err) {
      console.log("Error fetching users:", err);
      setError("Unable to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchUsers();

      // Clear the selection when leaving the screen so it starts fresh next time.
      return () => {
        setSelectedUserIds([]);
        setPages([]);
        setSearch("");
        setMenuOpen(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [users, selectedUserIds],
  );
  const nonAdminSelected = selectedUsers.filter((user) => !isAdminRole(user.role));
  const adminSelectedCount = selectedUsers.length - nonAdminSelected.length;

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.name, user.username, user.role].some((value) =>
        String(value || "").toLowerCase().includes(term),
      ),
    );
  }, [users, search]);

  // Recompute the page set from the union of the selected users' current grants
  // so the admin starts from what those users already have.
  const computePagesFor = (ids: number[]) => {
    const granted = new Set<string>();
    users.forEach((user) => {
      if (!ids.includes(user.id) || isAdminRole(user.role)) return;
      (user.extra_pages || []).forEach((key) => {
        if (GRANTABLE_KEYS.includes(key)) granted.add(key);
      });
    });
    return Array.from(granted);
  };

  // When the user list reloads (pull-to-refresh / re-focus), re-sync the page
  // toggles to the freshly fetched grants for whoever is currently selected —
  // otherwise the toggles keep showing the pre-refresh state.
  useEffect(() => {
    if (selectedUserIds.length === 0) return;
    setPages(computePagesFor(selectedUserIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  const toggleUser = (userId: number) => {
    setSelectedUserIds((current) => {
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      setPages(computePagesFor(next));
      return next;
    });
  };

  const togglePage = (key: string) => {
    setPages((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  };

  const setAll = (grantAll: boolean) => {
    setPages(grantAll ? [...GRANTABLE_KEYS] : []);
  };

  const triggerLabel = () => {
    if (selectedUsers.length === 0) return "Choose user(s)";
    if (selectedUsers.length === 1) {
      const user = selectedUsers[0];
      return `${user.name || user.username}${user.role ? ` · ${user.role}` : ""}`;
    }
    return `${selectedUsers.length} users selected`;
  };

  const handleSave = async () => {
    if (nonAdminSelected.length === 0) return;
    try {
      setSaving(true);
      await Promise.all(
        nonAdminSelected.map((user) =>
          userService.updatePagePermissions(user.id, pages),
        ),
      );
      const savedIds = nonAdminSelected.map((user) => user.id);
      setUsers((current) =>
        current.map((user) =>
          savedIds.includes(user.id) ? { ...user, extra_pages: pages } : user,
        ),
      );
      setSavedCount(nonAdminSelected.length);
      setSuccessVisible(true);
    } catch (err) {
      console.log("Error saving page permissions:", err);
      Alert.alert(
        "Error",
        "Unable to save page access. Make sure you are logged in as admin.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <StateWrapper loading={loading} error={error} onRetry={fetchUsers}>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Select Users */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>SELECT USERS</Text>
            </View>

            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => {
                setSearch("");
                setMenuOpen(true);
              }}
            >
              <Ionicons name="people-outline" size={18} color={COLORS.textSecondary} />
              <Text
                style={[
                  styles.dropdownText,
                  selectedUsers.length === 0 && { color: COLORS.textSecondary },
                ]}
                numberOfLines={1}
              >
                {triggerLabel()}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>

            {selectedUsers.length > 0 && (
              <View style={styles.chipWrap}>
                {selectedUsers.map((user) => (
                  <View key={user.id} style={styles.chip}>
                    <Text style={styles.chipText} numberOfLines={1}>
                      {user.name || user.username}
                    </Text>
                    <TouchableOpacity onPress={() => toggleUser(user.id)} hitSlop={8}>
                      <Ionicons name="close" size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {selectedUsers.length > 1 && (
              <Text style={styles.bulkHint}>
                Saving applies the selected pages to all {selectedUsers.length} users
                (replacing their current access).
              </Text>
            )}
          </Surface>

          {/* Allowed Pages */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>ALLOWED PAGES</Text>
            </View>

            {selectedUsers.length === 0 ? (
              <Text style={styles.hint}>
                Select one or more users above to choose which admin pages they can open.
              </Text>
            ) : nonAdminSelected.length === 0 ? (
              <View style={styles.adminNote}>
                <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
                <Text style={styles.adminNoteText}>
                  Admins already have access to every page. Select a non-admin user to
                  manage access.
                </Text>
              </View>
            ) : (
              <>
                {adminSelectedCount > 0 && (
                  <Text style={styles.bulkHint}>
                    {adminSelectedCount} admin{adminSelectedCount > 1 ? "s" : ""} in your
                    selection will be skipped (they already have full access).
                  </Text>
                )}

                <View style={styles.quickActions}>
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => setAll(true)}
                    style={styles.quickBtn}
                    labelStyle={styles.quickBtnLabel}
                  >
                    Grant all
                  </Button>
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => setAll(false)}
                    style={styles.quickBtn}
                    labelStyle={styles.quickBtnLabel}
                  >
                    Clear all
                  </Button>
                  <Text style={styles.count}>
                    {pages.length} / {ASSIGNABLE_PAGES.length} granted
                  </Text>
                </View>

                <View style={styles.selectRow}>
                  {ASSIGNABLE_PAGES.map((page) => {
                    const selected = pages.includes(page.key);
                    return (
                      <Button
                        key={page.key}
                        mode={selected ? "contained" : "outlined"}
                        onPress={() => togglePage(page.key)}
                        style={[styles.selectButton, selected && styles.selectButtonActive]}
                        labelStyle={[
                          styles.selectButtonLabel,
                          selected && styles.selectButtonLabelActive,
                        ]}
                        buttonColor={selected ? COLORS.primary : "transparent"}
                      >
                        {page.label}
                      </Button>
                    );
                  })}
                </View>
              </>
            )}
          </Surface>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.btnSaveGradient,
              nonAdminSelected.length === 0 && styles.btnSaveDisabled,
            ]}
          >
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving || nonAdminSelected.length === 0}
              style={styles.btnSave}
              labelStyle={styles.btnSaveLabel}
              buttonColor="transparent"
            >
              {saving ? "Saving..." : "Save Access"}
            </Button>
          </LinearGradient>
        </View>
      </View>

      {/* User picker modal */}
      <Modal transparent animationType="fade" visible={menuOpen}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Select Users</Text>
              <TouchableOpacity onPress={() => setMenuOpen(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, username or role"
                placeholderTextColor={COLORS.textSecondary}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.id.toString()}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const checked = selectedUserIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={styles.userRow}
                    onPress={() => toggleUser(item.id)}
                  >
                    <Checkbox status={checked ? "checked" : "unchecked"} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{item.name || item.username}</Text>
                      <Text style={styles.userMeta}>
                        {item.username}
                        {item.role ? ` · ${item.role}` : ""}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No users found</Text>
              }
            />

            <View style={styles.dialogFooter}>
              <Text style={styles.count}>{selectedUserIds.length} selected</Text>
              <Button
                mode="contained"
                onPress={() => setMenuOpen(false)}
                buttonColor={COLORS.primary}
                labelStyle={{ color: COLORS.textLight }}
              >
                Done
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal
        transparent
        animationType="fade"
        visible={successVisible}
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.successModal}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={34} color={COLORS.textLight} />
            </View>
            <Text style={styles.successTitle}>Access Saved</Text>
            <Text style={styles.successMessage}>
              Page access updated for {savedCount} user{savedCount > 1 ? "s" : ""}.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                activeOpacity={0.85}
                onPress={() => setSuccessVisible(false)}
              >
                <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                <Text style={styles.secondaryActionText}>Keep Editing</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryAction}
                activeOpacity={0.85}
                onPress={() => {
                  setSuccessVisible(false);
                  router.replace("/(main)/dashboard");
                }}
              >
                <Ionicons name="grid-outline" size={18} color={COLORS.textLight} />
                <Text style={styles.primaryActionText}>Go to Dashboard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </StateWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  sectionIndicator: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primaryDark,
    letterSpacing: 1,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: "#fff",
  },
  dropdownText: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 200,
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: COLORS.primary, flexShrink: 1 },
  bulkHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 17,
  },
  hint: { fontSize: 13, color: COLORS.textSecondary },
  adminNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "#E8F0FE",
    padding: SPACING.md,
    borderRadius: RADIUS.md,
  },
  adminNoteText: { flex: 1, fontSize: 13, color: COLORS.textPrimary },
  quickActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    flexWrap: "wrap",
  },
  quickBtn: { borderRadius: RADIUS.md, borderColor: COLORS.border },
  quickBtnLabel: { fontSize: 12, color: COLORS.textSecondary },
  count: { fontSize: 12, color: COLORS.textSecondary, marginLeft: "auto" },
  selectRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  selectButton: { borderRadius: RADIUS.md, borderColor: COLORS.border },
  selectButtonActive: { borderColor: COLORS.primary },
  selectButtonLabel: { fontSize: 12, color: COLORS.textSecondary },
  selectButtonLabelActive: { color: COLORS.textLight },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    ...SHADOWS.bottomBar,
  },
  btnSaveGradient: { borderRadius: RADIUS.md },
  btnSaveDisabled: { opacity: 0.5 },
  btnSave: { borderRadius: RADIUS.md },
  btnSaveLabel: { color: COLORS.textLight, fontWeight: "600" },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dialog: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
    elevation: 5,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  dialogTitle: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: SPACING.md,
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  userName: { fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },
  userMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    paddingVertical: 16,
    textAlign: "center",
  },
  dialogFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.md,
  },
  successModal: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    elevation: 8,
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    marginBottom: SPACING.md,
  },
  successTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },
  successMessage: {
    marginTop: SPACING.xs,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  modalActions: {
    width: "100%",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  primaryActionText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryAction: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    backgroundColor: COLORS.primaryLighter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  secondaryActionText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "800",
  },
});

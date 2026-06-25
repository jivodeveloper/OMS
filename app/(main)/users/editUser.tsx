import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Text, ScrollView, Alert, TouchableOpacity, FlatList, Modal } from "react-native";
import {
  TextInput,
  Button,
  Surface,
  HelperText,
  Checkbox,
} from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADIUS, GRADIENTS } from "@/src/constants/theme";
import {
  masterService,
  State,
  Company,
  MainGroup,
  UserRole,
} from "@/src/services/master.service";
import MultiSelectDropdown from "@/src/components/common/MultiSelectDropdown";
import Dropdown from "@/src/components/common/DropdownProps";
import { userService } from "@/src/services/user.service";
import { router, useLocalSearchParams } from "expo-router";
import StateWrapper from "@/src/components/common/StateWrapper";
import { api } from "@/src/services/api";
import { useNavigation } from "@react-navigation/native";
import useAndroidBackOverride from "@/src/hooks/useAndroidBackOverride";

export default function EditUserScreen() {
  const navigation = useNavigation();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    role: "",
    companies: null as number | null, // Single
    mainGroup: [] as number[], // Multi
    state: [] as number[], // Multi
    categories: [] as number[], // Multi
    variety: "" as string, // Comma-separated
  });

  // First selected category is the "primary" used for the Sub Group lookup and
  // sent to the backend as the single `category` FK (for backward compatibility).
  const primaryCategory = formData.categories[0] ?? null;

  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot of the form as first loaded, so we can send only changed fields.
  const [initialFormData, setInitialFormData] = useState<typeof formData | null>(null);

  // Master data
  const [states, setStates] = useState<State[]>();
  const [companies, setCompanies] = useState<Company[]>();
  const [mainGroups, setMainGroups] = useState<MainGroup[]>();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [varietyOptions, setVarietyOptions] = useState<string[]>([]);
  const [varietyModalVisible, setVarietyModalVisible] = useState(false);
  const [tempVarieties, setTempVarieties] = useState<string[]>([]);
  const [varietySearch, setVarietySearch] = useState("");

  const selectedVarieties = formData.variety
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const filteredVarietyOptions = varietyOptions.filter((option) =>
    option.toLowerCase().includes(varietySearch.trim().toLowerCase())
  );

  const toggleTempVariety = (v: string) => {
    setTempVarieties((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  // "Select All" applies to the currently visible (filtered) options.
  const isAllVarietiesSelected =
    filteredVarietyOptions.length > 0 &&
    filteredVarietyOptions.every((option) => tempVarieties.includes(option));

  const toggleAllVarieties = () => {
    setTempVarieties((prev) =>
      isAllVarietiesSelected
        ? prev.filter((v) => !filteredVarietyOptions.includes(v))
        : Array.from(new Set([...prev, ...filteredVarietyOptions]))
    );
  };

  const fetchVarieties = async (categoryId: number | null, cats?: any[]) => {
    const catList = cats || categories;
    if (!categoryId) {
      setVarietyOptions([]);
      return;
    }
    const cat = catList.find((c: any) => c.id === categoryId);
    const categoryName = cat?.name || cat?.category || "";
    if (!categoryName) {
      setVarietyOptions([]);
      return;
    }
    try {
      const data = await userService.getProductVarieties(categoryName);
      setVarietyOptions(Array.isArray(data.varieties) ? data.varieties : []);
    } catch (error) {
      console.log("Error fetching varieties:", error);
      setVarietyOptions([]);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: "" });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.username.trim()) newErrors.username = "Username is required";

    // Password is optional in edit, but if provided, validate length
    if (formData.password && formData.password.trim().length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!formData.role) newErrors.role = "Role is required";
    if (!formData.companies) newErrors.company = "Company is required";

    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = "Enter a valid email address";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      // Send only the fields the user actually changed. Compare each form field
      // against the snapshot taken when the user was first loaded.
      const base = initialFormData ?? formData;
      const arraysEqual = (a: number[], b: number[]) =>
        a.length === b.length &&
        [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

      const userData: any = {};

      if (formData.name !== base.name) userData.name = formData.name;
      if (formData.username !== base.username) userData.username = formData.username;
      if (formData.email !== base.email) userData.email = formData.email || "";
      if (formData.phone !== base.phone) userData.phone = formData.phone || "";
      if (formData.role !== base.role) userData.role = formData.role;
      if (formData.companies !== base.companies) userData.company = formData.companies;
      if (!arraysEqual(formData.mainGroup, base.mainGroup)) userData.main_groups = formData.mainGroup;
      if (!arraysEqual(formData.state, base.state)) userData.states = formData.state;
      if (!arraysEqual(formData.categories, base.categories)) {
        userData.categories = formData.categories;
        // Keep the single `category` FK in sync with the first selected one.
        userData.category = formData.categories[0] ?? null;
      }
      // The "Variety" picker is populated from the backend's sub-group list, so the
      // selection is the user's sub group(s). Send it as sub_group (used for
      // rate-approver matching) and keep variety populated for history.
      if (formData.variety !== base.variety) {
        userData.variety = formData.variety || "";
        userData.sub_group = formData.variety || "";
      }

      // if new password then must be added in payload
      if (formData.password.trim()) {
        userData.password = formData.password;
      }

      // Nothing changed — skip the API call.
      if (Object.keys(userData).length === 0) {
        Alert.alert("No changes", "You haven't changed anything.");
        setLoading(false);
        return;
      }

      // Using an updateUser function which should be defined in your userService
      const response = await userService.updateUser(id, userData);
      console.log("userid:",response.id)

      if (response?.success) {
        Alert.alert("Success", "User updated successfully!", [
          {
            text: "OK",
            onPress: () => router.replace("/(main)/users/allUsers"),
          },
        ]);
      } else {
        const errorMsg = response?.errors
          ? Object.values(response.errors).flat().join("\n")
          : response?.message || "Failed to update user";
        Alert.alert("Error", errorMsg);
      }
    } catch (error) {
      console.log("Update user error:", error);
      Alert.alert("Error", "Failed to update user. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchInitialData();
    }
  }, [id]);

  useAndroidBackOverride(
    useCallback(() => {
      if (!from || typeof from !== "string") {
        return false;
      }

      navigation.navigate(from as never);
      return true;
    }, [from, navigation]),
  );

  const fetchInitialData = async () => {
    try {
      setDataLoading(true);
      setError(null);
      
      
      const [statesData, companiesData, mainGroupsData, rolesData, userRes] =
        await Promise.all([
          masterService.getStates(),
          masterService.getCompanies(),
          masterService.getMainGroups(),
          masterService.getRoles(),
          userService.getUserById(id), 
        ]);
      
      setStates(statesData);
      setCompanies(companiesData);
      setMainGroups(mainGroupsData);
      setRoles(rolesData);

      let parsedCat: any[] = [];
      try {
        const catRes = await api.get('/auth/categories/');

        console.log("Edit User - Categories API Raw Response:", JSON.stringify(catRes));

        if (Array.isArray(catRes)) {
            parsedCat = catRes;
        } else if (catRes?.data && Array.isArray(catRes.data)) {
            parsedCat = catRes.data;
        } else if (catRes?.results && Array.isArray(catRes.results)) {
            parsedCat = catRes.results;
        } else if (catRes?.data?.data && Array.isArray(catRes.data.data)) {
            parsedCat = catRes.data.data;
        }
        
        setCategories(parsedCat);
      } catch (catError) {
        console.log("Error fetching categories:", catError);
      }
      
      console.log('responsedata'+JSON.stringify(userRes));
      
      if (userRes?.success && userRes?.data) {
        const user = userRes.data;
        
        console.log("Fetched user data:", user);
        
        let roleId = "";
        if (user.role && typeof user.role === "string") {
          const foundRole = rolesData.find((r: any) => r.name.toLowerCase() === user.role.toLowerCase());
          if (foundRole) roleId = foundRole.id.toString();
        } else if (user.role_id) {
          roleId = user.role_id.toString();
        }

        const getCatId = (c: any) => (typeof c === "object" ? c?.id : c);
        // Full set of assigned categories; fall back to the single primary
        // category for users created before multi-category support.
        const categoryIds: number[] =
          Array.isArray(user.categories) && user.categories.length
            ? user.categories.map(getCatId).filter(Boolean)
            : [getCatId(user.category)].filter(Boolean);
        const primaryCategoryId = categoryIds[0] ?? null;

        const loadedFormData = {
          name: user.name || "",
          username: user.username || "",
          password: "",
          email: user.email || "",
          phone: user.phone || "",
          role: roleId,
          companies: user.company?.id || null,
          mainGroup: user.main_groups?.map((g: any) => g.id) || (user.main_group ? [user.main_group.id] : []),
          state: user.states?.map((s: any) => s.id) || (user.state ? [user.state.id] : []),
          categories: categoryIds,
          // Prefer the new sub_group field; fall back to legacy variety for users
          // created before the sub_group migration.
          variety: user.sub_group || user.variety || "",
        };

        setFormData(loadedFormData);
        setInitialFormData(loadedFormData);

        if (primaryCategoryId) {
          fetchVarieties(primaryCategoryId, parsedCat);
        }
      }else{
        console.log("Failed to fetch user data:", userRes);
      }
    } catch (error) {
      console.log("Error fetching initial data:", error);
      setError("Failed to load form data. Please try again.");
    } finally {
      setDataLoading(false);
    }
  };

  const stateOptions = (states || []).map((s) => ({ label: s.name, value: s.id }));
  const companyOptions = (companies || []).map((c) => ({ label: c.name, value: c.id }));
  const mainGroupOptions = (mainGroups || []).map((g) => ({ label: g.name, value: g.id }));
  
  const categoryOptions = (categories || []).map((c: any) => ({
    label: c.name || c.category || `Category ${c.id}`,
    value: c.id,
  }));

  return (
    <StateWrapper loading={dataLoading} error={error} onRetry={fetchInitialData}>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput
                value={formData.name}
                onChangeText={(text) => updateField("name", text)}
                mode="outlined"
                placeholder="Enter full name"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                left={<TextInput.Icon icon="account-outline" color={COLORS.textSecondary} />}
                error={!!errors.name}
              />
              {errors.name ? <HelperText type="error" visible={true}>{errors.name}</HelperText> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={formData.email}
                onChangeText={(text) => updateField("email", text)}
                mode="outlined"
                placeholder="Enter email address"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                left={<TextInput.Icon icon="email-outline" color={COLORS.textSecondary} />}
                error={!!errors.email}
              />
              {errors.email ? <HelperText type="error" visible={true}>{errors.email}</HelperText> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                value={formData.phone}
                onChangeText={(text) => {
                  const numericText = text.replace(/[^0-9]/g, "");
                  if (numericText.length <= 10) updateField("phone", numericText);
                }}
                mode="outlined"
                placeholder="Enter phone number"
                keyboardType="phone-pad"
                maxLength={10}
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                left={<TextInput.Icon icon="phone-outline" color={COLORS.textSecondary} />}
              />
            </View>
          </Surface>

          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>LOGIN CREDENTIALS</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Username *</Text>
              <TextInput
                value={formData.username}
                onChangeText={(text) => updateField("username", text)}
                mode="outlined"
                placeholder="Enter username"
                autoCapitalize="none"
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                left={<TextInput.Icon icon="at" color={COLORS.textSecondary} />}
                error={!!errors.username}
              />
              <HelperText type="error" visible={!!errors.username}>{errors.username}</HelperText>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password (Leave empty to keep existing)</Text>
              <TextInput
                value={formData.password}
                onChangeText={(text) => updateField("password", text)}
                mode="outlined"
                placeholder="Enter new password"
                secureTextEntry={!showPassword}
                style={styles.input}
                outlineStyle={styles.inputOutline}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                left={<TextInput.Icon icon="lock-outline" color={COLORS.textSecondary} />}
                right={<TextInput.Icon icon={showPassword ? "eye-off-outline" : "eye-outline"} color={COLORS.textSecondary} onPress={() => setShowPassword(!showPassword)} />}
                error={!!errors.password}
              />
              <HelperText type="error" visible={!!errors.password}>{errors.password}</HelperText>
            </View>
          </Surface>

          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>ORGANIZATION</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Role *</Text>
              <View style={styles.selectRow}>
                {roles.map((role) => {
                  const selected = formData.role === role.id.toString();
                  return (
                    <Button
                      key={role.id}
                      mode={selected ? "contained" : "outlined"}
                      onPress={() => updateField("role", role.id.toString())}
                      style={[styles.selectButton, selected && styles.selectButtonActive]}
                      labelStyle={[styles.selectButtonLabel, selected && styles.selectButtonLabelActive]}
                      buttonColor={selected ? COLORS.primary : "transparent"}
                    >
                      {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                    </Button>
                  );
                })}
              </View>
              <HelperText type="error" visible={!!errors.role}>{errors.role}</HelperText>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Company"
                data={companyOptions}
                value={formData.companies}
                onChange={(value) => updateField("companies", value)}
                placeholder="Select company..."
                error={errors.company}
                required
                searchable={false}
                icon="business-outline"
              />
            </View>

            <View style={styles.field}>
              <MultiSelectDropdown
                label="Main Group"
                data={mainGroupOptions}
                values={formData.mainGroup}
                onChange={(values: any) => updateField("mainGroup", values)}
                placeholder="Select main groups..."
                icon="people-outline"
              />
            </View>

            <View style={styles.field}>
              <MultiSelectDropdown
                label="State"
                data={stateOptions}
                values={formData.state}
                onChange={(values: any) => updateField("state", values)}
                placeholder="Select states..."
                icon="location-outline"
              />
            </View>
            
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Category</Text>
              <MultiSelectDropdown
                label="Category"
                data={categoryOptions}
                values={formData.categories}
                onChange={(values: number[]) => {
                  // Reset the sub group whenever the primary (first) category changes.
                  const prevPrimary = formData.categories[0] ?? null;
                  const nextPrimary = values[0] ?? null;
                  setFormData((prev) => ({
                    ...prev,
                    categories: values,
                    variety: nextPrimary === prevPrimary ? prev.variety : "",
                  }));
                  if (nextPrimary !== prevPrimary) fetchVarieties(nextPrimary);
                }}
                placeholder="Select categories..."
                icon="grid-outline"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Sub Group</Text>
              <TouchableOpacity
                style={styles.varietyInput}
                onPress={() => {
                  setTempVarieties([...selectedVarieties]);
                  setVarietySearch("");
                  setVarietyModalVisible(true);
                }}
              >
                <View style={styles.varietyRow}>
                  <Ionicons name="leaf-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.varietyInputText}>
                    {selectedVarieties.length === 0
                      ? "Select sub groups..."
                      : selectedVarieties.length === 1
                        ? selectedVarieties[0]
                        : `${selectedVarieties.length} sub groups selected`}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                </View>
              </TouchableOpacity>

              <Modal transparent animationType="fade" visible={varietyModalVisible}>
                <View style={styles.varietyOverlay}>
                  <View style={styles.varietyDialog}>
                    <Text style={styles.varietyTitle}>Sub Group</Text>

                    {varietyOptions.length > 0 ? (
                      <>
                        <TextInput
                          mode="outlined"
                          dense
                          placeholder="Search sub groups..."
                          value={varietySearch}
                          onChangeText={setVarietySearch}
                          left={<TextInput.Icon icon="magnify" />}
                          right={
                            varietySearch ? (
                              <TextInput.Icon
                                icon="close"
                                onPress={() => setVarietySearch("")}
                              />
                            ) : undefined
                          }
                          style={{ marginBottom: 8 }}
                        />

                        <TouchableOpacity
                          style={styles.varietySelectAll}
                          onPress={toggleAllVarieties}
                        >
                          <Checkbox status={isAllVarietiesSelected ? "checked" : "unchecked"} />
                          <Text style={{ fontWeight: "bold", fontSize: 14, color: COLORS.textPrimary }}>
                            Select All
                          </Text>
                        </TouchableOpacity>

                        <FlatList
                          data={filteredVarietyOptions}
                          keyExtractor={(item) => item}
                          keyboardShouldPersistTaps="handled"
                          renderItem={({ item }) => (
                            <TouchableOpacity
                              style={styles.varietyItem}
                              onPress={() => toggleTempVariety(item)}
                            >
                              <Checkbox
                                status={tempVarieties.includes(item) ? "checked" : "unchecked"}
                              />
                              <Text style={{ fontSize: 14, color: COLORS.textPrimary }}>{item}</Text>
                            </TouchableOpacity>
                          )}
                          ListEmptyComponent={
                            <Text style={{ padding: 16, color: COLORS.textSecondary }}>
                              No sub groups match &quot;{varietySearch}&quot;
                            </Text>
                          }
                        />
                      </>
                    ) : (
                      <Text style={{ padding: 16, color: COLORS.textSecondary }}>
                        {primaryCategory ? "No sub groups found" : "Select a category first"}
                      </Text>
                    )}

                    <View style={styles.varietyFooter}>
                      <Button
                        mode="outlined"
                        onPress={() => setVarietyModalVisible(false)}
                        style={{ marginRight: 8 }}
                      >
                        Cancel
                      </Button>
                      <Button
                        mode="contained"
                        onPress={() => {
                          updateField("variety", tempVarieties.join(", "));
                          setVarietyModalVisible(false);
                        }}
                      >
                        OK
                      </Button>
                    </View>
                  </View>
                </View>
              </Modal>
            </View>
          </Surface>

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnSubmitGradient}>
            <Button mode="contained" onPress={handleSubmit} loading={loading} disabled={loading} style={styles.btnSubmit} labelStyle={styles.btnSubmitLabel} buttonColor="transparent">
              {loading ? "Updating..." : "Update User"}
            </Button>
          </LinearGradient>
        </View>
      </View>
    </StateWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight, elevation: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  sectionIndicator: { width: 2, height: 16, backgroundColor: COLORS.primary, borderRadius: 2, marginRight: SPACING.sm },
  sectionTitle: { fontSize: 11, fontWeight: "600", color: COLORS.primaryDark, letterSpacing: 1 },
  field: { marginBottom: SPACING.sm },
  fieldLabel: { fontSize: 12, fontWeight: "500", color: COLORS.textSecondary, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.inputBackground, fontSize: 14 },
  inputOutline: { borderRadius: RADIUS.md, borderWidth: 1.5, color: COLORS.black },
  selectRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  selectButton: { borderRadius: RADIUS.md, borderColor: COLORS.border },
  selectButtonActive: { borderColor: COLORS.primary },
  selectButtonLabel: { fontSize: 12, color: COLORS.textSecondary },
  selectButtonLabelActive: { color: COLORS.textLight },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, padding: SPACING.md, paddingBottom: SPACING.xl, flexDirection: "row", gap: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.1, shadowRadius: 30, elevation: 10 },
  btnSubmitGradient: { flex: 1, borderRadius: RADIUS.md },
  btnSubmit: { borderRadius: RADIUS.md },
  btnSubmitLabel: { color: COLORS.textLight, fontWeight: "600" },
  varietyInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: "#fff" },
  varietyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  varietyInputText: { flex: 1, marginLeft: 10, fontSize: 14, color: COLORS.textPrimary },
  varietyOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", paddingHorizontal: 20 },
  varietyDialog: { backgroundColor: "#fff", borderRadius: 16, padding: 20, maxHeight: "70%", elevation: 5 },
  varietyTitle: { fontSize: 16, fontWeight: "600", marginBottom: 15, color: COLORS.textPrimary },
  varietySelectAll: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee", paddingBottom: 10, marginBottom: 5 },
  varietyItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  varietyFooter: { marginTop: 15, borderTopWidth: 1, borderColor: COLORS.border, paddingTop: 12, flexDirection: "row", justifyContent: "flex-end" },
});

import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Alert, Role } from "react-native";
import {
  TextInput,
  Button,
  Text,
  Surface,
  HelperText,
} from "react-native-paper";
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
import { router } from "expo-router";

export default function CreateUserScreen() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  // Master data from API
  const [states, setStates] = useState<State[]>();
  const [companies, setCompanies] = useState<Company[]>();
  const [mainGroups, setMainGroups] = useState<MainGroup[]>();
  const [roles, setRoles] = useState<UserRole[]>([]);

  const updateField = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: "" });
    }
  };

  // const validate = (): boolean => {
  //   const newErrors: Record<string, string> = {};

  //   if (!formData.name.trim()) newErrors.name = "Name is required";
  //   if (!formData.username.trim()) newErrors.username = "Username is required";
  //   if (!formData.password.trim()) newErrors.password = "Password is required";
  //   if (formData.password.length < 6)
  //     newErrors.password = "Password must be at least 6 characters";
  //   if (!formData.role) newErrors.role = "Role is required";
  //   if (!formData.companies) newErrors.company = "Company is required";

  //   setErrors(newErrors);
  //   return Object.keys(newErrors).length === 0;
  // };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    }

    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (!formData.role) {
      newErrors.role = "Role is required";
    }

    if (!formData.companies) {
      newErrors.company = "Company is required";
    }

    // Optional fields → no validation
    // email, phone, mainGroup, state

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    console.log("Creating user:");
    if (!validate()) return;

    setLoading(true);

    try {
      const userData = {
        name: formData.name,
        username: formData.username,
        password: formData.password,
        email: formData.email || "",
        phone: formData.phone || "",
        role: formData.role,
        company: formData.companies,
        main_groups: formData.mainGroup.join(","), // ← Convert array to string
        states: formData.state.join(","),
      };

      console.log("Creating user:", userData);
      const response = await userService.createUser(userData);
      console.log("Create user response:", JSON.stringify(response));
      // await new Promise((resolve) => setTimeout(resolve, 1500));

      if (response?.Success) {
        Alert.alert("Success", "User created successfully!", [
          {
            text: "OK",
            onPress: () => {
              handleClear();
              router.replace("/(main)/dashboard");
            },
          },
        ]);
      } else {
        const errorMsg = response?.errors
          ? Object.values(response.errors).flat().join("\n")
          : response?.message || "Failed to create user";
        Alert.alert("Error", errorMsg);
        router.replace("/(main)/dashboard");
      }
    } catch (error) {
      console.log("Create user error:", error);
      Alert.alert("Error", "Failed to create user. Please try again.");
      router.replace("/(main)/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFormData({
      name: "",
      username: "",
      password: "",
      email: "",
      phone: "",
      role: "",
      companies: null,
      mainGroup: [],
      state: [],
    });
    setErrors({});
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      // setDataLoading(true);
      const [statesData, companiesData, mainGroupsData, rolesData] =
        await Promise.all([
          masterService.getStates(),
          masterService.getCompanies(),
          masterService.getMainGroups(),
          masterService.getRoles(),
        ]);
      console.log("states" + statesData);
      setStates(statesData);
      setCompanies(companiesData);
      setMainGroups(mainGroupsData);
      setRoles(rolesData);
    } catch (error) {
      console.log("Error fetching master data:", error);
      Alert.alert("Error", "Failed to load form data. Please try again.");
    }
  };

  const stateOptions = (states || []).map((s) => ({
    label: s.name,
    value: s.id,
  }));
  const companyOptions = (companies || []).map((c) => ({
    label: c.name,
    value: c.id,
  }));
  const mainGroupOptions = (mainGroups || []).map((g) => ({
    label: g.name,
    value: g.id,
  }));

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Personal Info Section */}
        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>
          </View>

          {/* Name */}
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
              left={
                <TextInput.Icon
                  icon="account-outline"
                  color={COLORS.textSecondary}
                />
              }
              error={!!errors.name}
            />
            {errors.name ? (
              <HelperText type="error" visible={true}>
                {errors.name}
              </HelperText>
            ) : null}
          </View>

          {/* Email */}
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
              left={
                <TextInput.Icon
                  icon="email-outline"
                  color={COLORS.textSecondary}
                />
              }
            />
          </View>

          {/* Phone */}
          {/* <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              value={formData.phone}
              onChangeText={(text) => updateField("phone", text)}
              mode="outlined"
              placeholder="Enter phone number"
              keyboardType="phone-pad"
              style={styles.input}
              outlineStyle={styles.inputOutline}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={
                <TextInput.Icon
                  icon="phone-outline"
                  color={COLORS.textSecondary}
                />
              }
            />
          </View> */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              value={formData.phone}
              onChangeText={(text) => {
                // Allow only numbers & max 10 digits
                const numericText = text.replace(/[^0-9]/g, "");
                if (numericText.length <= 10) {
                  updateField("phone", numericText);
                }
              }}
              mode="outlined"
              placeholder="Enter phone number"
              keyboardType="phone-pad"
              maxLength={10}
              style={styles.input}
              outlineStyle={styles.inputOutline}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={
                <TextInput.Icon
                  icon="phone-outline"
                  color={COLORS.textSecondary}
                />
              }
            />
          </View>
        </Surface>

        {/* Login Credentials Section */}
        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>LOGIN CREDENTIALS</Text>
          </View>

          {/* Username */}
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
            <HelperText type="error" visible={!!errors.username}>
              {errors.username}
            </HelperText>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password *</Text>
            <TextInput
              value={formData.password}
              onChangeText={(text) => updateField("password", text)}
              mode="outlined"
              placeholder="Enter password"
              secureTextEntry={!showPassword}
              style={styles.input}
              outlineStyle={styles.inputOutline}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              left={
                <TextInput.Icon
                  icon="lock-outline"
                  color={COLORS.textSecondary}
                />
              }
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off-outline" : "eye-outline"}
                  color={COLORS.textSecondary}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              error={!!errors.password}
            />
            <HelperText type="error" visible={!!errors.password}>
              {errors.password}
            </HelperText>
          </View>
        </Surface>

        {/* Organization Section */}
        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>ORGANIZATION</Text>
          </View>

          {/* Role */}
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
                    style={[
                      styles.selectButton,
                      selected && styles.selectButtonActive,
                    ]}
                    labelStyle={[
                      styles.selectButtonLabel,
                      selected && styles.selectButtonLabelActive,
                    ]}
                    buttonColor={selected ? COLORS.primary : "transparent"}
                  >
                    {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                  </Button>
                );
              })}
            </View>

            <HelperText type="error" visible={!!errors.role}>
              {errors.role}
            </HelperText>
          </View>

          {/* State */}
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
        </Surface>

        {/* Spacer for bottom bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <Button
          mode="outlined"
          onPress={() =>
            setFormData({
              name: "",
              username: "",
              password: "",
              email: "",
              phone: "",
              role: "",
              companies: [],
              mainGroup: [],
              state: [],
            })
          }
          style={styles.btnClear}
          labelStyle={styles.btnClearLabel}
        >
          Clear
        </Button>

        <LinearGradient
          colors={GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btnSubmitGradient}
        >
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.btnSubmit}
            labelStyle={styles.btnSubmitLabel}
            buttonColor="transparent"
          >
            {loading ? "Creating..." : "Create User"}
          </Button>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
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
  field: {
    marginBottom: SPACING.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  inputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  selectRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  selectButton: {
    borderRadius: RADIUS.md,
    borderColor: COLORS.border,
  },
  selectButtonWide: {
    flex: 1,
    minWidth: "45%",
  },
  selectButtonActive: {
    borderColor: COLORS.primary,
  },
  selectButtonLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  selectButtonLabelActive: {
    color: COLORS.textLight,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    flexDirection: "row",
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  btnClear: {
    flex: 1,
    borderRadius: RADIUS.md,
    borderColor: COLORS.border,
    borderWidth: 2,
  },
  btnClearLabel: {
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  btnSubmitGradient: {
    flex: 2,
    borderRadius: RADIUS.md,
  },
  btnSubmit: {
    borderRadius: RADIUS.md,
  },
  btnSubmitLabel: {
    color: COLORS.textLight,
    fontWeight: "600",
  },
});

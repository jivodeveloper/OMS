import React, { useState, useCallback } from "react";
import { View, StyleSheet, ScrollView, Alert, Text, RefreshControl } from "react-native";
import { TextInput, Button, Surface, HelperText } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADIUS, GRADIENTS } from "@/src/constants/theme";
import { masterService, State } from "@/src/services/master.service";
import Dropdown from "@/src/components/common/DropdownProps";
import { userService } from "@/src/services/user.service";
import { router, useFocusEffect } from "expo-router";

export default function AddSchemeScreen() {
    const [loading, setLoading] = useState(false);
    const [states, setStates] = useState<State[]>([]);


    const [schemeName, setSchemeName] = useState("");
    const [itemCode, setItemCode] = useState("");
    const [stateCode, setStateCode] = useState("");

    const [schemeNameError, setSchemeNameError] = useState("");
    const [itemCodeError, setItemCodeError] = useState("");
    const [stateCodeError, setStateCodeError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    useFocusEffect(
        useCallback(() => {
            fetchStates();

            
            return () => {
                setSchemeName("");
                setItemCode("");
                setStateCode("");
                setSchemeNameError("");
                setItemCodeError("");
                setStateCodeError("");
            };
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        setSchemeName("");
        setItemCode("");
        setStateCode("");
        setSchemeNameError("");
        setItemCodeError("");
        setStateCodeError("");
        await fetchStates();
        setRefreshing(false);
    }, []);

    const fetchStates = async () => {
        try {
            const statesData = await masterService.getStates();
            setStates(statesData || []);
        } catch (error) {
            console.log("Error fetching states:", error);
        }
    };

    const validate = () => {
        let isValid = true;

        if (!schemeName.trim()) {
            setSchemeNameError("Scheme name is required");
            isValid = false;
        } else {
            setSchemeNameError("");
        }

        if (!itemCode.trim()) {
            setItemCodeError("Item code is required");
            isValid = false;
        } else {
            setItemCodeError("");
        }

        if (!stateCode) {
            setStateCodeError("State is required");
            isValid = false;
        } else {
            setStateCodeError("");
        }

        return isValid;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setLoading(true);

        try {
            const data = {
                scheme_name: schemeName,
                item_code: itemCode,
                state_code: stateCode,
            };

            const response = await userService.createScheme(data);

            if (response?.success) {
                Alert.alert("Success", "Scheme created successfully!", [
                    {
                        text: "OK",
                        onPress: () => router.back(),
                    },
                ]);
            } else {
                const errorMsg = response?.errors
                    ? Object.values(response.errors).flat().join("\n")
                    : response?.message || "Failed to create scheme";
                Alert.alert("Error", errorMsg);
            }
        } catch (error) {
            console.log("Create scheme error:", error);
            Alert.alert("Error", "Failed to create scheme. Please try again.");
        } finally {
            setLoading(false);
        }
    };


    const stateOptions = states.map((s) => ({ label: s.name, value: s.code }));

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
                }
            >
                <Surface style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionIndicator} />
                        <Text style={styles.sectionTitle}>ADD NEW SCHEME</Text>
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Scheme Name *</Text>
                        <TextInput
                            value={schemeName}
                            onChangeText={(text) => {
                                setSchemeName(text);
                                setSchemeNameError("");
                            }}
                            mode="outlined"
                            placeholder="Enter scheme name"
                            style={styles.input}
                            outlineStyle={styles.inputOutline}
                            outlineColor={COLORS.border}
                            activeOutlineColor={COLORS.primary}
                            error={!!schemeNameError}
                        />
                        {schemeNameError ? (
                            <HelperText type="error" visible={true}>
                                {schemeNameError}
                            </HelperText>
                        ) : null}
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Item Code *</Text>
                        <TextInput
                            value={itemCode}
                            onChangeText={(text) => {
                                setItemCode(text);
                                setItemCodeError("");
                            }}
                            mode="outlined"
                            placeholder="Enter item code"
                            style={styles.input}
                            outlineStyle={styles.inputOutline}
                            outlineColor={COLORS.border}
                            activeOutlineColor={COLORS.primary}
                            error={!!itemCodeError}
                        />
                        {itemCodeError ? (
                            <HelperText type="error" visible={true}>
                                {itemCodeError}
                            </HelperText>
                        ) : null}
                    </View>

                    <View style={styles.field}>
                        <Dropdown
                            label="State *"
                            data={stateOptions}
                            value={stateCode}
                            onChange={(value) => {
                                setStateCode(value);
                                setStateCodeError("");
                            }}
                            placeholder="Select state..."
                            error={stateCodeError}
                            required
                            searchable={true}
                            icon="location-outline"
                        />
                    </View>
                </Surface>
            </ScrollView>

            <View style={styles.bottomBar}>
                <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnSubmitGradient}>
                    <Button
                        mode="contained"
                        onPress={handleSubmit}
                        loading={loading}
                        disabled={loading}
                        style={styles.btnSubmit}
                        labelStyle={styles.btnSubmitLabel}
                        buttonColor="transparent"
                    >
                        {loading ? "Creating..." : "Create Scheme"}
                    </Button>
                </LinearGradient>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background
    },
    scrollView: {
        flex: 1
    },
    scrollContent:
    {
        padding: SPACING.lg,
        paddingBottom: 100
    },
    section: { 
        backgroundColor: COLORS.surface,
         borderRadius: RADIUS.lg, 
         padding: SPACING.lg, 
         marginBottom: SPACING.md,
          borderWidth: 1, 
          borderColor: COLORS.borderLight,
           elevation: 2 
        },
    sectionHeader: { 
        flexDirection: "row", 
        alignItems: "center",
         marginBottom: SPACING.lg },
    sectionIndicator: { width: 2, height: 16, backgroundColor: COLORS.primary, borderRadius: 2, marginRight: SPACING.sm },
    sectionTitle: { fontSize: 11, fontWeight: "600", color: COLORS.primaryDark, letterSpacing: 1 },
    field: { marginBottom: SPACING.sm },
    fieldLabel: { fontSize: 12, fontWeight: "500", color: COLORS.textSecondary, marginBottom: SPACING.sm },
    input: { backgroundColor: COLORS.inputBackground, fontSize: 14 },
    inputOutline: { borderRadius: RADIUS.md, borderWidth: 1.5, color: COLORS.black },
    bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLORS.surface, padding: SPACING.md, paddingBottom: SPACING.xl, flexDirection: "row", gap: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, elevation: 10 },
    btnSubmitGradient: { flex: 1, borderRadius: RADIUS.md },
    btnSubmit: { borderRadius: RADIUS.md },
    btnSubmitLabel: { color: COLORS.textLight, fontWeight: "600" },
});
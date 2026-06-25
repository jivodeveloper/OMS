import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Surface } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { COLORS, GRADIENTS, RADIUS, SPACING } from "@/src/constants/theme";
import {
  OrderFlowConfig,
  OrderFlowConditionOption,
  OrderFlowTypeOption,
  Party,
  PartyFlowConfig,
  orderService,
} from "@/src/services/order.service";

const DEFAULT_CONDITIONS: OrderFlowConditionOption[] = [
  { code: "BASIC_GT_MARKET", label: "Price List (Basic) > Basic Price" },
  { code: "BASIC_LT_MARKET", label: "Price List (Basic) < Basic Price" },
  { code: "BASIC_EQ_MARKET", label: "Price List (Basic) = Basic Price" },
  { code: "BASIC_MARKET_ZERO", label: "Price List (Basic) and Basic Price = 0" },
  { code: "BASIC_ZERO_MARKET_GT_ZERO", label: "Price List (Basic) = 0 and Basic Price > 0" },
];

const DEFAULT_FLOW_OPTIONS: OrderFlowTypeOption[] = [
  { code: "ASM", label: "ASM Order Flow" },
  { code: "BILLING", label: "Billing Orders Flow" },
];

const CONDITION_HELP_TEXT: Record<string, string> = {
  BASIC_GT_MARKET:
    "Exception: Price List (Basic) > 0 and Basic Price = 0 is skipped.",
};

const DEFAULT_CONFIG: OrderFlowConfig = {
  flow_type: "ASM",
  flow_label: "ASM Order Flow",
  flow_options: DEFAULT_FLOW_OPTIONS,
  rate_approval_enabled: true,
  billing_enabled: true,
  auditor_enabled: true,
  rate_conditions: ["BASIC_GT_MARKET"],
  condition_options: DEFAULT_CONDITIONS,
};

const PARTY_DEFAULT_CONFIG: OrderFlowConfig = {
  ...DEFAULT_CONFIG,
  rate_approval_enabled: true,
  billing_enabled: true,
  auditor_enabled: true,
  rate_conditions: ["BASIC_GT_MARKET"],
};

type ApplyMode = "global" | "parties";
type SelectedTarget = { card_code: string; category: string; card_name: string };

const normalizeCategory = (value?: string | null) =>
  String(value || "").trim().toUpperCase();
const normalizeFlowType = (value?: string | null) =>
  String(value || "ASM").trim().toUpperCase();
const getPartyKey = (cardCode?: string | null, category?: string | null) =>
  `${String(cardCode || "").trim()}||${normalizeCategory(category)}`;
const getPartyConfigKey = (
  cardCode?: string | null,
  category?: string | null,
  flowType?: string | null,
) => `${getPartyKey(cardCode, category)}||${normalizeFlowType(flowType)}`;
const getPartyCode = (party: Party) =>
  String(party.card_code || party.value || "").trim();
const getPartyName = (party: Party) =>
  String(party.card_name || party.label || "").trim();
const getPartyCat = (party: Party) => normalizeCategory(party.category);

type CheckboxRowProps = {
  title: string;
  subtitle?: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
};

const CheckboxRow = ({
  title,
  subtitle,
  checked,
  disabled,
  onPress,
}: CheckboxRowProps) => (
  <TouchableOpacity
    style={[styles.checkboxRow, disabled && styles.checkboxRowDisabled]}
    onPress={onPress}
    activeOpacity={0.8}
    disabled={disabled}
  >
    <Ionicons
      name={checked ? "checkbox" : "square-outline"}
      size={24}
      color={disabled ? COLORS.textMuted : checked ? COLORS.primary : COLORS.textSecondary}
    />
    <View style={styles.checkboxTextWrap}>
      <Text style={[styles.checkboxTitle, disabled && styles.disabledText]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.checkboxSubtitle, disabled && styles.disabledText]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  </TouchableOpacity>
);

export default function OrderFlowSettingsScreen() {
  const [config, setConfig] = useState<OrderFlowConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [flowPickerVisible, setFlowPickerVisible] = useState(false);
  const [selectedFlowType, setSelectedFlowType] = useState("ASM");

  // Party-specific flow state
  const [applyMode, setApplyMode] = useState<ApplyMode>("global");
  const [parties, setParties] = useState<Party[]>([]);
  const [partyConfigs, setPartyConfigs] = useState<PartyFlowConfig[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<SelectedTarget[]>([]);
  const [partyPickerVisible, setPartyPickerVisible] = useState(false);
  const [partySearch, setPartySearch] = useState("");

  const isPartyMode = applyMode === "parties";

  const conditionOptions = config.condition_options?.length
    ? config.condition_options
    : DEFAULT_CONDITIONS;
  const flowOptions = config.flow_options?.length
    ? config.flow_options
    : DEFAULT_FLOW_OPTIONS;
  const selectedFlowLabel =
    flowOptions.find((option) => option.code === selectedFlowType)?.label ||
    config.flow_label ||
    "ASM Order Flow";

  const loadConfig = useCallback(async (flowType = selectedFlowType) => {
    try {
      const data = await orderService.getOrderFlowConfig(flowType);
      setConfig({
        ...DEFAULT_CONFIG,
        ...data,
        flow_type: data.flow_type || flowType,
        flow_options: data.flow_options?.length ? data.flow_options : DEFAULT_FLOW_OPTIONS,
        condition_options: data.condition_options?.length
          ? data.condition_options
          : DEFAULT_CONDITIONS,
        rate_conditions: Array.isArray(data.rate_conditions)
          ? data.rate_conditions
          : DEFAULT_CONFIG.rate_conditions,
      });
    } catch (error) {
      console.log("Error loading order flow config:", error);
      Alert.alert("Error", "Failed to load order flow settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFlowType]);

  const loadParties = useCallback(async () => {
    try {
      const [partyData, configData] = await Promise.all([
        orderService.getAllParties(),
        orderService.getPartyFlowConfigs(),
      ]);
      const list = Array.isArray(partyData) ? partyData : [];
      // Keep one entry per party + category; drop exact duplicates.
      const seen = new Set<string>();
      const uniqueParties = list.filter((party) => {
        const code = getPartyCode(party);
        if (!code) return false;
        const key = getPartyKey(code, party.category);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((party) => ({
        ...party,
        category: getPartyCat(party),
      }));
      setParties(uniqueParties);
      const normalizedConfigs = Array.isArray(configData?.data)
        ? configData.data.map((item) => ({
            ...item,
            category: normalizeCategory(item.category),
            flow_type: normalizeFlowType(item.flow_type),
          }))
        : [];
      setPartyConfigs(normalizedConfigs);
    } catch (error) {
      console.log("Error loading parties:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadConfig();
      loadParties();

      return () => {
        // Reset the screen when leaving so returning starts fresh on the
        // global flow with no party selection.
        setApplyMode("global");
        setSelectedTargets([]);
        setPartySearch("");
        setPartyPickerVisible(false);
      };
    }, [loadConfig, loadParties]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadConfig();
    loadParties();
  }, [loadConfig, loadParties]);

  const partyConfigByKey = useMemo(() => {
    return partyConfigs.reduce<Record<string, PartyFlowConfig>>((current, item) => {
      current[getPartyConfigKey(item.card_code, item.category, item.flow_type)] = item;
      return current;
    }, {});
  }, [partyConfigs]);

  const partyNameByKey = useMemo(() => {
    return parties.reduce<Record<string, string>>((current, party) => {
      const code = getPartyCode(party);
      const name = getPartyName(party);
      if (code && name) {
        current[getPartyKey(code, party.category)] = name;
      }
      return current;
    }, {});
  }, [parties]);

  const partyNameByCode = useMemo(() => {
    return parties.reduce<Record<string, string>>((current, party) => {
      const code = getPartyCode(party);
      const name = getPartyName(party);
      if (code && name && !current[code]) {
        current[code] = name;
      }
      return current;
    }, {});
  }, [parties]);

  const getConfigPartyName = (cfg: PartyFlowConfig) =>
    partyNameByKey[getPartyKey(cfg.card_code, cfg.category)] ||
    cfg.card_name ||
    partyNameByCode[cfg.card_code] ||
    cfg.card_code;

  const isTargetSelected = (code: string, category: string) =>
    selectedTargets.some((t) => t.card_code === code && t.category === category);

  const filteredParties = useMemo(() => {
    const term = partySearch.trim().toLowerCase();
    const base = term
      ? parties.filter((party) =>
          [getPartyName(party), getPartyCode(party), party.category, party.state].some(
            (value) => String(value || "").toLowerCase().includes(term),
          ),
        )
      : parties;
    return [...base].sort((a, b) => {
      const aSel = isTargetSelected(getPartyCode(a), getPartyCat(a)) ? 0 : 1;
      const bSel = isTargetSelected(getPartyCode(b), getPartyCat(b)) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return getPartyName(a).localeCompare(getPartyName(b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parties, partySearch, selectedTargets]);

  const applyPartySettings = (settings: PartyFlowConfig) => {
    setConfig((current) => ({
      ...current,
      rate_approval_enabled: settings.rate_approval_enabled,
      billing_enabled: settings.billing_enabled,
      auditor_enabled: settings.auditor_enabled,
      rate_conditions: Array.isArray(settings.rate_conditions) ? settings.rate_conditions : [],
    }));
  };

  // When exactly one party+category is selected, load its saved flow; else defaults.
  const loadSelectionSettings = (targets: SelectedTarget[], flowType: string) => {
    const single =
      targets.length === 1
        ? partyConfigByKey[
            getPartyConfigKey(targets[0].card_code, targets[0].category, flowType)
          ]
        : undefined;
    if (single) applyPartySettings(single);
    else setConfig((current) => ({ ...current, ...PARTY_DEFAULT_CONFIG }));
  };

  const toggleStage = (
    key: "rate_approval_enabled" | "billing_enabled" | "auditor_enabled",
  ) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCondition = (code: string) => {
    setConfig((prev) => {
      const selected = new Set(prev.rate_conditions || []);
      if (selected.has(code)) selected.delete(code);
      else selected.add(code);
      return { ...prev, rate_conditions: Array.from(selected) };
    });
  };

  const handleFlowSelect = (flowType: string) => {
    setSelectedFlowType(flowType);
    setFlowPickerVisible(false);
    if (isPartyMode) {
      loadSelectionSettings(selectedTargets, flowType);
    } else {
      setLoading(true);
      loadConfig(flowType);
    }
  };

  const switchMode = (mode: ApplyMode) => {
    setApplyMode(mode);
    if (mode === "parties") {
      loadSelectionSettings(selectedTargets, selectedFlowType);
    } else {
      setLoading(true);
      loadConfig(selectedFlowType);
    }
  };

  const togglePartySelect = (party: Party) => {
    const code = getPartyCode(party);
    if (!code) return;
    const category = getPartyCat(party);
    setSelectedTargets((current) => {
      const exists = current.some((t) => t.card_code === code && t.category === category);
      const next = exists
        ? current.filter((t) => !(t.card_code === code && t.category === category))
        : [...current, { card_code: code, category, card_name: getPartyName(party) || code }];
      loadSelectionSettings(next, selectedFlowType);
      return next;
    });
  };

  const removeSelectedTarget = (code: string, category: string) => {
    setSelectedTargets((current) =>
      current.filter((t) => !(t.card_code === code && t.category === category)),
    );
  };

  const editConfiguredParty = (cfg: PartyFlowConfig) => {
    const category = normalizeCategory(cfg.category);
    const cardName = getConfigPartyName(cfg);
    setApplyMode("parties");
    setSelectedFlowType(normalizeFlowType(cfg.flow_type));
    setSelectedTargets([
      {
        card_code: cfg.card_code,
        category,
        card_name: cardName,
      },
    ]);
    applyPartySettings(cfg);
  };

  const removeConfiguredParty = (cfg: PartyFlowConfig) => {
    const category = normalizeCategory(cfg.category);
    Alert.alert(
      "Remove Custom Flow",
      `Remove the custom flow for ${getConfigPartyName(cfg)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await orderService.deletePartyFlowConfig(
                [{ card_code: cfg.card_code, category }],
                normalizeFlowType(cfg.flow_type),
              );
              setPartyConfigs((current) =>
                current.filter(
                  (item) =>
                    !(
                      item.card_code === cfg.card_code &&
                      normalizeCategory(item.category) === category &&
                      normalizeFlowType(item.flow_type) === normalizeFlowType(cfg.flow_type)
                    ),
                ),
              );
            } catch (error) {
              console.log("Failed to remove party flow:", error);
              Alert.alert("Error", "Failed to remove custom flow for this party.");
            }
          },
        },
      ],
    );
  };

  const flowPreview = useMemo(() => {
    const stages = ["Order Created"];
    if (config.rate_approval_enabled) stages.push("Rate Approval");
    if (config.billing_enabled) stages.push("Billing");
    if (config.auditor_enabled) stages.push("Auditor");
    stages.push("Completed");
    return stages.join(" -> ");
  }, [config]);

  const previewHint = isPartyMode
    ? selectedTargets.length > 0
      ? `Applies to ${selectedTargets.length} selected part${selectedTargets.length === 1 ? "y" : "ies"}.`
      : "Select parties to apply this flow."
    : config.rate_approval_enabled
      ? "Orders will follow the selected sequence. Rate Approval is used only when the selected price condition matches."
      : "Orders will follow the selected sequence without Rate Approval.";

  const handleSave = async () => {
    if (
      config.rate_approval_enabled &&
      (!config.rate_conditions || config.rate_conditions.length === 0)
    ) {
      Alert.alert(
        "Select condition",
        "Select at least one Rate Approval condition or turn Rate Approval off.",
      );
      return;
    }

    if (isPartyMode) {
      if (selectedTargets.length === 0) {
        Alert.alert("Select party", "Select at least one party to apply this flow to.");
        return;
      }
      try {
        setSaving(true);
        await orderService.savePartyFlowConfig(
          selectedTargets.map((t) => ({ card_code: t.card_code, category: t.category })),
          selectedFlowType,
          {
            rate_approval_enabled: config.rate_approval_enabled,
            billing_enabled: config.billing_enabled,
            auditor_enabled: config.auditor_enabled,
            rate_conditions: config.rate_conditions || [],
          },
        );
        await loadParties();
        setSuccessVisible(true);
      } catch (error) {
        console.log("Failed to save party flow settings:", error);
        Alert.alert("Error", "Failed to save party flow settings.");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      setSaving(true);
      const response = await orderService.updateOrderFlowConfig({
        ...config,
        flow_type: selectedFlowType,
        rate_conditions: config.rate_conditions || [],
      });

      if (response?.success === false) {
        Alert.alert("Error", response.message || "Failed to save order flow.");
        return;
      }

      const savedConfig = response?.data || response;
      setConfig({
        ...DEFAULT_CONFIG,
        ...savedConfig,
        flow_type: savedConfig.flow_type || selectedFlowType,
        flow_options: savedConfig.flow_options?.length
          ? savedConfig.flow_options
          : flowOptions,
        condition_options: savedConfig.condition_options?.length
          ? savedConfig.condition_options
          : conditionOptions,
      });
      setSuccessVisible(true);
    } catch (error) {
      console.log("Error saving order flow config:", error);
      Alert.alert("Error", "Failed to save order flow settings.");
    } finally {
      setSaving(false);
    }
  };

  const partyTriggerLabel =
    selectedTargets.length === 0
      ? "Select parties"
      : selectedTargets.length === 1
        ? `${selectedTargets[0].card_name}${selectedTargets[0].category ? ` (${selectedTargets[0].category})` : ""}`
        : `${selectedTargets.length} selected`;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading order flow...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>APPLY TO</Text>
          </View>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeBtn, !isPartyMode && styles.modeBtnActive]}
              activeOpacity={0.85}
              onPress={() => switchMode("global")}
            >
              <Text style={[styles.modeBtnText, !isPartyMode && styles.modeBtnTextActive]}>
                All Orders (Global)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, isPartyMode && styles.modeBtnActive]}
              activeOpacity={0.85}
              onPress={() => switchMode("parties")}
            >
              <Text style={[styles.modeBtnText, isPartyMode && styles.modeBtnTextActive]}>
                Specific Parties
              </Text>
            </TouchableOpacity>
          </View>
        </Surface>

        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>{isPartyMode ? "FLOW ROLE" : "FLOW TYPE"}</Text>
          </View>
          <TouchableOpacity
            style={styles.flowDropdown}
            activeOpacity={0.85}
            onPress={() => setFlowPickerVisible(true)}
          >
            <View>
              <Text style={styles.flowDropdownLabel}>
                {isPartyMode ? "Flow Role" : "Selected Flow"}
              </Text>
              <Text style={styles.flowDropdownValue}>{selectedFlowLabel}</Text>
            </View>
            <Ionicons name="chevron-down" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </Surface>

        {isPartyMode ? (
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>SELECT PARTIES</Text>
            </View>
            <TouchableOpacity
              style={styles.flowDropdown}
              activeOpacity={0.85}
              onPress={() => {
                setPartySearch("");
                setPartyPickerVisible(true);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.flowDropdownLabel}>Selected Parties</Text>
                <Text style={styles.flowDropdownValue} numberOfLines={1}>
                  {partyTriggerLabel}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>

            {selectedTargets.length > 0 ? (
              <View style={styles.chipWrap}>
                {selectedTargets.map((target) => (
                  <View key={`${target.card_code}||${target.category}`} style={styles.chip}>
                    <Text style={styles.chipText} numberOfLines={1}>
                      {target.card_name}
                      {target.category ? ` · ${target.category}` : ""}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeSelectedTarget(target.card_code, target.category)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.partyHint}>
              The {selectedFlowLabel} stages below replace the global flow for every selected
              party&apos;s {selectedFlowType === "BILLING" ? "billing-created" : "ASM"} orders.
            </Text>
          </Surface>
        ) : null}

        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>ORDER FLOW</Text>
          </View>

          <CheckboxRow
            title="Rate Approval"
            subtitle="Use Rate Approval only for selected price conditions."
            checked={config.rate_approval_enabled}
            onPress={() => toggleStage("rate_approval_enabled")}
          />
          <CheckboxRow
            title="Billing"
            subtitle="Send accepted orders to Billing."
            checked={config.billing_enabled}
            onPress={() => toggleStage("billing_enabled")}
          />
          <CheckboxRow
            title="Auditor"
            subtitle="Send accepted orders to Auditor Approval."
            checked={config.auditor_enabled}
            onPress={() => toggleStage("auditor_enabled")}
          />
        </Surface>

        <Surface style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>RATE CONDITIONS</Text>
          </View>

          {conditionOptions.map((condition) => (
            <CheckboxRow
              key={condition.code}
              title={condition.label}
              subtitle={CONDITION_HELP_TEXT[condition.code]}
              checked={(config.rate_conditions || []).includes(condition.code)}
              disabled={!config.rate_approval_enabled}
              onPress={() => toggleCondition(condition.code)}
            />
          ))}
        </Surface>

        {isPartyMode && partyConfigs.length > 0 ? (
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>PARTIES WITH CUSTOM FLOW</Text>
            </View>

            {partyConfigs.map((cfg) => (
              <View
                key={getPartyConfigKey(cfg.card_code, cfg.category, cfg.flow_type)}
                style={styles.configuredRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.configuredName}>
                    {getConfigPartyName(cfg)}
                  </Text>
                  <Text style={styles.configuredMeta}>
                    {cfg.card_code}
                    {cfg.category ? ` · ${cfg.category}` : ""} · {cfg.flow_label || cfg.flow_type}
                  </Text>
                  <View style={styles.stageTagWrap}>
                    {cfg.rate_approval_enabled ? (
                      <Text style={styles.stageTag}>Rate Approval</Text>
                    ) : null}
                    {cfg.billing_enabled ? <Text style={styles.stageTag}>Billing</Text> : null}
                    {cfg.auditor_enabled ? <Text style={styles.stageTag}>Auditor</Text> : null}
                  </View>
                </View>
                <View style={styles.configuredActions}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    activeOpacity={0.85}
                    onPress={() => editConfiguredParty(cfg)}
                  >
                    <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    activeOpacity={0.85}
                    onPress={() => removeConfiguredParty(cfg)}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Surface>
        ) : (
          <Surface style={styles.previewSection}>
            <Text style={styles.previewLabel}>Flow Preview</Text>
            <Text style={styles.previewText}>{flowPreview}</Text>
            <Text style={styles.previewHint}>{previewHint}</Text>
          </Surface>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <LinearGradient
          colors={GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.saveGradient}
        >
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
            labelStyle={styles.saveButtonLabel}
            buttonColor="transparent"
          >
            {saving ? "Saving..." : isPartyMode ? "Save Party Flow" : "Save Flow"}
          </Button>
        </LinearGradient>
      </View>

      {/* Flow role picker */}
      <Modal
        visible={flowPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFlowPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.flowPickerCard}>
            <Text style={styles.flowPickerTitle}>Select Order Flow</Text>
            {flowOptions.map((option) => {
              const selected = option.code === selectedFlowType;
              return (
                <TouchableOpacity
                  key={option.code}
                  style={[styles.flowOptionRow, selected && styles.flowOptionSelected]}
                  activeOpacity={0.85}
                  onPress={() => handleFlowSelect(option.code)}
                >
                  <Text style={[styles.flowOptionText, selected && styles.flowOptionTextSelected]}>
                    {option.label}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.flowPickerCancel}
              activeOpacity={0.85}
              onPress={() => setFlowPickerVisible(false)}
            >
              <Text style={styles.flowPickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Surface>
        </View>
      </Modal>

      {/* Party multi-select picker */}
      <Modal
        visible={partyPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPartyPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.partyPickerCard}>
            <View style={styles.partyPickerHeader}>
              <Text style={styles.flowPickerTitle}>Select Parties</Text>
              <TouchableOpacity onPress={() => setPartyPickerVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search party by name or code"
                placeholderTextColor={COLORS.textSecondary}
                value={partySearch}
                onChangeText={setPartySearch}
                autoFocus
              />
              {partySearch.length > 0 ? (
                <TouchableOpacity onPress={() => setPartySearch("")}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filteredParties}
              keyExtractor={(item) => `${getPartyCode(item)}||${getPartyCat(item)}`}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const code = getPartyCode(item);
                const category = getPartyCat(item);
                const selected = isTargetSelected(code, category);
                const hasConfig = Boolean(partyConfigByKey[
                  getPartyConfigKey(code, category, selectedFlowType)
                ]);
                return (
                  <TouchableOpacity
                    style={styles.partyRow}
                    activeOpacity={0.8}
                    onPress={() => togglePartySelect(item)}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={22}
                      color={selected ? COLORS.primary : COLORS.textSecondary}
                    />
                    <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                      <Text style={styles.partyName}>
                        {getPartyName(item) || code}
                        {category ? `  ·  ${category}` : ""}
                      </Text>
                      <Text style={styles.partyMeta}>
                        {code}
                        {hasConfig ? ` · ${selectedFlowLabel}` : ""}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.partyEmpty}>No party found</Text>
              }
            />

            <View style={styles.partyPickerFooter}>
              <Text style={styles.partyCount}>{selectedTargets.length} selected</Text>
              <Button
                mode="contained"
                onPress={() => setPartyPickerVisible(false)}
                buttonColor={COLORS.primary}
                labelStyle={{ color: COLORS.textLight }}
              >
                Done
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>

      {/* Success modal */}
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.successModal}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={34} color={COLORS.textLight} />
            </View>
            <Text style={styles.successTitle}>
              {isPartyMode ? "Party Flow Saved" : "Flow Saved"}
            </Text>
            <Text style={styles.successMessage}>
              {isPartyMode
                ? "The selected parties now use this custom order flow."
                : "Order flow settings saved successfully."}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                activeOpacity={0.85}
                onPress={() => setSuccessVisible(false)}
              >
                <Ionicons name="git-branch-outline" size={18} color={COLORS.primary} />
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
          </Surface>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 120,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  sectionIndicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: 0.4,
  },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  modeBtnTextActive: {
    color: COLORS.textLight,
  },
  flowDropdown: {
    minHeight: 58,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flowDropdownLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "700",
  },
  flowDropdownValue: {
    marginTop: 3,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: "800",
  },
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
    maxWidth: 240,
    backgroundColor: COLORS.primaryLighter,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: COLORS.primary, flexShrink: 1 },
  partyHint: {
    marginTop: SPACING.md,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  configuredRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  configuredName: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.text,
  },
  configuredMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  stageTagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  stageTag: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  configuredActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginLeft: SPACING.sm,
  },
  editBtn: {
    padding: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLighter,
  },
  removeBtn: {
    padding: 8,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.errorLight,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  checkboxRowDisabled: {
    opacity: 0.55,
  },
  checkboxTextWrap: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  checkboxTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  checkboxSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  disabledText: {
    color: COLORS.textMuted,
  },
  previewSection: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
  },
  previewText: {
    marginTop: SPACING.xs,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    color: COLORS.text,
  },
  previewHint: {
    marginTop: SPACING.sm,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  saveGradient: {
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  saveButton: {
    borderRadius: RADIUS.md,
  },
  saveButtonLabel: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 4,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    padding: SPACING.lg,
  },
  successModal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: "center",
    elevation: 8,
  },
  flowPickerCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    elevation: 8,
  },
  flowPickerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  flowOptionRow: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: SPACING.sm,
  },
  flowOptionSelected: {
    backgroundColor: COLORS.primaryLighter,
    borderColor: COLORS.borderBlue,
  },
  flowOptionText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: "700",
  },
  flowOptionTextSelected: {
    color: COLORS.primary,
  },
  flowPickerCancel: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.md,
  },
  flowPickerCancelText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: "700",
  },
  partyPickerCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    elevation: 8,
  },
  partyPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  partyName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  partyMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  partyEmpty: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  partyPickerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.sm,
  },
  partyCount: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "700" },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    marginBottom: SPACING.md,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
  },
  successMessage: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
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

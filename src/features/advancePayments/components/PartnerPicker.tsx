import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import Dropdown from "@/src/components/common/DropdownProps";
import { COLORS, SPACING } from "@/src/constants/theme";
import type { AdvancePaymentCompany } from "@/src/services/advancePayment.service";

import { usePartnerSearch } from "../hooks/useAdvanceMasters";
import type { Partner } from "../logic/constants";
import type { PartnerSource } from "../logic/rules";

/**
 * The business partner / employee — a dropdown on the form itself, searched in
 * SAP as you type.
 *
 * ON THE SAME PAGE, not a screen of its own: picking a vendor is one field of
 * this form, and sending the requester to a separate page for it loses the rest
 * of the form from view.
 *
 * SEARCHED ON THE SERVER, not in the list that arrived. SAP holds 500+
 * suppliers per company and the lookup caps there, so filtering locally would
 * silently hide everyone past the cap — hence `searchQuery: () => true`, which
 * says "the server has already filtered this". The VENDA / ORGV prefix is
 * applied to each answer by `usePartnerSearch`.
 */
export default function PartnerPicker({
  label,
  company,
  source,
  value,
  valueName,
  onPick,
  disabled,
  error,
  required = true,
}: {
  label: string;
  company: AdvancePaymentCompany | "";
  source: PartnerSource | null;
  value: string;
  valueName: string;
  onPick: (partner: Partner) => void;
  disabled?: boolean;
  error?: string | null;
  /**
   * False where the partner is genuinely optional — an EXPENSE names a SAP
   * vendor only so the Payment desk is offered their bank accounts; the money
   * goes to G/L accounts either way. Every other case needs one, so this is
   * required until a caller says otherwise.
   */
  required?: boolean;
}) {
  const { partners, error: searchError, search } = usePartnerSearch(company, source);
  const [term, setTerm] = useState("");
  const loaded = useRef(false);

  // The first page as soon as the field can be used, then one query per pause
  // in typing rather than one per keystroke.
  useEffect(() => {
    if (!company || !source) {
      loaded.current = false;
      return;
    }
    const wait = loaded.current ? 350 : 0;
    const timer = setTimeout(() => {
      loaded.current = true;
      search(term.trim());
    }, wait);
    return () => clearTimeout(timer);
  }, [company, source, term, search]);

  /**
   * The chosen partner, kept in the list even when the current search no longer
   * returns them — otherwise the field would show a bare code the moment the
   * requester searched for something else.
   */
  const data = [
    // AN OPTIONAL PARTNER MUST BE REMOVABLE. Without this row a requester who
    // picks a vendor on an Expense by mistake cannot un-pick one — and a
    // field that cannot be emptied is not optional, whatever the label says.
    ...(required ? [] : [{ label: `No ${label.toLowerCase()}`, value: "", code: "" }]),
    ...partners.map((partner) => ({
      label: partner.label,
      value: partner.value,
      code: partner.code ?? partner.value,
    })),
    ...(value && !partners.some((partner) => partner.value === value)
      ? [{ label: valueName || value, value, code: value }]
      : []),
  ];

  return (
    <View style={styles.field}>
      <Dropdown
        label={label}
        required={required}
        data={data}
        value={value}
        onChange={(picked: string) => {
          const row = data.find((candidate) => candidate.value === picked);
          onPick({ value: picked, label: row?.label ?? picked, code: row?.code ?? picked });
        }}
        placeholder={disabled ? "Pick a company first" : `Search ${label.toLowerCase()}`}
        searchPlaceholder="Type a name or SAP code"
        searchable
        onSearchTextChange={setTerm}
        searchQuery={() => true}
        renderItem={(item: { label: string; code: string }) => (
          <View style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={2}>
              {item.label}
            </Text>
            <Text style={styles.rowCode}>{item.code}</Text>
          </View>
        )}
        disabled={disabled}
        error={error ?? searchError ?? undefined}
        mode="modal"
        noBottomSpacing
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: SPACING.md },
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2 },
  rowLabel: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  rowCode: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
});

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import Dropdown from "@/src/components/common/DropdownProps";
import { COLORS } from "@/src/constants/theme";
import {
  SAP_MAX_ROWS,
  advancePaymentError,
  advancePaymentService,
  type AdvancePaymentCompany,
  type SapVendor,
} from "@/src/services/advancePayment.service";

import { PARTNER_CODE_PREFIX } from "../logic/rules";
import { vendorToPartner, withCodePrefix } from "../logic/sapMapping";

/** Everyone, rather than one vendor. Not a SAP code, so it cannot collide. */
export const ALL_VENDORS = "";

/**
 * WHOSE DOCUMENTS TO LIST: one vendor, or all of them.
 *
 * A DROPDOWN, NOT A SEARCH BOX. Typing a fragment and getting whatever matched
 * it is how you find a document; choosing WHOSE documents you are looking at is
 * a different question, and it has a definite answer — so "All vendors" sits at
 * the top of the list, and picking a name below it narrows everything to that
 * one. The search inside the dropdown is how a name is found among five hundred.
 *
 * SEARCHED ON THE SERVER, as the form's partner picker is: SAP holds 500+
 * suppliers per company and the lookup caps there, so filtering the arrived
 * page locally would silently hide everyone past the cap. `searchQuery` says
 * "already filtered"; the VENDA prefix keeps imprest accounts out.
 */
export default function VendorFilter({
  company,
  value,
  valueName,
  onPick,
}: {
  company: AdvancePaymentCompany;
  /** A SAP code, or `ALL_VENDORS`. */
  value: string;
  valueName: string;
  onPick: (vendor: { code: string; name: string }) => void;
}) {
  const [vendors, setVendors] = useState<SapVendor[]>([]);
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const loaded = useRef(false);

  // The first page as soon as the company is known, then one query per pause in
  // typing rather than one per keystroke.
  useEffect(() => {
    loaded.current = false;
  }, [company]);

  useEffect(() => {
    let alive = true;
    const wait = loaded.current ? 350 : 0;
    const timer = setTimeout(() => {
      loaded.current = true;
      advancePaymentService
        .vendors(company, term.trim(), SAP_MAX_ROWS)
        .then((rows) => {
          if (alive) {
            setVendors(withCodePrefix(rows, PARTNER_CODE_PREFIX.SAP_VENDORS));
            setError("");
          }
        })
        .catch((err) => {
          if (alive) setError(advancePaymentError(err));
        });
    }, wait);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [company, term]);

  const partners = vendors.map(vendorToPartner);
  const data = [
    { label: "All vendors", value: ALL_VENDORS, code: "Every vendor's documents" },
    ...partners.map((partner) => ({
      label: partner.label,
      value: partner.value,
      code: partner.code ?? partner.value,
    })),
    // The chosen vendor stays on the list even when the current search no
    // longer returns them, or the field would show a bare code.
    ...(value !== ALL_VENDORS && !partners.some((partner) => partner.value === value)
      ? [{ label: valueName || value, value, code: value }]
      : []),
  ];

  return (
    <View style={styles.field}>
      <Dropdown
        label="Vendor"
        data={data}
        value={value}
        onChange={(picked: string) => {
          const row = data.find((candidate) => candidate.value === picked);
          onPick({
            code: picked,
            name: picked === ALL_VENDORS ? "" : (row?.label ?? picked),
          });
        }}
        placeholder="All vendors"
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
        error={error || undefined}
        mode="modal"
        noBottomSpacing
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 2 },
  row: { paddingHorizontal: 16, paddingVertical: 10 },
  rowLabel: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  rowCode: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
});

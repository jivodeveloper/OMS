import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import AttachmentPicker from "@/app/(main)/payments/_components/AttachmentPicker";
import type { AttachmentStub } from "@/app/(main)/payments/_lib/types";
import { appAlert } from "@/src/components/common/AppDialog";
import Dropdown from "@/src/components/common/DropdownProps";
import { COLORS } from "@/src/constants/theme";
import useBackToOrigin from "@/src/hooks/useBackToOrigin";
import { fs, ms, sp } from "@/src/utils/responsive";
import {
  CREDIT_LIMIT_COMPANIES,
  MAX_CREDIT_LIMIT_LINES,
  attachmentRequired,
  creditLimitError,
  creditLimitLineErrors,
  creditLimitProblems,
  creditLimitService,
  type CreditLimitCompany,
  type CreditLimitCustomer,
} from "@/src/services/creditLimit.service";

import {
  CreditLimitSubmittedDialog,
  CreditLimitSubmittingDialog,
} from "../components/CreditLimitDialogs";
import { Card, DateField, Field, Input, Notice, NoticeText, Row } from "../components/Ui";
import { formatAmount, todayIso, validateDraft } from "../logic";
import { useCustomerLookup } from "../useCreditLimit";

/**
 * Ask for customers' SAP credit limits to be changed.
 *
 * ONE SUBMISSION, SEVERAL PARTIES. The server raises one request per party and
 * routes each on its own, but they are argued together: one company, one set
 * of remarks and one supporting document shared by all of them. Asking for a
 * file per party would mean the same file attached fifty times.
 *
 * ONE PARTY OPEN AT A TIME. Fifty parties unfolded is a form nobody reaches
 * the bottom of, so each is a box that folds to its own one-line summary and
 * opening one closes the rest. A box with something wrong in it is held open
 * regardless — a problem behind a chevron is a problem nobody fixes.
 *
 * ADD IS SHUT UNTIL THE OPEN PARTY IS WHOLE. A row half filled in is the one
 * thing an atomic submission cannot carry: the server refuses the batch, so
 * the second party is offered only once the first would be accepted.
 *
 * THE CUSTOMER IS READ LIVE, per party. The party list is a synced table and
 * can be stale, so the balance and the current limit come straight from SAP —
 * the pair the request is weighed against, and what the server snapshots.
 */

/** One party being asked for, as this form holds it. */
interface Line {
  /** Stable across re-renders, so a removed row does not take its neighbour. */
  key: string;
  cardCode: string;
  cardName: string;
  newLimit: string;
  validTill: string;
  /** What SAP says about this party today; null until it has been read. */
  customer: CreditLimitCustomer | null;
  looking: boolean;
  /** A failed live read, or what the server said about THIS line. */
  error: string;
  /** Folded or not. One is open at a time; a broken one is forced open. */
  open: boolean;
}

let lineSeq = 0;
const newLine = (): Line => ({
  key: `line-${(lineSeq += 1)}`,
  cardCode: "",
  cardName: "",
  newLimit: "",
  validTill: "",
  customer: null,
  looking: false,
  error: "",
  open: true,
});

/** Whether this row would be accepted: filled in, read from SAP, and sane. */
const complete = (line: Line): boolean => {
  if (!line.customer || line.looking) return false;
  const found = validateDraft({
    cardCode: line.cardCode,
    newLimit: line.newLimit,
    validTill: line.validTill,
  });
  return found.missing.length === 0 && found.problems.length === 0;
};

export default function CreditLimitCreateScreen() {
  useBackToOrigin("/(main)/credit-limit/tracking");

  const [company, setCompany] = useState<CreditLimitCompany>("OIL");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<AttachmentStub[]>([]);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  /** Raised: how many, so the Done dialog can say it. */
  const [raised, setRaised] = useState(0);
  /**
   * WHAT THE SERVER SAID, kept on the page after the dialog is dismissed.
   *
   * A refusal read once and gone is a bug nobody can report; this stays under
   * the form, with the HTTP status on it, until the next attempt.
   */
  const [serverFail, setServerFail] = useState<{ headline: string; details: string[] } | null>(
    null,
  );

  const lookup = useCustomerLookup(company);

  const partyOptions = lookup.parties.map((party) => ({
    label: party.card_name || party.card_code,
    value: party.card_code,
    hint: [party.card_code, party.main_group].filter(Boolean).join(" · "),
  }));

  const patchLine = (key: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  /** Read one party's customer live, into that row. */
  const pickParty = async (key: string, cardCode: string) => {
    const party = lookup.parties.find((row) => row.card_code === cardCode);
    patchLine(key, {
      cardCode,
      cardName: party?.card_name ?? cardCode,
      customer: null,
      error: "",
      looking: true,
    });
    try {
      const customer = await creditLimitService.customer(company, cardCode);
      patchLine(key, { customer, looking: false });
    } catch (err) {
      patchLine(key, { looking: false, error: creditLimitError(err) });
    }
  };

  /** A company change invalidates every party and every customer read. */
  const changeCompany = (next: CreditLimitCompany) => {
    setCompany(next);
    setLines([newLine()]);
    setServerFail(null);
  };

  /** ONE OPEN AT A TIME: opening a box folds the others. */
  const toggleLine = (key: string) =>
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, open: !line.open } : { ...line, open: false },
      ),
    );

  /** A new party opens; whatever was open folds to its summary. */
  const addLine = () =>
    setLines((current) => [...current.map((line) => ({ ...line, open: false })), newLine()]);

  const needsFile = attachmentRequired(lines.length);
  const picked = files[0];

  /** What is wrong, row by row and then overall. */
  const rowProblems = lines.map((line) =>
    validateDraft({
      cardCode: line.cardCode,
      newLimit: line.newLimit,
      validTill: line.validTill,
    }),
  );
  const chosen = lines.map((line) => line.cardCode).filter(Boolean);
  const duplicate = chosen.length !== new Set(chosen).size;
  const blocking =
    rowProblems.flatMap((row) => row.problems)[0] ??
    (rowProblems.some((row) => row.missing.length)
      ? `${rowProblems.find((row) => row.missing.length)!.missing[0]} is still needed.`
      : duplicate
        ? "Each party can appear once per submission."
        : lines.some((line) => !line.customer)
          ? "One of the parties could not be read from SAP."
          : needsFile && !picked
            ? "A supporting document is required for a single-party request."
            : "");

  /** Every party whole, so a second one can be asked for. */
  const allComplete = lines.every(complete) && !duplicate;

  const submit = async () => {
    setShowErrors(true);
    setServerFail(null);
    if (blocking) {
      // The blocking reason is already under the form; the dialog names it so
      // it is not missed on a long page.
      appAlert("Not yet", blocking);
      // A row that is the reason gets opened, so the field is reachable.
      setLines((current) => {
        const broken = current.findIndex(
          (line) => !complete(line) || Boolean(line.error),
        );
        if (broken < 0) return current;
        return current.map((line, index) => ({ ...line, open: index === broken }));
      });
      return;
    }
    setSaving(true);
    try {
      const created = await creditLimitService.createRequest({
        company,
        lines: lines.map((line) => ({
          card_code: line.cardCode,
          new_credit_limit: line.newLimit.trim(),
          valid_till: line.validTill,
        })),
        remarks: remarks.trim() || undefined,
        attachment: picked
          ? {
              uri: picked.uri,
              name: picked.name,
              size: picked.size,
              mimeType: picked.mimeType,
            }
          : null,
      });
      // The Done dialog takes it from here, and Done leads to the list.
      setRaised(created.length || lines.length);
    } catch (err) {
      // NOTHING WAS SAVED when lines are named: the submission is atomic, so
      // the rows that failed are what the requester has to fix.
      const failed = creditLimitLineErrors(err);
      const status = (err as { status?: number })?.status;
      const headline = creditLimitError(err);
      const details = [
        ...failed.map(
          (line) => `Party ${line.index + 1} (${line.card_code}): ${line.message}`,
        ),
        ...creditLimitProblems(err),
        ...(status ? [`HTTP ${status} · POST /credit-limit/requests/`] : []),
      ];

      // Mark the rows the server named and open the first of them, so the
      // message sits beside the field it is about.
      if (failed.length) {
        setLines((current) =>
          current.map((line, index) => {
            const named = failed.find((row) => row.index === index);
            return {
              ...line,
              error: named ? named.message : line.error,
              open: named ? named.index === failed[0].index : false,
            };
          }),
        );
      }

      setServerFail({ headline, details });
      appAlert("Could not raise the request", [headline, ...details].join("\n"));
    } finally {
      setSaving(false);
    }
  };

  const clearForm = () =>
    appAlert("Clear this form?", "Everything filled in so far will be lost.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setLines([newLine()]);
          setRemarks("");
          setFiles([]);
          setShowErrors(false);
          setServerFail(null);
        },
      },
    ]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card title="Company">
          <Dropdown
            label="Company"
            required
            data={CREDIT_LIMIT_COMPANIES.map((name) => ({ label: name, value: name }))}
            value={company}
            onChange={(name: string) => changeCompany(name as CreditLimitCompany)}
            searchable={false}
            mode="modal"
          />
          <Text style={styles.hint}>
            Every party in this submission belongs to this company&apos;s SAP.
          </Text>
        </Card>

        {lines.map((line, index) => {
          const problems = rowProblems[index];
          const rowBad =
            Boolean(line.error) ||
            (showErrors && (problems.missing.length > 0 || problems.problems.length > 0));
          // A broken row cannot be folded away: the thing to fix would vanish.
          const open = line.open || rowBad;

          return (
            <View key={line.key} style={[styles.partyCard, rowBad && styles.partyCardBad]}>
              {/* HEADER: what this party is, and the only two things that can
                  be done to the box itself — fold it, or drop it. Remove is an
                  icon, top right, where a row's own delete belongs. */}
              <View style={styles.partyHead}>
                <TouchableOpacity
                  style={styles.partyHeadMain}
                  onPress={() => toggleLine(line.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`Party ${index + 1}`}
                >
                  <View style={[styles.partyBadge, complete(line) && styles.partyBadgeDone]}>
                    {complete(line) ? (
                      <Ionicons name="checkmark" size={ms(13)} color="#fff" />
                    ) : (
                      <Text style={styles.partyBadgeText}>{index + 1}</Text>
                    )}
                  </View>

                  <View style={styles.partyHeadText}>
                    <Text style={styles.partyTitle} numberOfLines={1}>
                      {line.cardName || `Party ${index + 1}`}
                    </Text>
                    {/* FOLDED, THE SUMMARY IS THE BOX: the asked-for limit and
                        the date, which is what distinguishes one row. */}
                    <Text style={styles.partySummary} numberOfLines={1}>
                      {line.newLimit
                        ? `${formatAmount(line.newLimit)} · till ${line.validTill || "—"}`
                        : "Not filled in yet"}
                    </Text>
                  </View>

                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>

                {lines.length > 1 ? (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() =>
                      setLines((current) => current.filter((row) => row.key !== line.key))
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove party ${index + 1}`}
                  >
                    <Ionicons name="trash-outline" size={ms(16)} color={COLORS.error} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {open ? (
                <View style={styles.partyBody}>
                  <Dropdown
                    label="Customer"
                    required
                    data={partyOptions}
                    value={line.cardCode}
                    onChange={(code: string) => void pickParty(line.key, code)}
                    placeholder={
                      lookup.loadingParties ? "Loading parties…" : "Select the customer"
                    }
                    searchable
                    searchPlaceholder="Search name or code"
                    renderItem={(item: { label: string; hint?: string }) => (
                      <View style={styles.option}>
                        <Text style={styles.optionLabel} numberOfLines={2}>
                          {item.label}
                        </Text>
                        {item.hint ? <Text style={styles.optionHint}>{item.hint}</Text> : null}
                      </View>
                    )}
                    error={
                      (showErrors && !line.cardCode ? "Party is required." : undefined) ??
                      lookup.partiesError ??
                      undefined
                    }
                    mode="modal"
                  />

                  {line.looking ? (
                    <View style={styles.lookupRow}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={styles.lookupText}>Reading the customer from SAP…</Text>
                    </View>
                  ) : null}

                  {line.error ? (
                    <Notice tone="bad">
                      <NoticeText tone="bad" text={line.error} />
                    </Notice>
                  ) : null}

                  {/* WHAT SAP HOLDS TODAY — the pair this row is asking to
                      change. The name takes the left and all the room it
                      needs; the two short facts sit on the right, their own
                      text still left-aligned so the column reads as one. */}
                  {line.customer ? (
                    <View style={styles.sapBox}>
                      <View style={styles.sapHead}>
                        <Ionicons name="server-outline" size={ms(14)} color={COLORS.primary} />
                        <Text style={styles.sapTitle}>From SAP</Text>
                      </View>
                      <View style={styles.sapSplit}>
                        <View style={styles.sapLeft}>
                          <SapFact label="Customer" value={line.customer.card_name} lines={3} />
                          <SapFact label="Balance" value={formatAmount(line.customer.balance)} />
                        </View>
                        <View style={styles.sapRight}>
                          <SapFact label="Main group" value={line.customer.main_group || "—"} />
                          <SapFact
                            label="Current limit"
                            value={formatAmount(line.customer.credit_limit)}
                            strong
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <Row>
                    <Field
                      label="New Credit Limit"
                      required
                      error={
                        showErrors
                          ? !line.newLimit
                            ? "New Credit Limit is required."
                            : problems.problems.find((problem) =>
                                problem.startsWith("New Credit Limit"),
                              )
                          : undefined
                      }
                    >
                      <Input
                        value={line.newLimit}
                        onChangeText={(value) =>
                          patchLine(line.key, { newLimit: value.replace(/[^0-9.]/g, "") })
                        }
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        prefix="₹"
                        editable={Boolean(line.customer)}
                        invalid={showErrors && !line.newLimit}
                      />
                    </Field>
                    <Field
                      label="Valid Till"
                      required
                      error={
                        showErrors
                          ? !line.validTill
                            ? "Valid Till is required."
                            : problems.problems.find((problem) =>
                                problem.startsWith("Valid Till"),
                              )
                          : undefined
                      }
                    >
                      <DateField
                        value={line.validTill}
                        onChange={(value) => patchLine(line.key, { validTill: value })}
                        minDate={todayIso()}
                        editable={Boolean(line.customer)}
                        invalid={showErrors && !line.validTill}
                      />
                    </Field>
                  </Row>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* ADD IS SHUT UNTIL EVERY PARTY WOULD BE ACCEPTED. The submission is
            atomic — a half-filled row refuses the whole batch — so the next
            party is offered only once this one is whole. */}
        {lines.length < MAX_CREDIT_LIMIT_LINES ? (
          <TouchableOpacity
            style={[styles.addBtn, !allComplete && styles.addBtnOff]}
            onPress={addLine}
            disabled={!allComplete}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !allComplete }}
          >
            <Ionicons
              name="add-circle-outline"
              size={18}
              color={allComplete ? COLORS.primary : COLORS.textMuted}
            />
            <Text style={[styles.addText, !allComplete && styles.addTextOff]}>
              {allComplete ? "Add another party" : "Finish this party to add another"}
            </Text>
          </TouchableOpacity>
        ) : null}

        <Card title="Shared by every party">
          <Field label="Remarks">
            <Input
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Why the limits should change"
              multiline
            />
          </Field>

          {/* REQUIRED FOR ONE PARTY, optional for several — the server's own
              rule, said here so the requester learns it before the refusal. */}
          <View style={styles.fileBox}>
            <AttachmentPicker
              label={needsFile ? "Attachment (required)" : "Attachment"}
              attachments={files}
              maxFiles={1}
              onAdd={(added) =>
                setFiles(
                  added.slice(0, 1).map((file) => ({
                    id: `${file.name}-${file.size}`,
                    name: file.name,
                    uri: file.uri,
                    mimeType: file.mimeType,
                    size: file.size,
                  })),
                )
              }
              onRemove={() => setFiles([])}
            />
            <Text style={styles.hint}>
              {needsFile
                ? "A single-party request needs a supporting document."
                : "Optional for a submission of several parties."}
            </Text>
          </View>
        </Card>

        {/* WHAT IS STOPPING THE SUBMISSION, and then what the server said about
            the last attempt. Both stay on the page: a refusal read once in a
            dialog and gone is a bug nobody can report. */}
        {showErrors && blocking ? (
          <View style={styles.blockingWrap}>
            <Notice tone="bad">
              <NoticeText tone="bad" text={blocking} />
            </Notice>
          </View>
        ) : null}

        {serverFail ? (
          <View style={styles.failBox}>
            <View style={styles.failHead}>
              <Ionicons name="alert-circle" size={ms(16)} color={COLORS.error} />
              <Text style={styles.failTitle}>The server refused this</Text>
            </View>
            <Text style={styles.failLine}>{serverFail.headline}</Text>
            {serverFail.details.map((detail) => (
              <Text key={detail} style={styles.failDetail}>
                • {detail}
              </Text>
            ))}
            <Text style={styles.failNote}>Nothing was saved. Fix the above and submit again.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actionBox}>
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={clearForm}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Clear the form"
        >
          <Ionicons name="close" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnOff]}
          onPress={submit}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={16} color="#fff" />
              <Text style={styles.submitBtnText}>
                {lines.length > 1 ? `Submit ${lines.length} Requests` : "Submit Request"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* IN FLIGHT, then raised. The second dismisses to the list — there is
          nothing left to do on a form whose request is already with its
          approver, and leaving it filled in invites a second submission. */}
      <CreditLimitSubmittingDialog visible={saving} />
      {raised > 0 ? (
        <CreditLimitSubmittedDialog
          count={raised}
          company={company}
          onDone={() => {
            setRaised(0);
            router.replace("/(main)/credit-limit/tracking" as never);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** One fact SAP holds. */
function SapFact({
  label,
  value,
  strong = false,
  lines = 2,
}: {
  label: string;
  value: string;
  strong?: boolean;
  lines?: number;
}) {
  return (
    <View>
      <Text style={styles.sapLabel}>{label}</Text>
      <Text style={[styles.sapValue, strong && styles.sapValueStrong]} numberOfLines={lines}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  content: { padding: sp(14), paddingBottom: sp(28) },

  hint: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(8), lineHeight: fs(16) },

  option: { paddingHorizontal: sp(16), paddingVertical: sp(10) },
  optionLabel: { fontSize: fs(14), fontWeight: "700", color: COLORS.text },
  optionHint: { fontSize: fs(11), color: COLORS.textSecondary, marginTop: 2 },

  // ── The party box ──────────────────────────────────────────────────
  partyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: sp(14),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: sp(12),
    overflow: "hidden",
  },
  partyCardBad: { borderColor: COLORS.error },
  partyHead: { flexDirection: "row", alignItems: "center", paddingRight: sp(4) },
  // `minWidth: 0` so a long customer name ellipsises rather than pushing the
  // chevron and the delete icon off the row.
  partyHeadMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    paddingHorizontal: sp(12),
    paddingVertical: sp(12),
  },
  partyBadge: {
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLighter,
  },
  partyBadgeDone: { backgroundColor: COLORS.success },
  partyBadgeText: { fontSize: fs(12), fontWeight: "900", color: COLORS.primary },
  partyHeadText: { flex: 1, minWidth: 0 },
  partyTitle: { fontSize: fs(13.5), fontWeight: "800", color: COLORS.text },
  partySummary: { fontSize: fs(11.5), color: COLORS.textSecondary, marginTop: 1 },
  removeBtn: {
    width: ms(32),
    height: ms(32),
    alignItems: "center",
    justifyContent: "center",
  },
  partyBody: {
    paddingHorizontal: sp(12),
    paddingBottom: sp(12),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: sp(12),
  },

  lookupRow: { flexDirection: "row", alignItems: "center", gap: sp(8), marginTop: sp(8) },
  lookupText: { fontSize: fs(12), color: COLORS.textSecondary },

  sapBox: {
    marginTop: sp(12),
    padding: sp(12),
    borderRadius: sp(12),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  sapHead: { flexDirection: "row", alignItems: "center", gap: sp(6), marginBottom: sp(8) },
  sapTitle: { fontSize: fs(12), fontWeight: "800", color: COLORS.primary },
  // The name gets the room; the two short facts take a fixed column on the
  // right and keep their own text left-aligned.
  sapSplit: { flexDirection: "row", gap: sp(10) },
  sapLeft: { flex: 1, minWidth: 0, gap: sp(6) },
  sapRight: { width: "38%", gap: sp(6) },
  sapLabel: { fontSize: fs(11), color: COLORS.textSecondary },
  sapValue: { fontSize: fs(13), fontWeight: "700", color: COLORS.text, marginTop: 1 },
  sapValueStrong: { fontSize: fs(14), fontWeight: "900", color: COLORS.primary },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(6),
    marginBottom: sp(14),
    paddingVertical: sp(12),
    borderRadius: sp(12),
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.borderBlue,
    backgroundColor: COLORS.primaryLighter,
  },
  addBtnOff: {
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
  },
  addText: { fontSize: fs(13), fontWeight: "800", color: COLORS.primary },
  addTextOff: { color: COLORS.textMuted },

  // Remarks and the attachment are two questions, not one block of controls.
  fileBox: { marginTop: sp(14) },

  blockingWrap: { marginTop: sp(4) },

  failBox: {
    marginTop: sp(10),
    padding: sp(12),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorLight,
    gap: sp(3),
  },
  failHead: { flexDirection: "row", alignItems: "center", gap: sp(6), marginBottom: sp(2) },
  failTitle: { fontSize: fs(12.5), fontWeight: "800", color: COLORS.error },
  failLine: { fontSize: fs(12.5), fontWeight: "700", color: COLORS.text, lineHeight: fs(18) },
  failDetail: { fontSize: fs(11.5), color: COLORS.textSecondary, lineHeight: fs(17) },
  failNote: { fontSize: fs(11), color: COLORS.textMuted, marginTop: sp(4) },

  actionBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    paddingHorizontal: sp(14),
    paddingVertical: sp(12),
  },
  clearBtn: {
    width: ms(44),
    height: ms(44),
    borderRadius: sp(12),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(8),
    height: ms(44),
    borderRadius: sp(12),
    backgroundColor: COLORS.primary,
  },
  submitBtnOff: { opacity: 0.7 },
  submitBtnText: { fontSize: fs(14), fontWeight: "800", color: "#fff" },
});

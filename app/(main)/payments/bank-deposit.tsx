import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { Button, Surface, TextInput } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { appAlert } from "@/src/components/common/AppDialog";
import Dropdown from "@/src/components/common/DropdownProps";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import FormField from "./_components/FormField";
import DepositPaymentRow from "./_components/DepositPaymentRow";
import AttachmentPicker from "./_components/AttachmentPicker";
import type { PickedFile } from "./_lib/pickAttachment";
import DepositLoadingDialog, {
  type DepositStage,
} from "@/src/features/payments/components/DepositLoadingDialog";
import PaymentSuccessDialog, {
  type PaymentSuccessKind,
} from "@/src/features/payments/components/PaymentSuccessDialog";
import { formatAmount } from "./_lib/constants";
import {
  messageFrom,
  useBankAccounts,
  useCollectionPersons,
  useCompanies,
} from "@/src/features/payments/usePaymentMasters";
import usePaymentPermissions from "@/src/features/payments/usePaymentPermissions";
import paymentsService, {
  type Company,
  type DepositableReceipt,
} from "@/src/services/payments.service";
import {
  DATE_RANGE_CUSTOM,
  DATE_RANGE_OPTIONS,
  DEPOSIT_TYPE_OPTIONS,
  type DepositablePayment,
  type DepositPaymentMethod,
} from "./_lib/depositData";

// Android needs this opt-in for LayoutAnimation to run at all.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Permission gate — the screen only mounts for users who may open it. */
export default function BankDepositRoute() {
  const { depositId } = useLocalSearchParams<{ depositId?: string }>();

  /**
   * CREATING is gated by the page grant; EDITING is not — the same split the
   * payment form makes.
   *
   * They are different rights. An approver may correct a deposit sitting in
   * their queue (that is how a SAP rejection gets fixed) but must not be able
   * to raise a new one. Guarding both with the one key would lock approvers
   * out of the very correction they are there to make.
   *
   * Editing is authorised per-document by the server (`permissions.can_edit`),
   * and PATCH re-checks it, so there is a real boundary here rather than none.
   */
  if (depositId) return <BankDepositScreen />;

  return (
    <ScreenGuard screen="payments/bank-deposit">
      <BankDepositScreen />
    </ScreenGuard>
  );
}

function BankDepositScreen() {
  /**
   * One screen, two jobs. With `depositId` it loads that deposit, prefills
   * every field and saves with PATCH; without it, it creates. Sharing the
   * screen means the edit form can never drift from the create form.
   */
  const params = useLocalSearchParams<{ depositId?: string }>();
  const editingId = Number(params.depositId) || null;
  const isEdit = editingId != null;
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  /**
   * Whether this editor may put the deposit back into the chain.
   *
   * Server-decided (`permissions.can_resubmit`): only the creator resubmits,
   * and only when no approval chain is open.
   */
  const [canResubmit, setCanResubmit] = useState(false);

  const [company, setCompany] = useState<string | null>(null);
  // Today, not a baked-in date — a hardcoded one silently backdates every
  // deposit made after it.
  const [depositDate, setDepositDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [depositedBy, setDepositedBy] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState<string | null>(null);
  const [depositType, setDepositType] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");

  const [listExpanded, setListExpanded] = useState(true);
  const [search, setSearch] = useState("");
  // Empty = no date filter applied; set by the picker below.
  // Range preset ("2d" | "7d" | "custom"); defaults to the last 2 days.
  const [dateRange, setDateRange] = useState<string>("2d");
  // Only set when the preset is `custom` — the specific day chosen.
  const [customDate, setCustomDate] = useState("");
  const [showFilterDatePicker, setShowFilterDatePicker] = useState(false);
  const [partyFilter, setPartyFilter] = useState<string | null>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /**
   * What is actually being banked. Auto-filled from the selection so the common
   * case (deposit everything collected) needs no typing, but editable because
   * the depositor sometimes banks less than they collected. `depositTouched`
   * tracks whether they've overridden it — once they have, changing the
   * selection must not silently overwrite their figure.
   */
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTouched, setDepositTouched] = useState(false);
  const [shortfallReason, setShortfallReason] = useState("");

  // Real picked files. These were previously two strings set to a hardcoded
  // "deposit-slip.jpg" — the card showed a filename but nothing was ever
  // uploaded, so the deposit posted with no proof attached.
  const [slipFiles, setSlipFiles] = useState<PickedFile[]>([]);
  const [receiptFiles, setReceiptFiles] = useState<PickedFile[]>([]);
  const [saving, setSaving] = useState(false);
  // Which round trip the progress dialog is reporting. Recording a deposit is
  // create -> upload each file -> submit, so a single "please wait" would read
  // as hung on a slow link; naming the step shows it is still moving.
  const [stage, setStage] = useState<DepositStage>("saving");
  const [uploadAt, setUploadAt] = useState<{ index: number; total: number }>({
    index: 0,
    total: 0,
  });
  const [success, setSuccess] = useState<{
    kind: PaymentSuccessKind;
    /** Where to land after an edit — the deposit that was just changed. */
    depositId: number;
    depositNo: string;
    date: string;
    time: string;
    note?: string;
  } | null>(null);

  /**
   * Prefill from the deposit being edited.
   *
   * Runs once per id. The receipt picker is left COLLAPSED afterwards: the
   * banked receipts are already chosen, and opening the list would invite an
   * accidental change to a selection the editor did not come to touch.
   */
  useEffect(() => {
    if (!editingId) return;
    let alive = true;
    (async () => {
      try {
        const d = await paymentsService.getDeposit(editingId);
        if (!alive) return;
        setCompany(d.company);
        setDepositDate(d.deposit_date);
        setDepositedBy(d.deposited_by != null ? String(d.deposited_by) : null);
        setBankAccount(d.bank_key || null);
        setDepositType((d.deposit_type || "").toLowerCase() || null);
        setRemarks(d.remarks || "");
        setDepositAmount(String(d.deposit_amount ?? ""));
        // The figure was typed once already; treat it as authored so the
        // auto-fill from the selection does not overwrite it.
        setDepositTouched(true);
        setShortfallReason(d.shortfall_reason || "");
        setSelectedIds((d.lines ?? []).map((l) => String(l.receipt)));
        setCanResubmit(!!d.permissions?.can_resubmit);
        setListExpanded(false);
      } catch {
        appAlert("Could not load", "This deposit could not be opened for editing.");
      } finally {
        if (alive) setLoadingExisting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editingId]);

  // ── Live master data ──────────────────────────────────────────────────
  const companies = useCompanies();
  const selectedCompany = (company as Company | null) ?? null;
  const depositors = useCollectionPersons(selectedCompany);
  const bankAccounts = useBankAccounts(selectedCompany);
  const permissions = usePaymentPermissions();

  // Approved receipts awaiting banking, for the chosen company. Loaded here
  // rather than through useAsyncList because the row shape needs mapping into
  // what DepositPaymentRow renders.
  const [payments, setPayments] = useState<DepositableReceipt[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  // Bumped after a deposit is raised, to re-run the effect below: the receipts
  // just banked must disappear from the picker.
  const [receiptsRefreshKey, setReceiptsRefreshKey] = useState(0);

  useEffect(() => {
    if (!selectedCompany) {
      setPayments([]);
      setPaymentsError("");
      return;
    }
    let active = true;
    setPaymentsLoading(true);
    paymentsService
      // On an edit, ask for this deposit's own receipts too — they are banked
      // HERE, so the plain list leaves them out and the selection vanishes.
      .getDepositableReceipts(selectedCompany, editingId)
      .then((rows) => {
        if (!active) return;
        setPayments(rows);
        setPaymentsError("");
      })
      .catch((err) => {
        if (!active) return;
        setPayments([]);
        setPaymentsError(messageFrom(err, "Failed to load payments"));
      })
      .finally(() => {
        if (active) setPaymentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCompany, receiptsRefreshKey, editingId]);

  // Party filter options are derived from what actually loaded, so the list can
  // never offer a party with no depositable payments.
  const partyFilterOptions = useMemo(() => {
    const names = [...new Set(payments.map((p) => p.card_name))].sort();
    return [
      { label: "All Parties", value: "all" },
      ...names.map((n) => ({ label: n, value: n })),
    ];
  }, [payments]);

  const animate = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
  }, []);

  // Filtering is display work over what the API returned.
  const visiblePayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (
        partyFilter &&
        partyFilter !== "all" &&
        payment.card_name !== partyFilter
      ) {
        return false;
      }
      if (!term) return true;
      return (
        payment.card_name.toLowerCase().includes(term) ||
        payment.receipt_no.toLowerCase().includes(term)
      );
    });
  }, [payments, search, partyFilter]);

  const selectedPayments = payments.filter((payment) =>
    selectedIds.includes(String(payment.id)),
  );

  /**
   * "CHQ 1470 · ICICI · 13-08-2026" for a receipt's cheque lines, or undefined
   * when it has none.
   *
   * The employee is holding the physical cheque while they tick this row, so
   * the number and bank are what let them confirm they have the right one.
   * Several cheques on one receipt are joined, since all of them are being
   * handed over together.
   */
  const chequeDetailFor = (
    receipt: DepositableReceipt,
  ): string | undefined => {
    const parts = (receipt.methods ?? [])
      .filter((m) => m.method === "CHEQUE")
      .map((m) =>
        [
          m.cheque_number ? `CHQ ${m.cheque_number}` : null,
          m.bank_name || null,
          m.cheque_date || null,
        ]
          .filter(Boolean)
          .join(" · "),
      )
      .filter((text) => text.length > 0);
    return parts.length ? parts.join("  |  ") : undefined;
  };

  /** Sum one payment method across a receipt's lines — a receipt can mix them. */
  const sumMethod = (receipt: DepositableReceipt, kind: "CASH" | "CHEQUE") =>
    (receipt.methods ?? [])
      .filter((m) => m.method === kind)
      .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  /**
   * Adapt an API receipt to what DepositPaymentRow renders.
   *
   * Done here rather than by changing the component: the row is presentational
   * and its existing shape is fine — only the source of the data changed. A
   * receipt can mix methods, so the badge shows the dominant one.
   */
  const toRowShape = (receipt: DepositableReceipt): DepositablePayment => {
    const cash = sumMethod(receipt, "CASH");
    const cheque = sumMethod(receipt, "CHEQUE");
    // Only ever Cash or Cheque: the endpoint no longer offers UPI-only
    // receipts, and for a mixed receipt it is the physical part that gets
    // carried to the bank. Labelling one "UPI" would name the very portion
    // that is NOT being deposited.
    const method: DepositPaymentMethod = cheque > cash ? "Cheque" : "Cash";
    return {
      id: String(receipt.id),
      party: receipt.card_name,
      invoice: receipt.receipt_no,
      date: receipt.payment_date,
      method,
      // The bankable part only, matching what the totals below sum. Showing
      // the full receipt value here would make the row and the "Collected"
      // figure disagree on a mixed-method receipt.
      amount: cash + cheque,
      status: "pending",
      chequeDetail: chequeDetailFor(receipt),
    };
  };

  const totalCash = selectedPayments.reduce(
    (sum, p) => sum + sumMethod(p, "CASH"),
    0,
  );
  const totalCheque = selectedPayments.reduce(
    (sum, p) => sum + sumMethod(p, "CHEQUE"),
    0,
  );

  /**
   * What the selection is worth AS A DEPOSIT — cash + cheque only.
   *
   * Deliberately NOT `total_amount`: on a receipt that mixes methods that
   * figure includes the UPI portion, which is already in the bank and is not
   * being carried anywhere. Using it asked the user to deposit ₹200 for a
   * receipt where only ₹100 was ever in hand.
   */
  const totalSelected = selectedPayments.reduce(
    (sum, p) => sum + sumMethod(p, "CASH") + sumMethod(p, "CHEQUE"),
    0,
  );

  /** Everything available to bank for this company, not just the selection. */
  const availableBalance = useMemo(
    () => ({
      cash: payments.reduce((sum, p) => sum + sumMethod(p, "CASH"), 0),
      cheque: payments.reduce((sum, p) => sum + sumMethod(p, "CHEQUE"), 0),
    }),
    [payments],
  );

  // "Collected" is always the sum of the selection; "deposited" is what the user
  // says they banked. Until they edit it, the two track each other.
  const collectedAmount = totalSelected;
  const depositedAmount = depositTouched
    ? Number(depositAmount) || 0
    : collectedAmount;

  const difference = collectedAmount - depositedAmount;
  const isShort = difference > 0;
  const isOver = difference < 0;
  // A reason is only demanded once there is something to explain.
  const reasonRequired = isShort && collectedAmount > 0;
  const reasonMissing = reasonRequired && shortfallReason.trim().length === 0;

  const togglePayment = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id];

      // Keep the deposit figure mirroring the selection while it is still
      // auto-filled; once the user has typed their own, leave it alone.
      if (!depositTouched) {
        const nextTotal = payments
          .filter((p) => next.includes(String(p.id)))
          .reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
        setDepositAmount(nextTotal ? String(nextTotal) : "");
      }
      return next;
    });
  };

  /** Picking "Select date..." opens the picker; the presets apply immediately. */
  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    if (value === DATE_RANGE_CUSTOM) {
      setShowFilterDatePicker(true);
    } else {
      setCustomDate("");
    }
  };

  /**
   * Progressive disclosure: each field unlocks only once the one before it is
   * answered, so the form is filled in a deterministic order and a later choice
   * can never be made against a stale earlier one.
   *
   * Company → Deposit Date → Deposited By → Bank Account → Deposit Type →
   * payment selection → deposit amount.
   */
  const canPickDate = !!company;
  const canPickDepositedBy = canPickDate && !!depositDate;
  const canPickBankAccount = canPickDepositedBy && !!depositedBy;
  const canPickDepositType = canPickBankAccount && !!bankAccount;
  const headerComplete = canPickDepositType && !!depositType;

  // Submit gating, in the same order as the fields so the disabled button always
  // reflects the FIRST thing still outstanding.
  const submitBlocked =
    !company ||
    !depositDate ||
    !depositedBy ||
    !bankAccount ||
    !depositType ||
    !selectedIds.length ||
    depositedAmount <= 0 ||
    isOver ||
    reasonMissing ||
    saving ||
    // Creating needs the grant; EDITING does not — the server has already
    // decided the caller may edit THIS deposit (an approver holding a
    // SAP-rejected one always may), and re-testing a create permission here
    // would block the very correction the approver is there to make.
    (!isEdit && !permissions.canCreateDeposit);

  /**
   * Create the deposit and send it into the approval chain.
   *
   * Two calls, like the receipt flow: if the submit fails the deposit survives
   * as a draft rather than being lost, and the message says so.
   */
  /**
   * Clear the form after a deposit is raised.
   *
   * This screen stays mounted, so without it the next deposit opens holding
   * the last one's receipts, amount and attachments — and the receipts it
   * lists have already been banked, so the selection is not just stale but
   * invalid. Company and date are re-seeded rather than blanked: a collector
   * raising several deposits in a row is almost always in the same company,
   * and the date should be today, not whatever was typed last time.
   */
  const resetForm = useCallback(() => {
    setDepositedBy(null);
    setBankAccount(null);
    setDepositType(null);
    setRemarks("");
    setSelectedIds([]);
    setDepositAmount("");
    setDepositTouched(false);
    setShortfallReason("");
    setSlipFiles([]);
    setReceiptFiles([]);
    setSearch("");
    setPartyFilter("all");
    setListExpanded(true);
    setDepositDate(new Date().toISOString().slice(0, 10));
    // Re-fetch: the receipts just banked must disappear from the picker.
    setReceiptsRefreshKey((n) => n + 1);
  }, []);

  const handleSubmit = async () => {
    if (submitBlocked) return;
    setStage("saving");
    setUploadAt({ index: 0, total: 0 });
    setSaving(true);
    try {
      const payload = {
        company: selectedCompany as Company,
        deposit_date: depositDate,
        deposited_by: depositedBy ? Number(depositedBy) : null,
        bank_key: String(bankAccount),
        deposit_type: String(depositType).toUpperCase() as
          | "CASH"
          | "CHEQUE"
          | "MIXED",
        collected_amount: String(collectedAmount),
        deposit_amount: String(depositedAmount),
        shortfall_reason: isShort ? shortfallReason.trim() : "",
        remarks,
        receipt_ids: selectedIds.map((id) => Number(id)),
      };
      // PATCH keeps the deposit number and its place in the chain; POST mints
      // a new one. Correcting a SAP failure must never create a second
      // document for the same physical hand-over.
      const deposit = isEdit
        ? await paymentsService.updateDeposit(editingId as number, payload)
        : await paymentsService.createDeposit(payload);

      // Upload BEFORE submitting. Once the deposit enters the approval chain
      // an approver may open it immediately, and proof that arrives after they
      // have looked is proof they never saw.
      const failedUploads: string[] = [];
      // Counted across BOTH kinds so the dialog reads "3 of 5", not "1 of 2"
      // twice over — the user is watching one queue of files, not two.
      const totalUploads = slipFiles.length + receiptFiles.length;
      let uploadedSoFar = 0;
      if (totalUploads > 0) setStage("uploading");
      for (const [files, kind] of [
        [slipFiles, "DEPOSIT_SLIP"],
        [receiptFiles, "DEPOSIT_RECEIPT"],
      ] as const) {
        for (const file of files) {
          uploadedSoFar += 1;
          setUploadAt({ index: uploadedSoFar, total: totalUploads });
          try {
            await paymentsService.uploadDepositAttachment(
              deposit.id,
              { uri: file.uri, name: file.name, mimeType: file.mimeType },
              kind,
            );
          } catch {
            failedUploads.push(file.name);
          }
        }
      }

      /**
       * Only the CREATOR resubmits, and only when no chain is open.
       *
       * An approver editing a deposit parked at their rung is correcting it in
       * place — it is already in the chain, with them — so submitting again
       * would restart a ladder they are standing on. `can_resubmit` is decided
       * by the server for exactly this reason.
       */
      const needsSubmit = !isEdit || canResubmit;
      if (needsSubmit) {
        setStage("submitting");
        try {
          await paymentsService.submitDeposit(deposit.id);
        } catch (err) {
          // Drop the progress dialog BEFORE the alert. Both are Modals, and
          // `finally` has not run yet, so raising the alert first would stack
          // it on top of a spinner still claiming to be working.
          setSaving(false);
          appAlert(
            "Saved as draft",
            `${deposit.deposit_no ?? "The deposit"} was saved but could not be submitted: ${messageFrom(err)}. Submit it again from the deposits list.`,
          );
          return;
        }
      }

      const now = new Date();
      setSuccess({
        // An approver correcting a deposit parked at their own rung has not
        // sent it anywhere — it is still with them — so it must not claim to
        // have been created or resubmitted.
        kind: needsSubmit ? (isEdit ? "resubmitted" : "created") : "updated",
        depositId: deposit.id,
        depositNo: deposit.deposit_no ?? "The deposit",
        date: now.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        time: now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        note: failedUploads.length
          ? `${failedUploads.length} attachment(s) could not be uploaded: ${failedUploads.join(", ")}.`
          : undefined,
      });
    } catch (err) {
      // Same reason as the submit failure above: hide the spinner first, then
      // show the alert, so the two Modals never overlap.
      setSaving(false);
      appAlert("Could not record deposit", messageFrom(err));
    } finally {
      setSaving(false);
    }
  };

  /** Reverts the deposit field to tracking the selection again. */
  const resetDepositToCollected = () => {
    setDepositTouched(false);
    setShortfallReason("");
    setDepositAmount(collectedAmount ? String(collectedAmount) : "");
  };

  return (
    <View style={styles.container}>
      {/* `behavior` was undefined on Android, which makes KeyboardAvoidingView
          inert — the keyboard then covered the last fields, Remarks worst of
          all since it sits at the very bottom. "height" works with
          android:windowSoftInputMode=adjustResize. Same fix as receive-payment. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* ── Balance banner, flush under the navbar ──────────────────── */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          {/* Row 1: selection badge left, amount right. */}
          <View style={styles.bannerTopRow}>
            <View style={styles.bannerPill}>
              <Ionicons name="business-outline" size={14} color={COLORS.primary} />
              <Text style={styles.bannerPillText}>
                {selectedIds.length} Selected
              </Text>
            </View>
            {/* Shows what is actually being banked, not the raw selection. */}
            <Text style={styles.bannerAmount} numberOfLines={1}>
              ₹{formatAmount(depositedAmount)}
            </Text>
          </View>

          {/* Row 2: balance chips left, label right — mirrors row 1's axis. */}
          <View style={styles.bannerSecondRow}>
            <View style={styles.balanceRow}>
              <View style={styles.balanceChip}>
                <Ionicons name="cash-outline" size={13} color="#fff" />
                <Text style={styles.balanceChipText}>
                  Cash ₹{formatAmount(availableBalance.cash)}
                </Text>
              </View>
              <View style={styles.balanceChip}>
                <Ionicons name="document-text-outline" size={13} color="#fff" />
                <Text style={styles.balanceChipText}>
                  Cheque ₹{formatAmount(availableBalance.cheque)}
                </Text>
              </View>
            </View>
            <Text style={styles.bannerLabel}>TOTAL DEPOSIT</Text>
          </View>

          {/* Shortfall is surfaced on the banner so it stays visible while the
              user scrolls the form below. */}
          {isShort ? (
            <View style={styles.bannerShortRow}>
              <Ionicons name="alert-circle" size={13} color="#FDE68A" />
              <Text style={styles.bannerShortText}>
                Collected ₹{formatAmount(collectedAmount)} · short by ₹
                {formatAmount(difference)}
              </Text>
            </View>
          ) : null}
        </LinearGradient>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.intro}>
            <Text style={styles.introTitle}>
              {isEdit ? "Update Bank Deposit" : "Bank Deposit"}
            </Text>
            <Text style={styles.introSubtitle}>
              {isEdit
                ? "Correct this deposit and send it for approval again."
                : "Deposit collected payments into a company bank account."}
            </Text>
          </View>

          {/* ── 1. Deposit information ────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>DEPOSIT INFORMATION</Text>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Company"
                data={companies.options}
                value={company}
                onChange={setCompany}
                placeholder="Select company..."
                searchable={false}
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            {/* Deposit Date — web uses a native date input, native uses the
                picker (same split as the Create Order delivery date). */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Deposit Date<Text style={styles.required}> *</Text>
              </Text>
              {Platform.OS === "web" ? (
                <View style={styles.webDateWrapper}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                  {/* @ts-ignore — 'input' is valid on web */}
                  <input
                    type="date"
                    value={depositDate}
                    onChange={(event: any) => setDepositDate(event.target.value)}
                    style={{
                      border: "none",
                      outline: "none",
                      fontSize: 14,
                      color: COLORS.black,
                      background: "transparent",
                      width: "100%",
                      marginLeft: 10,
                      cursor: "pointer",
                    }}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!canPickDate}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <TextInput
                      value={canPickDate ? depositDate : ""}
                      mode="outlined"
                      placeholder={
                        canPickDate ? "Select date" : "Select a company first"
                      }
                      editable={false}
                      disabled={!canPickDate}
                      pointerEvents="none"
                      textColor={COLORS.black}
                      style={styles.input}
                      outlineStyle={styles.inputOutline}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                      left={
                        <TextInput.Icon
                          icon="calendar-outline"
                          color={canPickDate ? COLORS.primary : COLORS.textMuted}
                        />
                      }
                    />
                  </TouchableOpacity>

                  {showDatePicker ? (
                    <DateTimePicker
                      value={depositDate ? new Date(depositDate) : new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_event, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) {
                          setDepositDate(selectedDate.toISOString().split("T")[0]);
                        }
                      }}
                    />
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Deposited By"
                data={depositors.options}
                value={depositedBy}
                onChange={setDepositedBy}
                placeholder={
                  canPickDepositedBy
                    ? "Select person..."
                    : "Select a deposit date first"
                }
                disabled={!canPickDepositedBy}
                leftIcon="person-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Bank Account"
                data={bankAccounts.options}
                value={bankAccount}
                onChange={setBankAccount}
                placeholder={
                  canPickBankAccount
                    ? "Select bank account..."
                    : "Select who deposited first"
                }
                disabled={!canPickBankAccount}
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Deposit Type"
                data={DEPOSIT_TYPE_OPTIONS}
                value={depositType}
                onChange={setDepositType}
                placeholder={
                  canPickDepositType
                    ? "Select deposit type..."
                    : "Select a bank account first"
                }
                disabled={!canPickDepositType}
                searchable={false}
                leftIcon="swap-vertical-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>
          </Surface>

          {/* ── 2. Payments included ──────────────────────────────────── */}
          <Surface style={styles.section}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              activeOpacity={0.8}
              onPress={() => {
                animate();
                setListExpanded((prev) => !prev);
              }}
              accessibilityRole="button"
            >
              <View style={styles.sectionIndicator} />
              <View style={styles.collapsibleText}>
                <Text style={styles.sectionTitle}>PAYMENTS INCLUDED</Text>
                <Text style={styles.collapsibleSubtitle}>
                  {headerComplete
                    ? "Select one or more payments to include in this bank deposit."
                    : "Complete the deposit information above to choose payments."}
                </Text>
              </View>
              <Ionicons
                name={listExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>

            {/* No summary row here — the banner above already reports the
                selected count and total. */}

            {/* Locked until the header is filled — picking payments against an
                unset company/bank account would let a later change invalidate
                the selection silently. */}
            {listExpanded && !headerComplete ? (
              <View style={styles.lockedNotice}>
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color={COLORS.textMuted}
                />
                <Text style={styles.lockedNoticeText}>
                  Fill in Company, Deposit Date, Deposited By, Bank Account and
                  Deposit Type to continue.
                </Text>
              </View>
            ) : null}

            {listExpanded && headerComplete ? (
              <View style={styles.listBody}>
                {/* Search */}
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  mode="outlined"
                  placeholder="Search party or invoice..."
                  textColor={COLORS.black}
                  style={styles.searchInput}
                  outlineStyle={styles.inputOutline}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  left={<TextInput.Icon icon="magnify" color={COLORS.textSecondary} />}
                  right={
                    search ? (
                      <TextInput.Icon
                        icon="close"
                        color={COLORS.textSecondary}
                        onPress={() => setSearch("")}
                      />
                    ) : undefined
                  }
                />

                {/* Filters — both columns are fixed-height so picking a value
                    never resizes the row. */}
                <View style={styles.filterRow}>
                  <View style={styles.filterCol}>
                    <Dropdown
                      label=""
                      data={DATE_RANGE_OPTIONS}
                      value={dateRange}
                      onChange={handleDateRangeChange}
                      // Once a custom day is picked, show it instead of the
                      // generic "Select date..." label.
                      placeholder={
                        dateRange === DATE_RANGE_CUSTOM && customDate
                          ? customDate
                          : "Date"
                      }
                      searchable={false}
                      leftIcon="calendar-outline"
                      iconColor={COLORS.textSecondary}
                      noBottomSpacing
                    />

                    {showFilterDatePicker ? (
                      <DateTimePicker
                        value={customDate ? new Date(customDate) : new Date()}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={(event, selectedDate) => {
                          setShowFilterDatePicker(false);
                          if (event.type === "dismissed") {
                            // Cancelling the picker with no day chosen would
                            // leave "custom" selected but empty — fall back.
                            if (!customDate) setDateRange("2d");
                            return;
                          }
                          if (selectedDate) {
                            setCustomDate(
                              selectedDate.toISOString().split("T")[0],
                            );
                          }
                        }}
                      />
                    ) : null}
                  </View>

                  <View style={styles.filterCol}>
                    <Dropdown
                      label=""
                      data={partyFilterOptions}
                      value={partyFilter}
                      onChange={setPartyFilter}
                      placeholder="Party"
                      iconColor={COLORS.textSecondary}
                      noBottomSpacing
                    />
                  </View>
                </View>

                {/* Payment list */}
                <View style={styles.list}>
                  {visiblePayments.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="search-outline"
                        size={22}
                        color={COLORS.textMuted}
                      />
                      <Text style={styles.emptyText}>
                        No payments match the current filters.
                      </Text>
                    </View>
                  ) : (
                    visiblePayments.map((payment) => (
                      <DepositPaymentRow
                        key={payment.id}
                        payment={toRowShape(payment)}
                        selected={selectedIds.includes(String(payment.id))}
                        onToggle={() => togglePayment(String(payment.id))}
                      />
                    ))
                  )}
                </View>

                {/* Date-range footer */}
                <View style={styles.rangeRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={13}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.rangeText}>
                    {visiblePayments.length} of {payments.length} payment
                    {payments.length === 1 ? "" : "s"} available to bank
                  </Text>
                </View>
              </View>
            ) : null}
          </Surface>

          {/* ── 3. Deposit amount ─────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>DEPOSIT AMOUNT</Text>
              {depositTouched ? (
                <TouchableOpacity
                  style={styles.resetBtn}
                  activeOpacity={0.8}
                  onPress={resetDepositToCollected}
                >
                  <Ionicons name="refresh" size={12} color={COLORS.primary} />
                  <Text style={styles.resetBtnText}>Match collected</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Row: collected (read-only, derived) · deposit (editable) */}
            <View style={styles.amountRow}>
              <View style={styles.amountCol}>
                <Text style={styles.fieldLabel}>Collected Amount</Text>
                <View style={styles.readOnlyBox}>
                  <Text style={styles.readOnlyPrefix}>₹</Text>
                  <Text style={styles.readOnlyValue} numberOfLines={1}>
                    {formatAmount(collectedAmount)}
                  </Text>
                  <Ionicons
                    name="lock-closed-outline"
                    size={13}
                    color={COLORS.textMuted}
                  />
                </View>
                <Text style={styles.fieldHint}>
                  {selectedIds.length} payment
                  {selectedIds.length === 1 ? "" : "s"} selected
                </Text>
              </View>

              <View style={styles.amountCol}>
                <Text style={styles.fieldLabel}>
                  Deposit Amount<Text style={styles.required}> *</Text>
                </Text>
                <TextInput
                  value={depositTouched ? depositAmount : String(collectedAmount || "")}
                  onChangeText={(text) => {
                    setDepositTouched(true);
                    setDepositAmount(text.replace(/[^0-9.]/g, ""));
                  }}
                  mode="outlined"
                  placeholder="0"
                  keyboardType="decimal-pad"
                  textColor={COLORS.black}
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                  outlineColor={isShort || isOver ? COLORS.warning : COLORS.border}
                  activeOutlineColor={
                    isShort || isOver ? COLORS.warning : COLORS.primary
                  }
                  left={<TextInput.Affix text="₹" textStyle={styles.affix} />}
                />
                <Text style={styles.fieldHint}>Editable — what you banked</Text>
              </View>
            </View>

            {/* ── Conditional validation UI ── */}
            {isShort ? (
              <View style={styles.diffBanner}>
                <Ionicons name="alert-circle" size={16} color={COLORS.warning} />
                <Text style={styles.diffText}>
                  Short by{" "}
                  <Text style={styles.diffAmount}>₹{formatAmount(difference)}</Text>{" "}
                  against the collected amount. A reason is required.
                </Text>
              </View>
            ) : isOver ? (
              <View style={[styles.diffBanner, styles.diffBannerError]}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={[styles.diffText, styles.diffTextError]}>
                  Deposit exceeds collected by ₹
                  {formatAmount(Math.abs(difference))}. Check the amount entered.
                </Text>
              </View>
            ) : collectedAmount > 0 ? (
              <View style={[styles.diffBanner, styles.diffBannerOk]}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={COLORS.success}
                />
                <Text style={[styles.diffText, styles.diffTextOk]}>
                  Deposit matches the collected amount.
                </Text>
              </View>
            ) : null}

            {/* Reason — only shown when the deposit is short. Visible to the
                approver, so it is mandatory rather than optional. */}
            {reasonRequired ? (
              <View style={styles.reasonWrap}>
                <Text style={styles.fieldLabel}>
                  Reason for Short Deposit
                  <Text style={styles.required}> *</Text>
                </Text>
                <TextInput
                  value={shortfallReason}
                  onChangeText={setShortfallReason}
                  mode="outlined"
                  placeholder="Explain why less was deposited than collected..."
                  multiline
                  numberOfLines={3}
                  textColor={COLORS.black}
                  style={[styles.input, styles.reasonInput]}
                  outlineStyle={styles.inputOutline}
                  outlineColor={reasonMissing ? COLORS.error : COLORS.border}
                  activeOutlineColor={
                    reasonMissing ? COLORS.error : COLORS.primary
                  }
                />
                {reasonMissing ? (
                  <View style={styles.errorRow}>
                    <Ionicons name="alert-circle" size={13} color={COLORS.error} />
                    <Text style={styles.errorText}>
                      This reason is shown to the approver and cannot be left blank.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Surface>

          {/* ── 4. Deposit summary ────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>DEPOSIT SUMMARY</Text>
            </View>

            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Selected Payments</Text>
              <Text style={styles.summaryLineValue}>{selectedIds.length}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Total Cash</Text>
              <Text style={styles.summaryLineValue}>₹{formatAmount(totalCash)}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Total Cheque</Text>
              <Text style={styles.summaryLineValue}>
                ₹{formatAmount(totalCheque)}
              </Text>
            </View>

            <View style={styles.summaryDivider} />

            {/* Collected vs deposited, so the gap is explicit rather than implied. */}
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>
                Total Collected (Selected Parties)
              </Text>
              <Text style={styles.summaryLineValue}>
                ₹{formatAmount(collectedAmount)}
              </Text>
            </View>

            <View style={styles.summaryLine}>
              <Text style={styles.summaryLineLabel}>Deposit Amount Entered</Text>
              <Text
                style={[
                  styles.summaryLineValue,
                  isShort && styles.summaryValueShort,
                  isOver && styles.summaryValueOver,
                ]}
              >
                ₹{formatAmount(depositedAmount)}
              </Text>
            </View>

            {/* Difference row appears only when there is one. */}
            {isShort || isOver ? (
              <View style={[styles.shortRow, isOver && styles.shortRowError]}>
                <Ionicons
                  name={isShort ? "trending-down" : "trending-up"}
                  size={14}
                  color={isShort ? COLORS.warning : COLORS.error}
                />
                <Text
                  style={[styles.shortLabel, isOver && styles.shortLabelError]}
                >
                  {isShort ? "Short Deposit" : "Excess Deposit"}
                </Text>
                <Text
                  style={[styles.shortValue, isOver && styles.shortLabelError]}
                >
                  ₹{formatAmount(Math.abs(difference))}
                </Text>
              </View>
            ) : null}

            {/* Echo the reason here too — the approver reads this card. */}
            {isShort && shortfallReason.trim() ? (
              <View style={styles.reasonEcho}>
                <Text style={styles.reasonEchoLabel}>Reason</Text>
                <Text style={styles.reasonEchoText}>{shortfallReason.trim()}</Text>
              </View>
            ) : null}

            <View
              style={[
                styles.grandTotalRow,
                (isShort || isOver) && styles.grandTotalRowFlagged,
              ]}
            >
              <Text style={styles.grandTotalLabel}>Grand Total Deposit</Text>
              <Text
                style={[
                  styles.grandTotalValue,
                  isShort && styles.summaryValueShort,
                  isOver && styles.summaryValueOver,
                ]}
              >
                ₹{formatAmount(depositedAmount)}
              </Text>
            </View>
          </Surface>

          {/* ── 5. Attachments ────────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>ATTACHMENTS</Text>
              <Text style={styles.sectionOptional}>Optional</Text>
            </View>

            <AttachmentPicker
              label="Bank Deposit Slip"
              attachments={slipFiles}
              onAdd={(files) => setSlipFiles((prev) => [...prev, ...files])}
              onRemove={(id) =>
                setSlipFiles((prev) => prev.filter((f) => f.id !== id))
              }
            />
            <View style={styles.uploadGap} />
            <AttachmentPicker
              label="Deposit Receipt"
              attachments={receiptFiles}
              onAdd={(files) => setReceiptFiles((prev) => [...prev, ...files])}
              onRemove={(id) =>
                setReceiptFiles((prev) => prev.filter((f) => f.id !== id))
              }
            />
          </Surface>

          {/* ── 6. Remarks ────────────────────────────────────────────── */}
          <Surface style={[styles.section, styles.lastSection]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>REMARKS</Text>
            </View>

            <FormField
              label="Remarks"
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Add remarks about this deposit..."
              multiline
              optional
            />
          </Surface>
        </ScrollView>

        {/* ── Sticky submit ──────────────────────────────────────────── */}
        <View style={styles.bottomBar}>
          {/* No inline warning for an incomplete form — the disabled button is
              the signal. A MISSING PERMISSION is different: nothing the user
              does here would fix it, so it has to be stated. */}
          {!isEdit && !permissions.loading && !permissions.canCreateDeposit ? (
            <Text style={styles.permissionNote}>
              You do not have permission to record deposits. Ask an
              administrator for the “Deposit — Create” permission.
            </Text>
          ) : null}
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={submitBlocked}
            loading={saving}
            style={styles.submitBtn}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
            buttonColor={submitBlocked ? COLORS.textMuted : COLORS.success}
            textColor={COLORS.textLight}
            icon="bank-transfer-in"
          >
            {isEdit
              ? saving
                ? "Updating..."
                : "Update"
              : saving
                ? "Depositing..."
                : "Deposit to Bank"}
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* The middle of confirm -> loading -> success. The button's own spinner
          sits at the foot of a long form and is off-screen for anyone who has
          scrolled up, so it could not carry a multi-second, multi-request
          operation on its own. Blocking, so the form cannot be edited or the
          button tapped a second time mid-flight — a second tap on a CREATE
          would mint a second deposit for one physical hand-over. */}
      <DepositLoadingDialog
        visible={saving && !success}
        stage={stage}
        isEdit={isEdit}
        uploadIndex={uploadAt.index}
        uploadTotal={uploadAt.total}
      />

      {success ? (
        <PaymentSuccessDialog
          visible
          kind={success.kind}
          title={
            success.kind === "created"
              ? "Deposit Created!"
              : success.kind === "resubmitted"
                ? "Deposit Resubmitted!"
                : "Changes Saved!"
          }
          numberLabel="Deposit No"
          receiptNo={success.depositNo}
          date={success.date}
          time={success.time}
          note={success.note}
          onDone={() => {
            const { kind, depositId } = success;
            setSuccess(null);
            // Only a CREATE clears the form. An edit navigates away from a
            // record that still exists, and blanking it would confuse a user
            // who comes straight back.
            if (!isEdit) resetForm();
            if (isEdit && depositId) {
              // Straight to the deposit that was just changed, so the approver
              // sees the corrected figures and can approve without hunting for
              // it in the list. refreshAt forces a refetch past the cache.
              router.replace({
                pathname: "/(main)/payments/deposit-details",
                params: {
                  id: String(depositId),
                  refreshAt: String(Date.now()),
                },
              } as never);
              return;
            }
            // Deposits land on their own tracking list, not the payments one.
            router.replace({
              pathname: "/(main)/payments/deposit-tracking",
              params: { refreshAt: String(Date.now()) },
            } as never);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  // Matches the Order Details header — flush against the navbar, rounded below.
  banner: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  bannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  bannerAmount: {
    flex: 1,
    textAlign: "right",
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  bannerSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
  },
  bannerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bannerPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  bannerLabel: {
    color: "#fff",
    opacity: 0.95,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  balanceRow: {
    flexDirection: "row",
    flexShrink: 1,
    gap: SPACING.sm,
  },
  balanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  balanceChipText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  // Breathing room between the two attachment pickers.
  uploadGap: { height: SPACING.md },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    // Clears the sticky submit bar so the last card is fully reachable.
    paddingBottom: SPACING.xxl + SPACING.lg,
  },
  intro: {
    marginBottom: SPACING.md,
    marginLeft: SPACING.xs,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  introSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
  },
  lastSection: {
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  sectionOptional: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingVertical: 3,
    paddingHorizontal: SPACING.sm,
  },
  resetBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.primary,
  },
  // ── Deposit amount row ──
  amountRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  amountCol: {
    flex: 1,
  },
  // Height matches the Paper input beside it so the row stays level.
  readOnlyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 56,
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
  },
  readOnlyPrefix: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  readOnlyValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  affix: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  fieldHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginLeft: 2,
  },
  // ── Difference banners ──
  diffBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    marginTop: SPACING.sm + 2,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
  },
  diffBannerError: {
    backgroundColor: COLORS.errorLight,
    borderColor: COLORS.errorBorder,
  },
  diffBannerOk: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success,
  },
  diffText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
    color: COLORS.warning,
  },
  diffTextError: {
    color: COLORS.error,
  },
  diffTextOk: {
    color: COLORS.success,
  },
  diffAmount: {
    fontWeight: "800",
  },
  // ── Reason ──
  reasonWrap: {
    marginTop: SPACING.md,
  },
  reasonInput: {
    minHeight: 84,
    paddingTop: SPACING.sm,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: SPACING.xs + 2,
  },
  errorText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    color: COLORS.error,
  },
  // ── Banner shortfall strip ──
  bannerShortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: RADIUS.sm,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm,
  },
  bannerShortText: {
    flex: 1,
    color: "#FDE68A",
    fontSize: 11,
    fontWeight: "700",
  },
  // ── Summary extras ──
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: SPACING.sm,
  },
  summaryValueShort: {
    color: COLORS.warning,
  },
  summaryValueOver: {
    color: COLORS.error,
  },
  shortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.warningLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
  },
  shortRowError: {
    backgroundColor: COLORS.errorLight,
    borderColor: COLORS.errorBorder,
  },
  shortLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.warning,
  },
  shortLabelError: {
    color: COLORS.error,
  },
  shortValue: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.warning,
  },
  reasonEcho: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm + 2,
  },
  reasonEchoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  reasonEchoText: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.text,
    marginTop: 3,
  },
  grandTotalRowFlagged: {
    borderTopColor: COLORS.warning,
  },
  // ── Locked-section notice ──
  lockedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm + 2,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
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
  collapsibleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  collapsibleText: {
    flex: 1,
  },
  collapsibleSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: 3,
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
  required: {
    color: COLORS.error,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
  },
  inputOutline: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
  },
  webDateWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 56,
  },
  listBody: {
    marginTop: SPACING.md,
  },
  searchInput: {
    backgroundColor: COLORS.inputBackground,
    fontSize: 14,
    height: 48,
    marginBottom: SPACING.sm,
  },
  filterRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  filterCol: {
    flex: 1,
  },
  list: {
    // The outer page scrolls; a nested scroll view here would fight it.
    marginBottom: SPACING.xs,
  },
  emptyState: {
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.lg,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs + 2,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  rangeText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  changeBtn: {
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderBlue,
    paddingVertical: 5,
    paddingHorizontal: SPACING.sm + 2,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  summaryLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs + 2,
  },
  summaryLineLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryLineValue: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
  },
  grandTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
  },
  uploadRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    // Extra bottom padding lifts the button clear of the global bottom nav bar.
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  submitBtn: {
    borderRadius: RADIUS.md,
  },
  submitContent: {
    height: 50,
  },
  submitLabel: {
    color: COLORS.textLight,
    fontWeight: "700",
    fontSize: 15,
  },
  permissionNote: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.error,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
});

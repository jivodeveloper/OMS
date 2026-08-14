import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Button, Checkbox, Surface } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import { fs, ms } from "@/src/utils/responsive";
import { appAlert } from "@/src/components/common/AppDialog";
import Dropdown from "@/src/components/common/DropdownProps";
import ScreenGuard from "@/src/components/common/ScreenGuard";
import FormField from "./_components/FormField";
import PaymentMethodCard from "./_components/PaymentMethodCard";
import PaymentSummary from "./_components/PaymentSummary";
import InvoiceSummaryCard from "@/src/features/payments/components/InvoiceSummaryCard";
import PaymentSuccessDialog, {
  type PaymentSuccessKind,
} from "@/src/features/payments/components/PaymentSuccessDialog";
import {
  messageFrom,
  useCompanies,
  useCollectionPersons,
  useOpenInvoices,
  useParties,
} from "@/src/features/payments/usePaymentMasters";
import usePaymentPermissions from "@/src/features/payments/usePaymentPermissions";
import paymentsService, {
  type PaymentMethodKind,
  type SapBranch,
  type Company,
  type CreateReceiptPayload,
} from "@/src/services/payments.service";
import { PARTY_SOURCE } from "./_lib/constants";
import { validateCashBreakdown } from "./_lib/validation";
import type { PaymentMethodEntry, ReceivePaymentForm } from "./_lib/types";

// Android needs this opt-in for LayoutAnimation to run at all.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

let methodCounter = 0;

/**
 * A blank form.
 *
 * Built fresh each time rather than shared: the screen stays mounted after a
 * submit, so reusing one object would carry the previous entry's method rows
 * into the next payment.
 */
const emptyForm = (): ReceivePaymentForm => ({
  company: null,
  receivedFrom: null,
  party: null,
  invoice: null,
  isAdvance: false,
  sapBranchId: null,
  remarks: "",
  methods: [createMethod()],
});

const createMethod = (): PaymentMethodEntry => {
  methodCounter += 1;
  return {
    id: `method-${methodCounter}-${Date.now()}`,
    method: "cash",
    amount: "",
    reference: "",
    noteRows: [],
    notesExpanded: true,
    chequeNumber: "",
    bankName: "",
    chequeDate: "",
    attachments: [],
  };
};

const INITIAL_METHOD = createMethod();

/** Permission gate — the screen only mounts for users who may open it. */
export default function ReceivePaymentRoute() {
  const { receiptId } = useLocalSearchParams<{ receiptId?: string }>();

  /**
   * CREATING is gated by the page grant; EDITING is not.
   *
   * They are different rights. An approver may correct a payment sitting in
   * their queue — that is how a SAP rejection gets fixed — but must not be able
   * to raise a new one. Guarding both with the same key locked approvers out of
   * their own edit, which is the "Access restricted" screen this fixes.
   *
   * Editing is authorised per-document by the server (`permissions.can_edit`),
   * and PATCH re-checks it, so there is a real boundary here rather than an
   * absent one.
   */
  if (receiptId) return <ReceivePaymentScreen />;

  return (
    <ScreenGuard screen="payments/receive-payment">
      <ReceivePaymentScreen />
    </ScreenGuard>
  );
}

function ReceivePaymentScreen() {
  /**
   * The same screen serves both jobs. With `receiptId` it loads that receipt,
   * prefills every field and saves with PATCH; without it, it creates.
   *
   * One screen rather than two means the edit form can never drift from the
   * create form — same validation, same cash breakdown, same cascade.
   */
  const params = useLocalSearchParams<{ receiptId?: string }>();
  const editingId = Number(params.receiptId) || null;
  const isEdit = editingId != null;
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  /**
   * Whether this editor may put the entry back into the chain.
   *
   * Server-decided (`permissions.can_resubmit`): only the CREATOR resubmits. An
   * approver editing an entry parked at their rung is correcting it in place —
   * it is already in the chain, with them, so "resubmit" would be meaningless
   * and would restart a ladder they are standing on.
   */
  const [canResubmit, setCanResubmit] = useState(false);

  const [form, setForm] = useState<ReceivePaymentForm>(emptyForm);

  // Only one card open at a time keeps the screen short — that's the point of the
  // accordion here. Null means every card is collapsed.
  const [expandedId, setExpandedId] = useState<string | null>(INITIAL_METHOD.id);
  // Lets the Remarks box be scrolled clear of the keyboard when it is focused —
  // it is the last field on the page, so the keyboard covers it otherwise.
  const scrollRef = useRef<ScrollView>(null);
  const [saving, setSaving] = useState(false);
  // The terminal confirmation. Held as state rather than an imperative alert so
  // the dialog owns the redirect — the flow must land on Payment Tracking, and
  // an alert callback firing after unmount would silently skip that.
  const [success, setSuccess] = useState<{
    kind: PaymentSuccessKind;
    receiptNo: string;
    date: string;
    time: string;
    note?: string;
  } | null>(null);

  // ── Live master data ──────────────────────────────────────────────────
  // Every list below comes from the backend, so a company or collector added
  // in the web admin shows up here without an app release. The cascade is
  // driven by the current selection: parties reload when the company changes,
  // invoices when the party does.
  const companies = useCompanies();
  const selectedCompany = (form.company as Company | null) ?? null;

  /**
   * SAP branches for the advance picker.
   *
   * Loaded per company, not per keystroke: the list is small, changes only
   * when SAP is reconfigured, and an advance cannot be raised without one.
   */
  const [branches, setBranches] = useState<SapBranch[]>([]);
  useEffect(() => {
    let alive = true;
    if (!selectedCompany) {
      setBranches([]);
      return;
    }
    paymentsService
      .getSapBranches(selectedCompany)
      .then((rows) => {
        if (alive) setBranches(rows);
      })
      .catch(() => {
        if (alive) setBranches([]);
      });
    return () => {
      alive = false;
    };
  }, [selectedCompany]);

  /**
   * Banks SAP can deposit a cheque into, for the chosen company.
   *
   * Fetched here rather than inside the method card so the list is loaded once
   * per company instead of once per cheque row. Empty on failure, which leaves
   * the bank field as free text — a picker with nothing in it would be worse
   * than typing.
   */
  const collectors = useCollectionPersons(selectedCompany);
  // The advance checkbox switches WHICH parties are offered:
  //   unticked -> only parties with open invoices (you are paying one off)
  //   ticked   -> every party (an advance is not invoice-linked)
  const parties = useParties(selectedCompany, "", !form.isAdvance);
  const invoices = useOpenInvoices(selectedCompany, form.party);
  const permissions = usePaymentPermissions();

  /**
   * Load the receipt being edited and pour it into the form.
   *
   * Runs once. The company/party/invoice cascade then reloads its own options
   * from those values, exactly as it would if the user had picked them.
   */
  useEffect(() => {
    if (!editingId) return;
    let alive = true;
    (async () => {
      try {
        const r = await paymentsService.getReceipt(editingId);
        if (!alive) return;

        // The SERVER decides who may edit this particular receipt. Checking it
        // here means an ineligible user is told before filling the form rather
        // than after PATCH refuses it.
        if (r.permissions && !r.permissions.can_edit) {
          appAlert(
            "Cannot edit this payment",
            r.sap_doc_entry
              ? `${r.receipt_no} is already posted to SAP, so it can no longer be changed.`
              : `${r.receipt_no} can no longer be edited — it has moved past you in the approval chain.`,
            [{ text: "Go back", onPress: () => router.back() }],
          );
          return;
        }

        setCanResubmit(!!r.permissions?.can_resubmit);
        const allocation = r.allocations?.[0];
        setForm({
          company: r.company,
          receivedFrom:
            r.received_from_type === "PARTY"
              ? PARTY_SOURCE
              : String(r.received_from_person ?? ""),
          party: r.card_code,
          invoice: allocation ? String(allocation.sap_doc_entry) : null,
          isAdvance: r.is_advance,
          sapBranchId: r.sap_branch_id ? String(r.sap_branch_id) : null,
          remarks: r.remarks ?? "",
          methods: (r.methods ?? []).map((m, index) => {
            methodCounter += 1;
            return {
              id: `existing-${m.id}-${index}`,
              method: m.method.toLowerCase() as PaymentMethodEntry["method"],
              amount: String(Number(m.amount) || ""),
              reference: m.upi_reference ?? "",
              noteRows: (m.denominations ?? []).map((d, i) => ({
                id: `note-${m.id}-${i}`,
                denomination: d.denomination,
                quantity: String(d.quantity),
              })),
              notesExpanded: (m.denominations ?? []).length > 0,
              chequeNumber: m.cheque_number ?? "",
              bankName: m.bank_name ?? "",
              chequeDate: m.cheque_date ?? "",
              attachments: [],
            };
          }),
        });
        // Open the first card, so the amounts are visible without a tap.
        setExpandedId(`existing-${r.methods?.[0]?.id}-0`);
      } catch (err) {
        appAlert("Could not load this payment", messageFrom(err), [
          { text: "Go back", onPress: () => router.back() },
        ]);
      } finally {
        if (alive) setLoadingExisting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editingId]);

  // "Party" is a sentinel meaning the money came straight from the party;
  // every other option is a person who collected it on their behalf.
  const receivedFromOptions = [
    { label: "Party", value: PARTY_SOURCE },
    ...collectors.options,
  ];

  const animate = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
  }, []);

  // A party is involved either way — "Party" means the money came straight from
  // them, a named person means that person collected it on the party's behalf —
  // so the Party dropdown is always shown. The hint below it explains which.
  const isPartySource = form.receivedFrom === PARTY_SOURCE;
  const invoiceOptions = invoices.options;

  const handleReceivedFromChange = (value: string) => {
    animate();
    setForm((prev) => ({ ...prev, receivedFrom: value }));
  };

  /** Changing company invalidates everything downstream of it. */
  const handleCompanyChange = (value: string) => {
    animate();
    setForm((prev) => ({
      ...prev,
      company: value,
      receivedFrom: null,
      party: null,
      invoice: null,
    }));
  };

  const handlePartyChange = (value: string) => {
    // Invoices belong to a party, so a different party invalidates the choice.
    setForm((prev) => ({ ...prev, party: value, invoice: null }));
  };

  const toggleAdvance = () => {
    animate();
    setForm((prev) => ({
      ...prev,
      isAdvance: !prev.isAdvance,
      // The party list itself changes with this flag, so a party picked under
      // the old list may not exist in the new one. Clearing avoids submitting a
      // selection the user can no longer see.
      party: null,
      // An advance isn't tied to an invoice, so clear any prior selection.
      invoice: null,
    }));
  };

  /**
   * The open card, when its denominations don't add up to the amount entered.
   * While one exists the accordion is pinned to it — opening another card (or
   * adding one) would collapse the error out of view before it's been fixed.
   */
  const blockingEntry = form.methods.find(
    (entry) => entry.id === expandedId && validateCashBreakdown(entry) !== null,
  );

  /**
   * Progressive disclosure: Company → Received From → Party → Invoice, then the
   * payment methods. Each field unlocks only once the one before it is answered,
   * so a later choice can never be made against a stale earlier one.
   */
  const canPickReceivedFrom = !!form.company;
  const canPickParty = canPickReceivedFrom && !!form.receivedFrom;
  // The invoice list hangs off the party, and an advance isn't invoice-linked.
  const canPickInvoice = canPickParty && !!form.party && !form.isAdvance;
  const headerComplete =
    canPickParty && !!form.party && (form.isAdvance || !!form.invoice);

  // Creator -> "Resubmit" (it goes back into the chain).
  // Approver -> "Update"   (it stays where it is, with them).
  const actionLabel = !isEdit
    ? "Receive Payment"
    : canResubmit
      ? "Resubmit"
      : "Update";
  const savingLabel = !isEdit
    ? "Recording..."
    : canResubmit
      ? "Resubmitting..."
      : "Updating...";

  // The invoice behind the current selection, for the summary card. The
  // dropdown's value is the DocEntry, which is what the allocation sends.
  const selectedInvoice = form.invoice
    ? invoices.data.find((inv) => String(inv.doc_entry) === form.invoice)
    : undefined;

  // The branch an invoice payment will post to. Shown read-only: SAP refuses
  // a payment whose branch differs from the invoice's, so it is not a choice.
  const invoiceBranch = selectedInvoice?.bpl_name || "";

  // What has been entered so far, across every method card.
  const enteredTotal = form.methods.reduce(
    (sum, entry) => sum + (Number(entry.amount) || 0),
    0,
  );

  // Every method needs an amount before this can be submitted.
  const allMethodsHaveAmount = form.methods.every(
    (entry) => (Number(entry.amount) || 0) > 0,
  );

  // Submit is gated on EVERY card, not just the open one — a collapsed card can
  // still hold an unbalanced breakdown.
  const submitBlocked =
    !headerComplete ||
    !allMethodsHaveAmount ||
    saving ||
    // Creating needs the grant; editing does not — the server has already
    // decided the caller may edit THIS receipt, and re-testing a create
    // permission here would block a legitimate correction.
    (!isEdit && !permissions.canCreatePayment) ||
    loadingExisting ||
    form.methods.some((entry) => validateCashBreakdown(entry) !== null) ||
    // An advance inherits no branch from an invoice, so one must be chosen —
    // blocked here as well as on the server so the collector sees it while the
    // payment is still in front of them.
    (form.isAdvance && !form.sapBranchId);

  /**
   * Create the receipt and send it straight into the approval chain.
   *
   * Create + submit are two calls because the API models them separately (a
   * draft can exist unsubmitted). If the submit fails the receipt still exists
   * as a draft rather than being lost, so the message says so explicitly.
   */
  const handleSubmit = async () => {
    if (submitBlocked || saving) return;
    setSaving(true);
    try {
      const selectedParty = parties.data.find((p) => p.card_code === form.party);
      const methods = form.methods.map((entry) => {
        const base = {
          method: entry.method.toUpperCase() as PaymentMethodKind,
          amount: String(Number(entry.amount) || 0),
        };
        if (entry.method === "cash") {
          return {
            ...base,
            denominations: entry.noteRows
              .filter((row) => row.denomination && Number(row.quantity) > 0)
              .map((row) => ({
                denomination: Number(row.denomination),
                quantity: Number(row.quantity),
              })),
          };
        }
        if (entry.method === "cheque") {
          return {
            ...base,
            cheque_number: entry.chequeNumber,
            bank_name: entry.bankName,
            cheque_date: entry.chequeDate || undefined,
          };
        }
        // UPI / bank transfer / NEFT / RTGS. The bank is NOT sent: the backend
        // resolves it from the administrator's payment-method mapping.
        return { ...base, upi_reference: entry.reference || "" };
      });

      const totalAmount = form.methods.reduce(
        (sum, entry) => sum + (Number(entry.amount) || 0),
        0,
      );

      const payload: CreateReceiptPayload = {
        company: selectedCompany as Company,
        card_code: form.party as string,
        card_name: selectedParty?.card_name ?? "",
        payment_date: new Date().toISOString().slice(0, 10),
        received_from_type: isPartySource ? "PARTY" : "PERSON",
        received_from_person: isPartySource ? null : Number(form.receivedFrom),
        is_advance: form.isAdvance,
        // Advance only — the server refuses a branch on an invoice payment.
        sap_branch_id:
          form.isAdvance && form.sapBranchId
            ? Number(form.sapBranchId)
            : undefined,
        remarks: form.remarks,
        methods,
        // An advance is not invoice-linked, so it carries no allocation.
        allocations:
          form.isAdvance || !form.invoice
            ? []
            : [
                {
                  sap_doc_entry: Number(form.invoice),
                  sap_doc_num: selectedInvoice?.doc_num,
                  amount_applied: String(totalAmount),
                  // Captured at selection time. Without these the detail screen
                  // has no invoice figure to compare the payment against.
                  invoice_total: String(selectedInvoice?.doc_total ?? 0),
                  balance_at_selection: String(
                    selectedInvoice?.balance_due ?? 0,
                  ),
                },
              ],
      };

      // Editing REPLACES the receipt's content and sends it round again; the
      // attachment loop below then runs against the same id either way.
      const receipt = isEdit
        ? await paymentsService.updateReceipt(editingId as number, payload)
        : await paymentsService.createReceipt(payload);

      // Attachments upload AFTER the receipt exists — they need its id. A
      // failure here must not lose the payment, so each is reported rather than
      // thrown: the receipt is already saved and can be submitted regardless.
      const failedUploads: string[] = [];
      for (const entry of form.methods) {
        const kind =
          entry.method === "cheque" ? "CHEQUE_IMAGE" : "UPI_SCREENSHOT";
        for (const file of entry.attachments) {
          try {
            await paymentsService.uploadReceiptAttachment(
              receipt.id,
              { uri: file.uri, name: file.name, mimeType: file.mimeType },
              kind,
            );
          } catch {
            failedUploads.push(file.name);
          }
        }
      }

      // An APPROVER correcting an entry parked at their rung only saves it —
      // the approval chain is already open, with them, so submitting again
      // would be refused ("already has an open approval request"). Only a
      // creator's edit re-enters the chain.
      const needsSubmit = !isEdit || canResubmit;

      if (needsSubmit) {
        try {
          await paymentsService.submitReceipt(receipt.id);
        } catch (err) {
          appAlert(
            isEdit ? "Changes saved" : "Saved as draft",
            isEdit
              ? `${receipt.receipt_no} was updated but could not be resubmitted: ${messageFrom(err)}.`
              : `${receipt.receipt_no} was created but could not be submitted: ${messageFrom(err)}. Submit it again from the payments list.`,
          );
          return;
        }
      }

      const attachmentNote = failedUploads.length
        ? ` ${failedUploads.length} attachment(s) could not be uploaded: ${failedUploads.join(", ")}.`
        : "";

      const now = new Date();
      setSuccess({
        kind: needsSubmit ? (isEdit ? "resubmitted" : "created") : "updated",
        receiptNo: receipt.receipt_no,
        date: now.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        time: now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        note: attachmentNote.trim() || undefined,
      });
    } catch (err) {
      appAlert("Could not record payment", messageFrom(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleMethod = (id: string) => {
    if (blockingEntry) return;
    animate();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const updateMethod = (id: string, patch: Partial<PaymentMethodEntry>) => {
    setForm((prev) => ({
      ...prev,
      methods: prev.methods.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
  };

  // addMethod / removeMethod were removed with the multi-method UI: a receipt
  // now carries exactly one method, so there is nothing to add or remove.

  if (loadingExisting) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading payment...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* `behavior` was undefined on Android, which makes KeyboardAvoidingView
          inert — the keyboard then covered the last fields (Remarks especially).
          "height" works with android:windowSoftInputMode=adjustResize, which is
          set via app.json softwareKeyboardLayoutMode: "resize". */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* ── Fixed total banner, flush under the navbar ──────────────── */}
        <PaymentSummary methods={form.methods} />

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Lets a focused field be scrolled clear of the keyboard on iOS.
          automaticallyAdjustKeyboardInsets
        >
          {/* ── Screen intro ──────────────────────────────────────────── */}
          <View style={styles.intro}>
            <Text style={styles.introTitle}>
              {isEdit ? "Edit Payment" : "Receive Payment"}
            </Text>
            <Text style={styles.introSubtitle}>
              {isEdit
                ? "Correct the details, then resubmit for approval."
                : "Record a payment received from a party or company user."}
            </Text>
          </View>

          {/* ── Payment details ───────────────────────────────────────── */}
          <Surface style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Company"
                data={companies.options}
                value={form.company}
                onChange={handleCompanyChange}
                placeholder={
                  companies.loading
                    ? "Loading companies..."
                    : companies.options.length === 0
                      ? "No companies configured"
                      : "Select company..."
                }
                disabled={companies.loading || companies.options.length === 0}
                searchable={false}
                leftIcon="business-outline"
                iconColor={COLORS.textSecondary}
                required
              />
              {companies.error ? (
                <Text style={styles.fieldError}>{companies.error}</Text>
              ) : !companies.loading && companies.options.length === 0 ? (
                <Text style={styles.fieldHint}>
                  No company is mapped to a SAP database yet. Ask an
                  administrator to add one before taking payments.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Received From"
                data={receivedFromOptions}
                value={form.receivedFrom}
                onChange={handleReceivedFromChange}
                placeholder={
                  !canPickReceivedFrom
                    ? "Select a company first"
                    : collectors.loading
                      ? "Loading..."
                      : "Select source..."
                }
                disabled={!canPickReceivedFrom || collectors.loading}
                leftIcon="swap-horizontal-outline"
                iconColor={COLORS.textSecondary}
                required
              />
            </View>

            {/* BEFORE the party picker, because it decides which parties are
                offered: unticked shows only those with open invoices, ticked
                shows everyone. Asking after the choice would mean re-picking. */}
            <TouchableOpacity
              style={[
                styles.checkboxRow,
                form.isAdvance && styles.checkboxRowActive,
              ]}
              activeOpacity={0.7}
              onPress={toggleAdvance}
              accessibilityRole="checkbox"
              accessibilityLabel="Receive payment as Advance"
              accessibilityHint={
                form.isAdvance
                  ? "Currently on. Every party is listed."
                  : "Currently off. Only parties with open invoices are listed."
              }
              accessibilityState={{ checked: form.isAdvance }}
            >
              <Checkbox.Android
                status={form.isAdvance ? "checked" : "unchecked"}
                onPress={toggleAdvance}
                color={COLORS.primary}
                uncheckedColor={COLORS.textMuted}
              />
              <View style={styles.checkboxText}>
                <Text style={styles.checkboxLabel}>Receive payment as Advance</Text>
                <Text style={styles.checkboxHint}>
                  {form.isAdvance
                    ? "Not linked to an invoice — all parties listed"
                    : "Only parties with open invoices are listed"}
                </Text>
              </View>
              <Ionicons
                name={form.isAdvance ? "wallet" : "receipt-outline"}
                size={20}
                color={form.isAdvance ? COLORS.primary : COLORS.textMuted}
              />
            </TouchableOpacity>

            {/* Always shown: the money originates from a party either way. */}
            <View style={styles.field}>
              <Dropdown
                label="Party"
                data={parties.options}
                value={form.party}
                onChange={handlePartyChange}
                placeholder={
                  !canPickParty
                    ? "Select “Received From” first"
                    : parties.loading
                      ? "Loading parties..."
                      : parties.options.length === 0
                        ? form.isAdvance
                          ? "No parties in this company"
                          : "No party has open invoices"
                        : "Select party..."
                }
                disabled={!canPickParty || parties.loading}
                leftIcon="person-outline"
                iconColor={COLORS.textSecondary}
                required
              />
              {parties.error ? (
                <Text style={styles.fieldError}>{parties.error}</Text>
              ) : canPickParty &&
                !parties.loading &&
                parties.options.length === 0 &&
                !form.isAdvance ? (
                <Text style={styles.fieldHint}>
                  No party in this company has an open invoice. Tick “Receive
                  payment as Advance” above to record a payment anyway.
                </Text>
              ) : form.receivedFrom && !isPartySource ? (
                <Text style={styles.fieldHint}>
                  Collected by{" "}
                  {
                    receivedFromOptions.find(
                      (option) => option.value === form.receivedFrom,
                    )?.label
                  }{" "}
                  on behalf of this party.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Dropdown
                label="Invoice"
                data={invoiceOptions}
                value={form.invoice}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, invoice: value }))
                }
                placeholder={
                  form.isAdvance
                    ? "Not applicable for advance"
                    : !canPickInvoice
                      ? "Select a party first"
                      : invoices.loading
                        ? "Loading open invoices..."
                        : invoices.options.length === 0
                          ? "No open invoices"
                          : "Select invoice..."
                }
                disabled={!canPickInvoice || invoices.loading}
                leftIcon="receipt-outline"
                iconColor={COLORS.textSecondary}
              />
              {invoices.error ? (
                <Text style={styles.fieldError}>{invoices.error}</Text>
              ) : canPickInvoice &&
                !invoices.loading &&
                invoices.options.length === 0 ? (
                <Text style={styles.fieldHint}>
                  This party’s invoices were settled since the list loaded. Pick
                  another party, or tick “Receive payment as Advance” above to
                  record it without an invoice.
                </Text>
              ) : null}
            </View>

            {/* ── SAP branch ──
                An invoice payment MUST post to the invoice's own branch (SAP
                rejects any other), so it is shown read-only and resolved on
                the server. An advance settles nothing, so nobody but the user
                can say which branch it belongs to. */}
            <View style={styles.field}>
              {form.isAdvance ? (
                <Dropdown
                  label="SAP Branch"
                  data={branches.map((b) => ({
                    label: b.bpl_name,
                    value: String(b.bpl_id),
                  }))}
                  value={form.sapBranchId}
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      sapBranchId: value ? String(value) : null,
                    }))
                  }
                  placeholder={
                    !selectedCompany
                      ? "Select a company first"
                      : branches.length
                        ? "Select branch..."
                        : "No branches configured"
                  }
                  disabled={!selectedCompany || !branches.length}
                  leftIcon="business-outline"
                  iconColor={COLORS.textSecondary}
                  searchable
                  required
                />
              ) : (
                <>
                  <Text style={styles.fieldLabel}>SAP Branch</Text>
                  <View style={styles.readOnlyBox}>
                    <Ionicons
                      name="business-outline"
                      size={ms(18)}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.readOnlyValue}>
                      {invoiceBranch || "Select an invoice"}
                    </Text>
                    {invoiceBranch ? (
                      <Text style={styles.readOnlyNote}>
                        (Auto from Invoice)
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </View>

          </Surface>

          {/* Invoice against payment. Only for an invoice-linked entry — an
              advance has nothing to compare against. */}
          {selectedInvoice && !form.isAdvance ? (
            <InvoiceSummaryCard
              invoiceNo={`INV-${selectedInvoice.doc_num}`}
              invoiceAmount={Number(selectedInvoice.balance_due) || 0}
              receivedAmount={enteredTotal}
            />
          ) : null}

          {/* ── Payment method accordions ─────────────────────────────── */}
          <View style={styles.methodsHeader}>
            <View style={styles.sectionIndicator} />
            <Text style={styles.sectionTitle}>PAYMENT METHOD</Text>
          </View>

          {/* Locked until the details above are set — entering amounts against
              an unset party/invoice would let a later change invalidate them. */}
          {!headerComplete ? (
            <View style={styles.lockedNotice}>
              <Ionicons
                name="lock-closed-outline"
                size={16}
                color={COLORS.textMuted}
              />
              <Text style={styles.lockedNoticeText}>
                Select Company, Received From, Party and Invoice (or mark it as an
                advance) to enter the payment method.
              </Text>
            </View>
          ) : null}

          {/* ONE method per receipt. A customer paying part cash and part
              cheque becomes two receipts, mirroring Finance: they raise a
              separate SAP Incoming Payment per tender. It is also the only way
              the amounts can post correctly — SAP carries one
              TransferAccount per document, so a mixed receipt had to merge
              them and sent ₹12,00,000 of cheque money to the UPI bank G/L.
              The "Add Payment Method" button was removed with that merge. */}
          {headerComplete && form.methods.length > 0 ? (
            <PaymentMethodCard
              entry={form.methods[0]}
              index={0}
              expanded
              canRemove={false}
              onToggle={() => toggleMethod(form.methods[0].id)}
              onChange={(patch) => updateMethod(form.methods[0].id, patch)}
              onRemove={() => undefined}
            />
          ) : null}

          {/* ── Remarks ───────────────────────────────────────────────── */}
          <Surface style={[styles.section, styles.remarksSection]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIndicator} />
              <Text style={styles.sectionTitle}>REMARKS</Text>
            </View>

            <FormField
              label="Remarks"
              value={form.remarks}
              onChangeText={(text) => setForm((prev) => ({ ...prev, remarks: text }))}
              placeholder="Enter remarks (optional)..."
              multiline
              optional
              // Scroll to the bottom once the keyboard has animated in, so the
              // box sits directly above it and the user can read what they type.
              onFocus={() =>
                setTimeout(
                  () => scrollRef.current?.scrollToEnd({ animated: true }),
                  Platform.OS === "android" ? 250 : 120,
                )
              }
            />
          </Surface>
        </ScrollView>

        {/* ── Sticky submit, raised clear of the global bottom bar ────── */}
        <View style={styles.bottomBar}>
          {/* No inline warning for an incomplete form — the disabled button is
              the signal, and progressive unlocking shows what is outstanding.
              A MISSING PERMISSION is different: nothing the user does on this
              screen would fix it, so it has to be stated. */}
          {!isEdit && !permissions.loading && !permissions.canCreatePayment ? (
            <Text style={styles.permissionNote}>
              You do not have permission to record payments. Ask an
              administrator for the “Payments — Create” permission.
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
            icon="check-circle-outline"
          >
            {saving ? savingLabel : actionLabel}
          </Button>
        </View>
      </KeyboardAvoidingView>

      {success ? (
        <PaymentSuccessDialog
          visible
          kind={success.kind}
          receiptNo={success.receiptNo}
          date={success.date}
          time={success.time}
          note={success.note}
          onDone={() => {
            setSuccess(null);
            // Clear the form. This screen stays mounted, so without it the
            // next payment would open pre-filled with the one just submitted.
            // Only on a CREATE — an edit navigates away from a record that
            // still exists, and blanking it would be confusing if the user
            // came straight back to it.
            if (!isEdit) {
              const fresh = emptyForm();
              setForm(fresh);
              setExpandedId(fresh.methods[0].id);
            }
            // Land on Payment Tracking, never back on the form. replace() so
            // Back from tracking does not return to a submitted entry, and
            // refreshAt forces the list to refetch rather than show the cached
            // page this receipt is missing from.
            router.replace({
              pathname: "/(main)/payments/payment-tracking",
              params: { refreshAt: String(Date.now()) },
            });
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    // The banner's rounded bottom corners need a little breathing room before
    // the first card starts.
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
  remarksSection: {
    marginTop: SPACING.md,
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  methodsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm + 2,
    marginLeft: SPACING.xs,
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
  fieldHint: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  fieldError: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.error,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  permissionNote: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.error,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  // Matches DropdownProps.styles.dropdown exactly — same 56pt height, radius,
  // 1.5pt border and horizontal padding — so this control lines up with the
  // pickers above and below it instead of reading as a smaller afterthought.
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    minHeight: 56,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  // Ticked state gets the primary accent, so "which mode am I in?" is legible
  // at a glance rather than from the checkbox alone.
  checkboxRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}0D`,
  },
  checkboxText: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  checkboxHint: {
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  // addMethodBtn / addMethodLabel and their disabled variants were removed
  // with the "Add Payment Method" button — one method per receipt.
  // ── Locked-section notice ──
  lockedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.inputBackground,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textMuted,
  },
  bottomBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    // Extra bottom padding lifts the button clear of the global bottom nav bar
    // that sits underneath every screen.
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
  // Read-only branch, for an invoice payment. Deliberately looks like a field
  // rather than a disabled input: it is information, not a choice denied.
  fieldLabel: {
    fontSize: fs(12),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  readOnlyBox: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  readOnlyValue: {
    fontSize: fs(14),
    fontWeight: "700",
    color: COLORS.text,
  },
  readOnlyNote: {
    fontSize: fs(11),
    color: COLORS.textMuted,
  },
  submitLabel: {
    color: COLORS.textLight,
    fontWeight: "700",
    fontSize: 15,
  },
});

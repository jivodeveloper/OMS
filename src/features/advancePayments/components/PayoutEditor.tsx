import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AttachmentPicker from "@/app/(main)/payments/_components/AttachmentPicker";
import type { PickedFile } from "@/app/(main)/payments/_lib/pickAttachment";
import { COLORS, RADIUS, SPACING } from "@/src/constants/theme";
import {
  advancePaymentError,
  advancePaymentService,
  type ApiRequest,
  type SapCashAccount,
  type SapHouseBank,
  type SapPartnerBankAccount,
} from "@/src/services/advancePayment.service";

import { attachFile, type FileAttachment } from "../logic/attachments";
import {
  NOTE_DENOMINATIONS,
  PAYOUT_METHODS,
  cashBreakdownError,
  changeMethod,
  defaultMethodFor,
  methodAmountError,
  methodsFor,
  newPayoutLine,
  noteRowsTotal,
  payoutTotal,
  startPayout,
  validatePayout,
  type CashNoteRow,
  type PayoutDetails,
  type PayoutLine,
  type PayoutMethod,
} from "../logic/payout";
import { payoutFileChanges, payoutToApi } from "../logic/requestApi";
import { formatINR } from "../logic/rules";
import { DateField, Field, Input, Notice, NoticeText, Section, Select } from "./AdvanceUi";
import ManualAccountPassword from "./ManualAccountPassword";
import PickedFileViewer from "./PickedFileViewer";

/**
 * The Payment stage's bank and payment details — money going OUT.
 *
 * FIELD FOR FIELD WITH THE WEB'S `PayoutDetailsForm`, because the two clients
 * write the same record and an approver checking on a phone what a colleague
 * filled in on a laptop must see the same thing:
 *
 *   * the beneficiary is SAP's ACCOUNT HOLDER name, upper-cased, and it follows
 *     the account that is picked;
 *   * To Account Number is PICKED from the payee's SAP accounts — the IFSC comes
 *     with it and is read-only, because an IFSC retyped against an account SAP
 *     already knows is how money reaches the right account at the wrong branch;
 *   * "Enter another account…" asks for the user's password FIRST and only then
 *     opens the two fields (the server refuses a typed account without the token
 *     that answer returns);
 *   * an EMPLOYEE has no SAP partner, so there is nothing to pick and the fields
 *     are typed from the start;
 *   * a method is offered only while the line's amount may legally use it, and
 *     says why when it may not.
 *
 * The rules themselves are `logic/payout`, shared with the web — this is the
 * presentation of them and nothing else.
 */

/** Pseudo-value of the To Account picker for "type it in myself". */
const MANUAL = "__manual__";

/**
 * What `validatePayout` calls the Pay To fields.
 *
 * Used only to put a warning on that box's header, so a CLOSED box still says
 * it is the one holding Save back.
 */
const PAY_TO_FIELDS = new Set(["Beneficiary Name", "To Account Number", "IFSC"]);

/** What the page needs to drive the Save button and gate Approve. */
export interface PayoutStatus {
  /** Save the details. The button lives at the foot of the page, not in here. */
  save: () => void;
  saving: boolean;
  /** Nothing left to fix — `validatePayout` is satisfied. */
  ready: boolean;
  /** Edited since the last save: approving now would approve what is on the
   *  server, not what is on screen. */
  dirty: boolean;
  /** The server holds a payout at all. */
  saved: boolean;
}

export default function PayoutEditor({
  request,
  amount,
  initial,
  onSaved,
  onStatus,
}: {
  request: ApiRequest;
  amount: number;
  initial: PayoutDetails | undefined;
  onSaved: (request: ApiRequest) => void;
  /** Published so the page can put Save beside the decision buttons. */
  onStatus?: (status: PayoutStatus) => void;
}) {
  const [payout, setPayout] = useState<PayoutDetails>(
    // UPPER-CASED, as the web seeds it: a beneficiary is written as the bank
    // writes it, and the two clients showed different names for the same payee
    // because only one of them did this.
    initial ?? startPayout(amount, request.partner_name.toUpperCase()),
  );
  const [banks, setBanks] = useState<SapHouseBank[]>([]);
  const [cash, setCash] = useState<SapCashAccount[]>([]);
  const [payeeAccounts, setPayeeAccounts] = useState<SapPartnerBankAccount[]>([]);
  const [lookupError, setLookupError] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** A picked file being looked at, if any. */
  const [viewing, setViewing] = useState<FileAttachment | null>(null);

  /**
   * The token that lets a typed account be saved, and what to do once it
   * arrives. Held here because the password is asked for ONCE and then unlocks
   * typing for the rest of this visit, exactly as on the web.
   */
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [afterPassword, setAfterPassword] = useState<(() => void) | null>(null);

  /**
   * An EMPLOYEE is paid to a G/L account, not a SAP business partner, so there
   * are no bank accounts on file to offer — the same rule the web applies.
   */
  const payeeCardCode =
    request.request_type === "EMPLOYEE_ADVANCE" ? "" : request.partner_code;

  // Our accounts, and the payee's, for THIS company only — the three company
  // databases are separate and a G/L code means nothing across them.
  useEffect(() => {
    let alive = true;
    setLoadingAccounts(true);
    Promise.all([
      advancePaymentService.houseBanks(request.company),
      advancePaymentService.cashAccounts(request.company),
      payeeCardCode
        ? advancePaymentService.partnerBankAccounts(request.company, payeeCardCode)
        : Promise.resolve([] as SapPartnerBankAccount[]),
    ])
      .then(([bankRows, cashRows, payeeRows]) => {
        if (!alive) return;
        setBanks(bankRows);
        setCash(cashRows);
        setPayeeAccounts(payeeRows);

        // Pre-fill the payee's DEFAULT account — but only into a payout nobody
        // has typed into or deliberately cleared. SAP's account holder name IS
        // the name "as per bank records", so it comes with it.
        const fallback = payeeRows.find((row) => row.is_default) ?? payeeRows[0];
        setPayout((current) =>
          !fallback || current.toAccountNumber || current.toAccountManual
            ? current
            : {
                ...current,
                toAccountNumber: fallback.account_number,
                toIfsc: fallback.ifsc,
                beneficiaryName: fallback.account_name
                  ? fallback.account_name.toUpperCase()
                  : current.beneficiaryName,
              },
        );
      })
      .catch((err) => {
        if (alive) setLookupError(advancePaymentError(err));
      })
      .finally(() => {
        if (alive) setLoadingAccounts(false);
      });
    return () => {
      alive = false;
    };
  }, [request.company, payeeCardCode]);

  /**
   * A FRESH COPY WHENEVER THE SERVER'S VERSION MOVES — after a save, a
   * decision, or somebody else's action. Without it the editor kept the draft
   * it was holding, and a second save would send lines the server had already
   * given ids to as if they were new, duplicating them and their files.
   */
  const version = request.flow?.version;
  useEffect(() => {
    setPayout(initial ?? startPayout(amount, request.partner_name.toUpperCase()));
    // Keyed on the version on purpose: `initial` is a new object on every
    // render of the page above, and re-seeding on that would wipe the typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, version]);

  const patch = (changes: Partial<PayoutDetails>) =>
    setPayout((current) => ({ ...current, ...changes }));

  const setLine = (id: string, next: PayoutLine) =>
    setPayout((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? next : line)),
    }));

  const { missing, problems } = validatePayout(payout, amount);
  const ready = missing.length === 0 && problems.length === 0;
  const allocated = payoutTotal(payout);
  const balanced = Math.round(allocated * 100) === Math.round(amount * 100);

  /**
   * Edited since the last save.
   *
   * Compared as the API sees it, so re-ordering a note row that comes to the
   * same figures does not count as a change — and a real edit always does.
   */
  const dirty =
    JSON.stringify(payoutToApi(payout)) !==
    JSON.stringify(initial ? payoutToApi(initial) : null);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      let saved = await advancePaymentService.savePayout(
        request.id,
        payoutToApi(payout),
        request.flow?.version,
        // Only a typed account needs it; the server refuses one without.
        payout.toAccountManual ? manualToken : null,
      );
      // Files go after the lines exist, because a payment proof belongs to one
      // line and the line only has an id once the server has saved it.
      const changes = payoutFileChanges(payout, saved.payout!, initial);
      for (const item of changes.upload) {
        saved = await advancePaymentService.addRequestFile(
          request.id,
          item.file,
          item.purpose,
          item.lineId,
        );
      }
      for (const fileId of changes.remove) {
        saved = await advancePaymentService.removeRequestFile(request.id, fileId);
      }
      onSaved(saved);
    } catch (err) {
      setError(advancePaymentError(err));
    } finally {
      setSaving(false);
    }
  };

  // The page renders Save and gates Approve on this, so it is published on
  // every change rather than left for the page to work out.
  useEffect(() => {
    onStatus?.({ save, saving, ready, dirty, saved: Boolean(initial) });
    // `save` closes over the draft, so it is new on every keystroke; the page
    // only ever calls the latest one, which is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, ready, dirty, initial, payout]);

  return (
    <>
      {/* ── Pay To ──────────────────────────────────────────────────── */}
      <Section
        icon="person-circle-outline"
        title="Pay To"
        right={
          missing.some((item) => PAY_TO_FIELDS.has(item)) ? (
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          ) : undefined
        }
      >
        {error ? (
          <Notice tone="bad">
            <NoticeText tone="bad" text={error} />
          </Notice>
        ) : null}

        <Field label="Beneficiary Name" required>
          <Input
            value={payout.beneficiaryName}
            onChangeText={(value) => patch({ beneficiaryName: value.toUpperCase() })}
            placeholder="As per bank records"
            autoCapitalize="characters"
          />
        </Field>

        <PayToAccount
          value={payout}
          onChange={setPayout}
          accounts={payeeAccounts}
          loading={loadingAccounts}
          error={lookupError}
          lookedUp={payeeCardCode !== ""}
          unlocked={manualToken !== null}
          unlock={(then) => setAfterPassword(() => then)}
        />

        {/* THE CREATE FORM'S PICKER: camera, gallery or files, with a preview
            tile per attachment that opens when tapped. An approver checking a
            cancelled cheque needs to see it, not read its file name. */}
        <AttachmentPicker
          label="Bank Detail Attachments"
          attachments={payout.bankAttachments.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            uri: file.file?.uri ?? "",
            mimeType: file.file?.mimeType ?? "",
          }))}
          onAdd={(picked: PickedFile[]) =>
            patch({ bankAttachments: [...payout.bankAttachments, ...picked.map(attachFile)] })
          }
          onRemove={(id) =>
            patch({
              bankAttachments: payout.bankAttachments.filter((file) => file.id !== id),
            })
          }
          onOpen={(stub) =>
            setViewing(payout.bankAttachments.find((file) => file.id === stub.id) ?? null)
          }
        />
      </Section>

      {/* ── Payment Methods ─────────────────────────────────────────── */}
      <Section
        icon="wallet-outline"
        title="Payment Methods"
        right={
          <View style={styles.headRight}>
            {!ready ? (
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
            ) : null}
            <View
              style={[
                styles.allocated,
                { backgroundColor: balanced ? COLORS.successLight : COLORS.warningLight },
              ]}
            >
              <Text
                style={[
                  styles.allocatedText,
                  { color: balanced ? COLORS.success : COLORS.warning },
                ]}
              >
                {formatINR(allocated)} / {formatINR(amount)}
              </Text>
            </View>
          </View>
        }
      >
        {payout.lines.map((line, index) => (
          <MethodCard
            key={line.id}
            line={line}
            index={index}
            canRemove={payout.lines.length > 1}
            banks={banks}
            cashAccounts={cash}
            company={request.company}
            onChange={(next) => setLine(line.id, next)}
            onRemove={() =>
              patch({ lines: payout.lines.filter((candidate) => candidate.id !== line.id) })
            }
            onOpenFile={setViewing}
          />
        ))}

        <TouchableOpacity
          style={styles.addLine}
          activeOpacity={0.8}
          // A new line starts on the method the UNALLOCATED amount may use.
          onPress={() =>
            patch({
              lines: [
                ...payout.lines,
                newPayoutLine(defaultMethodFor(Math.max(amount - allocated, 0))),
              ],
            })
          }
        >
          <Ionicons name="add" size={16} color={COLORS.primary} />
          <Text style={styles.addLineText}>Add Payment Method</Text>
        </TouchableOpacity>

        {missing.length || problems.length ? (
          <Notice tone={problems.length ? "bad" : "hold"}>
            {problems.map((problem) => (
              <NoticeText key={problem} tone="bad" text={problem} />
            ))}
            {missing.length ? (
              <NoticeText tone="hold" text={`Still needed: ${missing.join(", ")}.`} />
            ) : null}
          </Notice>
        ) : null}

      </Section>

      <PickedFileViewer attachment={viewing} onClose={() => setViewing(null)} />

      <ManualAccountPassword
        requestId={request.id}
        visible={afterPassword !== null}
        onClose={() => setAfterPassword(null)}
        onConfirmed={(token) => {
          setManualToken(token);
          const then = afterPassword;
          setAfterPassword(null);
          then?.();
        }}
      />
    </>
  );
}

/* ── The payee's account, from SAP ───────────────────────────────────────── */

/**
 * To Account Number and IFSC.
 *
 * When SAP holds accounts for the payee the number is PICKED from them, the
 * default pre-filled, and the IFSC comes with the account read-only. "Enter
 * another account…" opens both for typing — after the password, because the
 * server will not take a hand-typed account without that token.
 */
function PayToAccount({
  value,
  onChange,
  accounts,
  loading,
  error,
  lookedUp,
  unlocked,
  unlock,
}: {
  value: PayoutDetails;
  onChange: (next: PayoutDetails) => void;
  accounts: SapPartnerBankAccount[];
  loading: boolean;
  error: string;
  /** False for an employee — no SAP partner to ask about. */
  lookedUp: boolean;
  unlocked: boolean;
  unlock: (then: () => void) => void;
}) {
  const chosen = value.toAccountManual
    ? undefined
    : accounts.find((account) => account.account_number === value.toAccountNumber);
  const typing = value.toAccountManual || accounts.length === 0;
  const locked = !unlocked;

  const pick = (key: string) => {
    if (key === MANUAL) {
      const toManual = () =>
        onChange({ ...value, toAccountManual: true, toAccountNumber: "", toIfsc: "" });
      if (locked) unlock(toManual);
      else toManual();
      return;
    }
    const account = accounts.find((candidate) => candidate.account_number === key);
    if (!account) return;
    onChange({
      ...value,
      toAccountManual: false,
      toAccountNumber: account.account_number,
      toIfsc: account.ifsc,
      // SAP's account holder name IS the name "as per bank records".
      beneficiaryName: account.account_name
        ? account.account_name.toUpperCase()
        : value.beneficiaryName,
    });
  };

  const note = !lookedUp
    ? "Employee accounts are not held in SAP. Type the payee's details."
    : loading
      ? "Reading the payee's accounts from SAP…"
      : error
        ? error
        : accounts.length === 0
          ? "SAP has no bank account for this payee. Type the details."
          : typing
            ? "Typed by hand, not one of the payee's SAP accounts."
            : chosen?.is_default
              ? "The payee's default account in SAP."
              : "One of the payee's accounts in SAP.";

  return (
    <>
      {accounts.length > 0 ? (
        <Select
          label="To Account Number"
          required
          data={[
            ...accounts.map((account) => ({
              value: account.account_number,
              label: `${account.account_number}${
                account.bank_name ? ` · ${account.bank_name}` : ""
              }${account.is_default ? " (default)" : ""}`,
            })),
            { value: MANUAL, label: "Enter another account…" },
          ]}
          value={typing ? MANUAL : (chosen?.account_number ?? "")}
          onChange={pick}
          placeholder="Select account"
        />
      ) : (
        <Field label="To Account Number" required>
          <Input
            value={value.toAccountNumber}
            onChangeText={(next) =>
              onChange({ ...value, toAccountNumber: next.replace(/[^0-9]/g, "") })
            }
            placeholder="Payee's account number"
            keyboardType="numeric"
            editable={!locked || !lookedUp}
          />
        </Field>
      )}

      <Text style={styles.note}>{note}</Text>

      {/* The typed number, when the picker is showing "Enter another account…". */}
      {typing && accounts.length > 0 ? (
        <Field label="Account Number (typed)" required>
          <Input
            value={value.toAccountNumber}
            onChangeText={(next) =>
              onChange({ ...value, toAccountNumber: next.replace(/[^0-9]/g, "") })
            }
            placeholder="Payee's account number"
            keyboardType="numeric"
            editable={!locked}
          />
        </Field>
      ) : null}

      <Field
        label="IFSC"
        required
        error={
          chosen && !chosen.ifsc_valid
            ? "SAP's IFSC for this account does not look valid."
            : undefined
        }
      >
        <Input
          value={value.toIfsc}
          onChangeText={(next) => onChange({ ...value, toIfsc: next.toUpperCase() })}
          placeholder="e.g. HDFC0001234"
          autoCapitalize="characters"
          // From SAP with the account: never retyped against a known account.
          editable={typing && !locked}
        />
      </Field>

      {typing && locked ? (
        <TouchableOpacity
          style={styles.unlockBtn}
          onPress={() => unlock(() => {})}
          activeOpacity={0.8}
        >
          <Ionicons name="lock-closed-outline" size={15} color={COLORS.primary} />
          <Text style={styles.unlockText}>Enter bank details by hand</Text>
          <Text style={styles.unlockHint}>Asks for your password first.</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

/* ── One payment method ──────────────────────────────────────────────────── */

function MethodCard({
  line,
  index,
  canRemove,
  banks,
  cashAccounts,
  company,
  onChange,
  onRemove,
  onOpenFile,
}: {
  line: PayoutLine;
  index: number;
  canRemove: boolean;
  banks: SapHouseBank[];
  cashAccounts: SapCashAccount[];
  company: string;
  onChange: (next: PayoutLine) => void;
  onRemove: () => void;
  onOpenFile: (file: FileAttachment | null) => void;
}) {
  const number = index + 1;
  const isCash = line.method === "CASH";
  const patch = (changes: Partial<PayoutLine>) => onChange({ ...line, ...changes });
  const amount = Number(line.amount) || 0;

  // The methods this line's amount may use. The current one stays listed even
  // when the amount has moved past it, so the picker never goes blank; the
  // error under it says why it no longer fits.
  const allowed = methodsFor(amount);
  const methodError = methodAmountError(line.method, amount);

  const accounts = isCash
    ? cashAccounts.map((account) => ({
        value: account.acct_code,
        label: `${account.acct_name} — ${account.acct_code}`,
      }))
    : banks.map((bank) => ({
        // The G/L's own name carries the bank and account number the person
        // paying recognises ("ICICI BANK-629305042322"), then the G/L.
        value: bank.key,
        label: `${bank.gl_name} — ${bank.gl_account}`,
      }));

  const proofLabel =
    line.method === "CHEQUE"
      ? "Cheque Image"
      : line.method === "UPI"
        ? "Payment Screenshot"
        : "Payment Advice / Screenshot";

  const cashError = cashBreakdownError(line);
  // A card whose notes do not balance stays open: collapsing it would hide the
  // error the user still has to fix. The receipt's own rule.
  const [open, setOpen] = useState(index === 0);
  const shown = open || Boolean(cashError);

  return (
    <View style={styles.method}>
      <TouchableOpacity
        style={styles.methodHead}
        onPress={() => !cashError && setOpen((current) => !current)}
        activeOpacity={cashError ? 1 : 0.8}
        accessibilityRole="button"
        accessibilityLabel={`Payment method ${number}, ${
          PAYOUT_METHODS.find((method) => method.value === line.method)?.label
        }`}
        accessibilityState={{ expanded: shown }}
      >
        <View style={styles.methodIcon}>
          <Ionicons name={METHOD_ICON[line.method]} size={18} color={COLORS.primary} />
        </View>
        <View style={styles.methodTitleWrap}>
          <Text style={styles.methodKicker}>PAYMENT METHOD {number}</Text>
          <Text style={styles.methodName}>
            {PAYOUT_METHODS.find((method) => method.value === line.method)?.label}
          </Text>
        </View>
        <View style={styles.methodRight}>
          {cashError ? (
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
          ) : null}
          <Text style={[styles.methodAmount, amount <= 0 && styles.methodAmountOff]}>
            {formatINR(amount)}
          </Text>
          {canRemove ? (
            <TouchableOpacity
              onPress={onRemove}
              hitSlop={8}
              accessibilityLabel={`Remove payment method ${number}`}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          ) : null}
          {!cashError ? (
            <Ionicons
              name={shown ? "chevron-up" : "chevron-down"}
              size={18}
              color={COLORS.textSecondary}
            />
          ) : null}
        </View>
      </TouchableOpacity>

      {!shown ? null : (
      <View style={styles.methodBody}>
      <Select
        label="Payment Method"
        required
        data={PAYOUT_METHODS.filter(
          (method) => allowed.includes(method.value) || method.value === line.method,
        ).map((method) => ({ label: method.label, value: method.value }))}
        value={line.method}
        onChange={(next) => onChange(changeMethod(line, next as PayoutMethod))}
        error={methodError ?? undefined}
      />
      {!methodError ? (
        <Text style={styles.note}>
          UPI below ₹1,00,000 · RTGS above ₹2,00,000 · IMPS below ₹5,00,000 · Cash up to
          ₹10,000.
        </Text>
      ) : null}

      <Field label="Amount" required>
        <Input
          value={line.amount}
          onChangeText={(value) => patch({ amount: value })}
          placeholder="Enter amount"
          keyboardType="decimal-pad"
          prefix="₹"
        />
      </Field>

      {/* OUR account the money leaves from. Cleared on a method change: a
          drawer cannot send a UPI. */}
      <Select
        label={isCash ? "From Cash Account" : "From Bank Account"}
        required
        searchable
        data={accounts}
        value={line.fromAccount}
        onChange={(value) => patch({ fromAccount: value })}
        placeholder={isCash ? "Select cash account" : "Select bank account"}
      />
      {accounts.length === 0 ? (
        <Text style={styles.note}>
          SAP has no {isCash ? "cash account" : "house bank"} for {company}.
        </Text>
      ) : null}

      {line.method === "CHEQUE" ? (
        <>
          <Field label="Cheque Number" required>
            <Input
              value={line.chequeNumber}
              onChangeText={(value) => patch({ chequeNumber: value.replace(/[^0-9]/g, "") })}
              placeholder="Enter cheque number"
              keyboardType="numeric"
            />
          </Field>
          <Field label="Cheque Bank">
            <Input
              value={line.chequeBank}
              onChangeText={(value) => patch({ chequeBank: value.toUpperCase() })}
              placeholder="e.g. HDFC"
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Cheque Date" required>
            <DateField
              value={line.chequeDate}
              onChange={(chequeDate) => patch({ chequeDate })}
            />
          </Field>
        </>
      ) : null}

      {isCash ? (
        <NoteBreakdown line={line} onChange={(noteRows) => patch({ noteRows })} />
      ) : (
        <AttachmentPicker
          label={`${proofLabel} (optional)`}
          attachments={line.attachments.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            uri: file.file?.uri ?? "",
            mimeType: file.file?.mimeType ?? "",
          }))}
          onAdd={(picked: PickedFile[]) =>
            patch({ attachments: [...line.attachments, ...picked.map(attachFile)] })
          }
          onRemove={(id) =>
            patch({ attachments: line.attachments.filter((file) => file.id !== id) })
          }
          onOpen={(stub) =>
            onOpenFile(line.attachments.find((file) => file.id === stub.id) ?? null)
          }
        />
      )}
      </View>
      )}
    </View>
  );
}

/** The icon each method carries, as the receipt's cards give them. */
const METHOD_ICON: Record<PayoutMethod, keyof typeof Ionicons.glyphMap> = {
  UPI: "qr-code-outline",
  NEFT: "swap-horizontal-outline",
  RTGS: "swap-horizontal-outline",
  IMPS: "flash-outline",
  CHEQUE: "document-text-outline",
  CASH: "cash-outline",
};

/* ── Cash note breakdown ─────────────────────────────────────────────────── */

function NoteBreakdown({
  line,
  onChange,
}: {
  line: PayoutLine;
  onChange: (rows: CashNoteRow[]) => void;
}) {
  const error = cashBreakdownError(line);
  const setRow = (id: string, patch: Partial<CashNoteRow>) =>
    onChange(line.noteRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  return (
    <View style={styles.notes}>
      <View style={styles.notesHead}>
        <Text style={styles.notesTitle}>Cash Note Breakdown</Text>
        <Text style={styles.notesCount}>
          Counted {formatINR(noteRowsTotal(line.noteRows))}
        </Text>
      </View>

      {line.noteRows.map((row, index) => (
        <View key={row.id} style={styles.noteRow}>
          <View style={styles.noteDenomination}>
            <Select
              label=""
              data={NOTE_DENOMINATIONS.map((value) => ({
                label: `₹${value}`,
                value: String(value),
              }))}
              value={row.denomination === null ? "" : String(row.denomination)}
              onChange={(value) =>
                setRow(row.id, { denomination: value ? Number(value) : null })
              }
              placeholder="Note"
            />
          </View>
          <View style={styles.noteQty}>
            <Input
              value={row.quantity}
              onChangeText={(value) =>
                setRow(row.id, { quantity: value.replace(/[^0-9]/g, "") })
              }
              placeholder="Qty"
              keyboardType="numeric"
            />
          </View>
          <Text style={styles.noteWorth}>
            {formatINR((row.denomination ?? 0) * (Number(row.quantity) || 0))}
          </Text>
          <TouchableOpacity
            onPress={() => onChange(line.noteRows.filter((candidate) => candidate.id !== row.id))}
            hitSlop={8}
            accessibilityLabel={`Remove note row ${index + 1}`}
          >
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity
        style={styles.addNote}
        activeOpacity={0.8}
        onPress={() =>
          onChange([
            ...line.noteRows,
            {
              id: `note-${line.id}-${line.noteRows.length + 1}-${Date.now()}`,
              denomination: null,
              quantity: "",
            },
          ])
        }
      >
        <Ionicons name="add" size={15} color={COLORS.primary} />
        <Text style={styles.addNoteText}>Add note</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.noteError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, lineHeight: 16 },

  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
    marginTop: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
  },
  unlockText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  unlockHint: { fontSize: 11, color: COLORS.textMuted },

  // Copied from `payments/_components/PaymentMethodCard` — one card design.
  method: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
    overflow: "hidden",
  },
  methodHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLighter,
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitleWrap: { flex: 1 },
  methodKicker: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: COLORS.textMuted,
  },
  methodName: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginTop: 1 },
  methodRight: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  methodAmount: { fontSize: 14, fontWeight: "700", color: COLORS.primaryDark },
  methodAmountOff: { fontSize: 14, fontWeight: "600", color: COLORS.textMuted },
  methodBody: {
    paddingHorizontal: SPACING.md,
    // The last field needs the same air under it as the header has above.
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },

  notes: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    padding: SPACING.sm + 2,
  },
  notesHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  notesTitle: { fontSize: 12, fontWeight: "800", color: COLORS.text },
  notesCount: { fontSize: 12, color: COLORS.textSecondary },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  noteDenomination: { width: 108 },
  noteQty: { flex: 1, minWidth: 0 },
  noteWorth: {
    minWidth: 78,
    textAlign: "right",
    fontSize: 12.5,
    color: COLORS.text,
    fontWeight: "700",
  },
  addNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
  },
  addNoteText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  noteError: { fontSize: 11.5, color: COLORS.error, marginTop: SPACING.sm, lineHeight: 16 },

  files: { marginTop: SPACING.md },
  filesHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  filesLabel: { flex: 1, fontSize: 12, fontWeight: "500", color: COLORS.textSecondary },
  addFile: { flexDirection: "row", alignItems: "center", gap: 4 },
  addFileText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  fileName: { flex: 1, minWidth: 0, fontSize: 12.5, color: COLORS.text, fontWeight: "600" },
  fileSize: { fontSize: 11, color: COLORS.textSecondary },

  addLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.md,
  },
  addLineText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },

  headRight: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  allocated: {
    alignSelf: "center",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    marginTop: SPACING.md,
  },
  allocatedText: { fontSize: 12.5, fontWeight: "800" },

});

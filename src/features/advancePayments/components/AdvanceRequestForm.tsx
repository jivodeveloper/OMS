import React, { useEffect, useState } from "react";
import { View } from "react-native";

import AttachmentPicker from "@/app/(main)/payments/_components/AttachmentPicker";
import type { PickedFile as PaymentsPickedFile } from "@/app/(main)/payments/_lib/pickAttachment";

import {
  useBudgets,
  useDepartmentHeads,
  useOpenDocuments,
  useOwners,
  usePurposes,
} from "../hooks/useAdvanceMasters";
import { attachFile, type FileAttachment } from "../logic/attachments";
import {
  COMPANIES,
  PARTNER_TYPES,
  RETURN_METHODS,
  type OpenDocument,
} from "../logic/constants";
import {
  allocationRows,
  allocationTotals,
  applyChange,
  calculateEmi,
  changeAllocation,
  departmentHeadLoginError,
  emiEndDate,
  installmentsFromEmi,
  needsDepartmentHead,
  plainAmountError,
  resolveCase,
  todayIso,
  validate,
  type RequestForm,
} from "../logic/rules";
import {
  Card,
  DateField,
  Field,
  Input,
  Notice,
  NoticeText,
  Row,
  Select,
} from "./AdvanceUi";
import DocumentSelector from "./DocumentSelector";
import ExpenseLines from "./ExpenseLines";
import VendorOnAccountCard from "./VendorOnAccountCard";
import PickedFileViewer from "./PickedFileViewer";
import PartnerPicker from "./PartnerPicker";

/**
 * The request form — dropdowns and paired rows, laid out like Receive Payment.
 *
 * WHAT IS ASKED IS DECIDED BY `resolveCase`, not by this file: which Payment
 * Against options a type offers, whether documents are picked or an amount is
 * typed, whether repayment or an expected bill date is asked. That table is
 * shared with the web client (`logic/rules`), so a case that asks four
 * questions there asks the same four here — and `applyChange` clears whatever
 * an answer invalidates, so a half-edited request cannot be submitted with
 * values from a case the requester moved away from.
 *
 * VALIDATION IS PER FIELD, from the same `validate()` the web form and the
 * server's serializer agree on. A problem (a date in the past, a percentage over
 * 100) shows on its own field as soon as it is entered; a field that is merely
 * still EMPTY is only marked once the requester has tried to submit, so the form
 * does not open covered in red.
 */
/**
 * The date questions, by the label `validate()` reports them under.
 *
 * Used to decide when the date step is finished — not to validate anything, so
 * the labels themselves stay owned by the shared rules.
 */
const DATE_LABELS = new Set([
  "Expected Bill Date",
  "Return Method",
  "Return Method (what it is)",
  "Number of Installments",
  "EMI Amount",
  "EMI Start Date",
  "Return Date",
  "Expected From Date",
  "Expected To Date",
]);

export default function AdvanceRequestForm({
  form,
  setForm,
  files,
  setFiles,
  onRemoveSavedFile,
  showErrors = false,
}: {
  form: RequestForm;
  setForm: (form: RequestForm) => void;
  files: FileAttachment[];
  setFiles: (files: FileAttachment[]) => void;
  /** An edit: a file the server already holds, taken off the request. */
  onRemoveSavedFile?: (serverId: number) => void;
  /** Submit has been attempted, so empty required fields may be marked. */
  showErrors?: boolean;
}) {
  const c = resolveCase(form);
  const today = todayIso();
  const budgets = useBudgets(form.company);
  const purposes = usePurposes();
  /** The attachment being looked at, if any — see `PickedFileViewer`. */
  const [viewing, setViewing] = useState<FileAttachment | null>(null);
  const owners = useOwners();
  const documents = useOpenDocuments(form.company, c.reference, form.partner);
  /**
   * WHO APPROVES "BY DEPARTMENT". Asked only where the route has the stage —
   * an Employee or Imprest request outside Mart, or a purpose marked
   * `needs_head` — and the HOD picked must have an OMS login to approve with.
   */
  /**
   * IS THIS PURPOSE APPROVED "BY DEPARTMENT"? The purpose list says so
   * (`needs_head`), and `needsDepartmentHead` reads the answer off the form —
   * so the flag has to be put there when a purpose is chosen, and again when
   * the list arrives for a request that was SAVED with one: a stored request
   * records only whether a head was named, not whether its purpose asks for
   * one. Without this the app never asked for the Department Head and the
   * server refused the request for the field it had not shown.
   */
  const purposeNeedsHead = (code: string) =>
    Boolean(purposes.purposes.find((purpose) => purpose.code === code)?.needs_head);
  const listedNeedsHead = purposes.purposes.length ? purposeNeedsHead(form.purpose) : null;
  useEffect(() => {
    if (listedNeedsHead !== null && listedNeedsHead !== form.purposeNeedsHead) {
      setForm(applyChange(form, { purposeNeedsHead: listedNeedsHead }));
    }
    // `form` is deliberately not a dependency: this only reconciles the flag
    // with the list, and re-running it on every keystroke would fight typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listedNeedsHead, form.purposeNeedsHead]);

  const askHead = needsDepartmentHead(form);
  const [headSearch, setHeadSearch] = useState("");
  const heads = useDepartmentHeads(headSearch, askHead);
  const headOptions = [
    ...heads.heads.map((head) => ({
      label: head.employee_name || head.employee_code,
      value: head.employee_code,
      hint: head.user?.username
        ? `${head.employee_code} · ${head.user.username}`
        : `${head.employee_code} · no OMS login`,
    })),
    ...(form.departmentHead &&
    !heads.heads.some((head) => head.employee_code === form.departmentHead)
      ? [
          {
            label: form.departmentHeadName || form.departmentHead,
            value: form.departmentHead,
            hint: form.departmentHead,
          },
        ]
      : []),
  ];

  const change = (patch: Partial<RequestForm>) => setForm(applyChange(form, patch));

  const emi = calculateEmi(form.amount, form.installments);
  const fromEmi = installmentsFromEmi(form.amount, form.emiAmount);

  /**
   * Employee Imprest asks for an AMOUNT and the date its bills are expected,
   * and nothing else — two short answers that read as one line rather than two
   * cards. The bill date then moves up beside the amount, so it is asked where
   * it is answered; every other case keeps it with the dates.
   */
  const pairAmountWithBillDate = c.plainAmount && c.expectedBillDate;

  /**
   * ONE ANSWER AT A TIME.
   *
   * Each control opens only once the one above it is answered, because the
   * answers genuinely depend on each other: the company decides which SAP
   * database the partner comes from, the type decides what Payment Against
   * offers, and the partner decides which documents exist. Letting someone fill
   * the bottom of the form first meant watching `applyChange` clear it again
   * the moment they set the company — which reads as the app losing their work.
   *
   * Later steps are shown DISABLED rather than hidden: a requester should be
   * able to see what the form will ask before they get there.
   */
  const step = {
    company: form.company !== "",
    type: form.type !== "",
    against: form.paymentAgainst !== "",
    partner: !c.decided || form.partner !== "",
  };
  const amountDone = c.reference
    ? allocationTotals(allocationRows(form)).complete
    : c.plainAmount
      ? plainAmountError(form.amount) === null && form.amount !== ""
      : true;

  const { missing, problems } = validate(form, today);

  /** The date questions this case asks, all answered. */
  const datesDone = !missing.some((label) => DATE_LABELS.has(label));
  /** The Department (SAP's budget head) and what the money is for. */
  const departmentDone = form.budget !== "";
  const purposeDone = departmentDone && form.purpose !== "";
  /**
   * The message for one field.
   *
   * A PROBLEM first — it is about what was entered, and every one of them is
   * written starting with the field's own label (`pastDateError`), so matching
   * on that is what puts it under the right field. `extra` is for the errors
   * that name no field, like the EMI arithmetic's.
   */
  const errorFor = (label: string, extra?: string | null): string | undefined =>
    extra ??
    problems.find((problem) => problem.startsWith(label)) ??
    (showErrors && missing.includes(label) ? `${label} is required.` : undefined);

  /**
   * The owner list, with the request's own owner kept in it.
   *
   * A request raised before someone left the master — or raised on the web with
   * a free-typed owner — must keep showing that owner rather than an empty
   * field, exactly as the web form's picker does.
   */
  const ownerOptions = [
    ...owners.owners,
    ...(form.ownership && !owners.owners.some((owner) => owner.value === form.ownership)
      ? [{ label: form.ownership, value: form.ownership }]
      : []),
  ];

  const pickDocuments = (ids: string[]) => {
    // Ticked ids -> the documents themselves, SNAPSHOTTED into the form: a live
    // SAP list is not held by the rules, and the snapshot is also what the
    // requester saw, which is what the approver should be shown.
    const known = new Map<string, OpenDocument>(
      [...form.selected, ...documents.documents].map((doc) => [doc.id, doc]),
    );
    change({
      selected: ids
        .map((id) => known.get(id))
        .filter((doc): doc is OpenDocument => doc !== undefined),
    });
  };

  const addFiles = (picked: PaymentsPickedFile[]) =>
    setFiles([...files, ...picked.map(attachFile)]);

  const removeFile = (id: string) => {
    const attachment = files.find((candidate) => candidate.id === id);
    if (attachment?.serverId && onRemoveSavedFile) onRemoveSavedFile(attachment.serverId);
    setFiles(files.filter((candidate) => candidate.id !== id));
  };

  return (
    <View>
      {/* ── What this is ───────────────────────────────────────────── */}
      <Card title="Request">
        <Select
          label="Company"
          required
          data={COMPANIES.map((company) => ({ label: company, value: company }))}
          value={form.company}
          onChange={(company) => change({ company: company as RequestForm["company"] })}
          error={errorFor("Company")}
        />

        <Row>
          <Select
            label="Type"
            required
            data={PARTNER_TYPES.map((type) => ({ label: type.label, value: type.value }))}
            value={form.type}
            onChange={(type) => change({ type: type as RequestForm["type"] })}
            placeholder={step.company ? "Select" : "Pick a company first"}
            disabled={!step.company}
            error={errorFor("Type")}
          />
          {/* AN EXPENSE IS NOT ASKED IT: direct or indirect follows from the
              G/L accounts its lines name, and the server decides. */}
          {c.expense ? null : (
          <Select
            label="Payment Against"
            required
            data={c.paymentAgainstOptions
              .filter((option) => option.value !== "OTHER")
              .map((option) => ({ label: option.label, value: option.value }))}
            value={form.paymentAgainst}
            onChange={(paymentAgainst) =>
              change({ paymentAgainst: paymentAgainst as RequestForm["paymentAgainst"] })
            }
            placeholder={step.type ? "Select" : "Pick a type first"}
            disabled={!step.type}
            error={errorFor("Payment Against")}
          />
          )}
        </Row>

        {c.expense ? (
          <>
            {/* AN EXPENSE HAS NO SAP PARTNER, AND NEITHER OF THESE IS
                REQUIRED. The money goes to G/L accounts: a vendor is named
                only so the Payment desk is offered their bank accounts, and
                Pay To left blank means the person raising it — which is what
                the server fills in (`_clean_expense`), so asking for it with
                an asterisk would be the form inventing a rule. */}
            <PartnerPicker
              label={c.partnerLabel}
              company={form.company}
              source={c.partnerSource}
              value={form.partner}
              valueName={form.partnerName}
              onPick={(partner) => change({ partner: partner.value, partnerName: partner.label })}
              disabled={!step.type}
              required={false}
            />
            {/* PAY TO IS WHAT THE SERVER IS SENT as `partner_name`, so it
                must say what will actually happen: with a vendor picked, the
                VENDOR is paid and this follows their name (read-only, because
                typing another one here would be ignored); with no vendor, a
                typed name, and blank means whoever raises it. */}
            <Field label="Pay To">
              <Input
                value={form.partner ? form.partnerName : form.payee}
                onChangeText={(payee) => change({ payee })}
                placeholder={
                  !step.type
                    ? "Pick a type first"
                    : "Leave blank to pay whoever raises it"
                }
                editable={step.type && !form.partner}
                maxLength={200}
              />
            </Field>
          </>
        ) : c.decided ? (
          <PartnerPicker
            label={c.partnerLabel}
            company={form.company}
            source={c.partnerSource}
            value={form.partner}
            valueName={form.partnerName}
            onPick={(partner) => change({ partner: partner.value, partnerName: partner.label })}
            disabled={!step.against}
            error={errorFor(c.partnerLabel)}
          />
        ) : null}
      </Card>

      {/* ── What is being paid ─────────────────────────────────────── */}
      {c.reference ? (
        <DocumentSelector
          kind={c.reference}
          form={form}
          documents={documents.documents}
          loading={documents.loading}
          error={documents.error}
          onPick={pickDocuments}
          onAllocationChange={(id, patch) => setForm(changeAllocation(form, id, patch))}
        />
      ) : null}

      {c.expense ? (
        <ExpenseLines
          company={form.company}
          form={form}
          onChange={change}
          showErrors={showErrors}
        />
      ) : null}

      {/* Against PO: what the vendor's ledger says we have already paid on
          account, which no PO's open amount reflects. Shown, never deducted —
          SAP does not say which PO such a payment was for. */}
      {c.reference === "VENDOR_PO" && form.partner ? (
        <VendorOnAccountCard
          company={form.company}
          cardCode={form.partner}
          poEntries={form.selected}
        />
      ) : null}

      {c.plainAmount ? (
        <Card title="Amount">
          <Row>
            <Field
              label="Amount"
              required
              error={errorFor("Amount", plainAmountError(form.amount))}
            >
              <Input
                value={form.amount}
                onChangeText={(amount) => change({ amount })}
                placeholder={step.partner ? "0" : "Pick who is being paid first"}
                keyboardType="decimal-pad"
                prefix="₹"
                editable={step.partner}
                invalid={Boolean(errorFor("Amount", plainAmountError(form.amount)))}
              />
            </Field>
            {pairAmountWithBillDate ? (
              <Field
                label="Expected Bill Date"
                required
                error={errorFor("Expected Bill Date")}
              >
                <DateField
                  value={form.expectedBillDate}
                  onChange={(expectedBillDate) => change({ expectedBillDate })}
                  minDate={today}
                  editable={amountDone}
                  invalid={Boolean(errorFor("Expected Bill Date"))}
                />
              </Field>
            ) : null}
          </Row>
        </Card>
      ) : null}

      {/* ── When, and how it comes back ────────────────────────────── */}
      {c.expectedDate || (c.expectedBillDate && !pairAmountWithBillDate) || c.repayment ? (
        <Card title="Dates">
          {/* VENDOR -> AGAINST PO: OPTIONAL (since 2026-10-07, on both
              clients and in the server's own `CASES`). It is when the payment
              is expected to be adjusted against the PO, which the requester
              often cannot know; one that IS given still may not be in the
              past, and `validate` says so. */}
          {c.expectedDate ? (
            <Field label="Expected Bill Date" error={errorFor("Expected Bill Date")}>
              <DateField
                value={form.expectedDate}
                onChange={(expectedDate) => change({ expectedDate })}
                minDate={today}
                editable={amountDone}
                invalid={Boolean(errorFor("Expected Bill Date"))}
              />
            </Field>
          ) : null}

          {c.expectedBillDate && !pairAmountWithBillDate ? (
            <Field
              label="Expected Bill Date"
              required
              error={errorFor("Expected Bill Date")}
            >
              <DateField
                value={form.expectedBillDate}
                onChange={(expectedBillDate) => change({ expectedBillDate })}
                minDate={today}
                editable={amountDone}
                invalid={Boolean(errorFor("Expected Bill Date"))}
              />
            </Field>
          ) : null}

          {c.repayment ? (
            <>
              <Select
                label="Return Method"
                required
                data={RETURN_METHODS.map((method) => ({
                  label: method.label,
                  value: method.value,
                }))}
                value={form.returnMethod}
                onChange={(returnMethod) =>
                  change({ returnMethod: returnMethod as RequestForm["returnMethod"] })
                }
                placeholder={amountDone ? "Select" : "Enter the amount first"}
                disabled={!amountDone}
                error={errorFor("Return Method")}
              />

              {form.returnMethod === "CUSTOM" ? (
                <Field
                  label="How it comes back"
                  required
                  error={errorFor("Return Method (what it is)")}
                >
                  <Input
                    value={form.returnMethodOther}
                    onChangeText={(returnMethodOther) => change({ returnMethodOther })}
                    placeholder="Say how the advance will be returned"
                    invalid={Boolean(errorFor("Return Method (what it is)"))}
                  />
                </Field>
              ) : null}

              {form.returnMethod === "EMI" ? (
                <>
                  <Row>
                    <Field
                      label="Installments"
                      required
                      error={errorFor("Number of Installments", emi.error)}
                    >
                      <Input
                        value={form.installments}
                        onChangeText={(installments) => change({ installments })}
                        placeholder="e.g. 4"
                        keyboardType="numeric"
                        invalid={Boolean(errorFor("Number of Installments", emi.error))}
                      />
                    </Field>
                    <Field
                      label="EMI Amount"
                      required
                      error={errorFor("EMI Amount", fromEmi.error)}
                    >
                      <Input
                        value={form.emiAmount}
                        onChangeText={(emiAmount) => change({ emiAmount })}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        prefix="₹"
                        invalid={Boolean(errorFor("EMI Amount", fromEmi.error))}
                      />
                    </Field>
                  </Row>
                  <Row>
                    <Field
                      label="EMI Start Date"
                      required
                      error={errorFor("EMI Start Date")}
                    >
                      <DateField
                        value={form.expectedFromDate}
                        onChange={(expectedFromDate) => change({ expectedFromDate })}
                        minDate={today}
                        invalid={Boolean(errorFor("EMI Start Date"))}
                      />
                    </Field>
                    <Field
                      label="Fully Returned By"
                    >
                      <DateField
                        value={
                          form.expectedFromDate && form.installments
                            ? emiEndDate(form.expectedFromDate, form.installments)
                            : ""
                        }
                        onChange={() => {}}
                        placeholder="—"
                        editable={false}
                      />
                    </Field>
                  </Row>
                </>
              ) : null}

              {form.returnMethod === "ONE_TIME" ? (
                <Field
                  label="Return Date"
                  required
                  error={errorFor("Return Date")}
                >
                  <DateField
                    value={form.expectedToDate}
                    onChange={(expectedToDate) => change({ expectedToDate })}
                    minDate={today}
                    invalid={Boolean(errorFor("Return Date"))}
                  />
                </Field>
              ) : null}

              {form.returnMethod === "CUSTOM" ? (
                <Row>
                  <Field
                    label="Expected From Date"
                    required
                    error={errorFor("Expected From Date")}
                  >
                    <DateField
                      value={form.expectedFromDate}
                      onChange={(expectedFromDate) => change({ expectedFromDate })}
                      invalid={Boolean(errorFor("Expected From Date"))}
                    />
                  </Field>
                  <Field
                    label="Expected To Date"
                    required
                    error={errorFor("Expected To Date")}
                  >
                    <DateField
                      value={form.expectedToDate}
                      onChange={(expectedToDate) => change({ expectedToDate })}
                      minDate={form.expectedFromDate || undefined}
                      invalid={Boolean(errorFor("Expected To Date"))}
                    />
                  </Field>
                </Row>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {/* ── Who it belongs to ──────────────────────────────────────── */}
      <Card title="Additional Information">
        {/* THE DEPARTMENT IS SAP'S BUDGET HEAD (cost-centre dimension 3),
            which is what the Workflow Engine routes the request on. It belongs
            to ONE company's SAP, so it waits on the company and clears with
            it: a code picked under OIL names a different cost centre under
            MART, or none at all. */}
        <Select
          label="Department"
          required
          searchable
          data={budgets.optionsFor("BUDGET", form.budget, form.budgetName)}
          value={form.budget}
          onChange={(value) =>
            change({
              budget: value,
              budgetName:
                budgets.optionsFor("BUDGET", "", "").find((o) => o.value === value)?.label ?? "",
            })
          }
          placeholder={
            !datesDone
              ? "Answer the dates first"
              : budgets.loading
                ? "Loading departments…"
                : "Select department"
          }
          disabled={!datesDone}
          error={errorFor("Department") ?? budgets.error ?? undefined}
        />

        {/* AN EXPENSE NAMES NO PURPOSE: its budget head routes it, and the
            Payment desk sets its Sub Budget. */}
        {c.expense ? null : (
        <>
        {/* WHAT THE MONEY IS FOR: the Payment Desk's own list, the same for
            every company, which is why it does not clear with one. */}
        <Select
          label="Payment Purpose"
          required
          searchable
          data={purposes.purposes.map((purpose) => ({
            label: purpose.label,
            value: purpose.code,
          }))}
          value={form.purpose}
          onChange={(value) =>
            change({
              purpose: value,
              purposeLabel:
                purposes.purposes.find((purpose) => purpose.code === value)?.label ?? "",
              purposeNeedsHead: purposeNeedsHead(value),
            })
          }
          placeholder={
            !departmentDone
              ? "Pick the department first"
              : purposes.loading
                ? "Loading purposes…"
                : "Select purpose"
          }
          disabled={!departmentDone}
          error={errorFor("Payment Purpose") ?? purposes.error ?? undefined}
        />
        </>
        )}

        {/* APPROVED "BY DEPARTMENT": the requester names the HOD whose stage
            it goes to. An HOD with no OMS login cannot approve, so that is
            said here rather than at submission. */}
        {askHead ? (
          <Select
            label="Department Head"
            required
            searchable
            searchPlaceholder="Search HOD name or code"
            data={headOptions}
            value={form.departmentHead}
            onChange={(value) => {
              const chosen = heads.heads.find((head) => head.employee_code === value);
              change({
                departmentHead: value,
                departmentHeadName: chosen?.employee_name ?? "",
                departmentHeadLogin: chosen?.user?.username ?? "",
              });
            }}
            onSearchTextChange={setHeadSearch}
            placeholder={heads.loading ? "Loading HODs…" : "Select department head"}
            error={
              heads.error ||
              (form.departmentHead && !form.departmentHeadLogin
                ? departmentHeadLoginError(form.departmentHeadName)
                : errorFor("Department Head"))
            }
          />
        ) : null}

        {/* NOT ASKED ON AN EXPENSE: dated the day it is raised, and its
            lines say what it is for. */}
        {c.expense ? null : (
        <>
        <Select
          label="Ownership"
          required
          searchable
          data={ownerOptions}
          value={form.ownership}
          onChange={(ownership) => change({ ownership })}
          placeholder={
            !purposeDone
              ? "Pick the purpose first"
              : owners.loading
                ? "Loading owners…"
                : "Select owner"
          }
          disabled={!purposeDone}
          error={errorFor("Ownership") ?? owners.error ?? undefined}
        />

        {/* PAYMENT DATE ALONE ON ITS ROW. Priority used to sit beside it and
            is no longer asked for (2026-10-01): a request is routed by its
            department and purpose, not by what the requester called urgent. */}
        <Field label="Payment Date" required error={errorFor("Payment Date")}>
          <DateField
            value={form.paymentDate}
            onChange={(paymentDate) => change({ paymentDate })}
            minDate={today}
            editable={form.ownership !== ""}
            invalid={Boolean(errorFor("Payment Date"))}
          />
        </Field>

        </>
        )}

        {/* REMARKS ARE ASKED OF AN EXPENSE TOO, just not required of it — the
            same rule the web and `validate` follow. An Expense explains itself
            through its lines, but the one sentence saying why it is being paid
            at all still belongs somewhere, and hiding the field left an
            Expense requester with nowhere to put it. */}
        <Field
          label="Remarks"
          required={!c.expense}
          error={errorFor("Remarks")}
        >
          <Input
            value={form.remarks}
            onChangeText={(remarks) => change({ remarks })}
            placeholder={
              c.expense
                ? "Anything the approver should know (optional)"
                : form.paymentDate
                  ? "Why this payment is needed, and anything the approver should know"
                  : "Fill in the fields above first"
            }
            multiline
            editable={c.expense || form.paymentDate !== ""}
            invalid={Boolean(errorFor("Remarks"))}
          />
        </Field>
      </Card>

      {/* ── Supporting files ───────────────────────────────────────── */}
      <Card
        title="Attachments"
        subtitle="Quotations, approvals, anything the approver will ask for."
      >
        <AttachmentPicker
          label="Supporting documents"
          attachments={files.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            size: attachment.size,
            // A file the server already holds has no local uri, so its tile
            // shows the document icon rather than a preview.
            uri: attachment.file?.uri ?? "",
            mimeType: attachment.file?.mimeType ?? "",
          }))}
          onAdd={addFiles}
          onRemove={removeFile}
          // Tapping a tile opens it: a requester who has just photographed
          // three pages needs to check which one they attached.
          onOpen={(stub) =>
            setViewing(files.find((file) => file.id === stub.id) ?? null)
          }
        />
      </Card>

      <PickedFileViewer attachment={viewing} onClose={() => setViewing(null)} />

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
    </View>
  );
}

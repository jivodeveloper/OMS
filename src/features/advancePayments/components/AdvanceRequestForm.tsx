import React, { useState } from "react";
import { View } from "react-native";

import AttachmentPicker from "@/app/(main)/payments/_components/AttachmentPicker";
import type { PickedFile as PaymentsPickedFile } from "@/app/(main)/payments/_lib/pickAttachment";

import { useDepartments, useOpenDocuments, useOwners } from "../hooks/useAdvanceMasters";
import { attachFile, type FileAttachment } from "../logic/attachments";
import {
  COMPANIES,
  PARTNER_TYPES,
  PRIORITIES,
  RETURN_METHODS,
  type OpenDocument,
} from "../logic/constants";
import {
  allocationRows,
  allocationTotals,
  applyChange,
  calculateEmi,
  changeAllocation,
  emiEndDate,
  installmentsFromEmi,
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
  const { departments } = useDepartments();
  /** The attachment being looked at, if any — see `PickedFileViewer`. */
  const [viewing, setViewing] = useState<FileAttachment | null>(null);
  const owners = useOwners();
  const documents = useOpenDocuments(form.company, c.reference, form.partner);

  const change = (patch: Partial<RequestForm>) => setForm(applyChange(form, patch));

  const emi = calculateEmi(form.amount, form.installments);
  const fromEmi = installmentsFromEmi(form.amount, form.emiAmount);

  const department = departments.find((row) => String(row.id) === form.department);
  const subDepartments = department?.sub_departments ?? [];

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
  const departmentDone =
    form.department !== "" && (!form.hasSubDepartments || form.subDepartment !== "");
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
          <Select
            label="Payment Against"
            required
            data={c.paymentAgainstOptions.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            value={form.paymentAgainst}
            onChange={(paymentAgainst) =>
              change({ paymentAgainst: paymentAgainst as RequestForm["paymentAgainst"] })
            }
            placeholder={step.type ? "Select" : "Pick a type first"}
            disabled={!step.type}
            error={errorFor("Payment Against")}
          />
        </Row>

        {form.paymentAgainst === "OTHER" ? (
          <Field
            label="What is it for"
            required
            error={errorFor("Payment Against (what it is)")}
          >
            <Input
              value={form.paymentAgainstOther}
              onChangeText={(paymentAgainstOther) => change({ paymentAgainstOther })}
              placeholder="Say what the payment is against"
              invalid={Boolean(errorFor("Payment Against (what it is)"))}
            />
          </Field>
        ) : null}

        {c.decided ? (
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
          {c.expectedDate ? (
            <Field
              label="Expected Bill Date"
              required
              error={errorFor("Expected Bill Date")}
            >
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
        <Select
          label="Department"
          required
          searchable
          data={departments.map((row) => ({ label: row.name, value: String(row.id) }))}
          value={form.department}
          onChange={(value) => {
            const picked = departments.find((row) => String(row.id) === value);
            change({
              department: value,
              departmentName: picked?.name ?? "",
              hasSubDepartments: (picked?.sub_departments.length ?? 0) > 0,
              subDepartment: "",
              subDepartmentName: "",
            });
          }}
          placeholder={datesDone ? "Select department" : "Answer the dates first"}
          disabled={!datesDone}
          error={errorFor("Department")}
        />

        {form.hasSubDepartments ? (
          <Select
            label="Sub-department"
            required
            searchable
            data={subDepartments.map((row) => ({ label: row.name, value: String(row.id) }))}
            value={form.subDepartment}
            onChange={(value) =>
              change({
                subDepartment: value,
                subDepartmentName:
                  subDepartments.find((row) => String(row.id) === value)?.name ?? "",
              })
            }
            placeholder="Select sub-department"
            error={errorFor("Sub-department")}
          />
        ) : null}

        <Select
          label="Ownership"
          required
          searchable
          data={ownerOptions}
          value={form.ownership}
          onChange={(ownership) => change({ ownership })}
          placeholder={
            !departmentDone
              ? "Pick the department first"
              : owners.loading
                ? "Loading owners…"
                : "Select owner"
          }
          disabled={!departmentDone}
          error={errorFor("Ownership") ?? owners.error ?? undefined}
        />

        <Row>
          <Field
            label="Payment Date"
            required
            error={errorFor("Payment Date")}
          >
            <DateField
              value={form.paymentDate}
              onChange={(paymentDate) => change({ paymentDate })}
              minDate={today}
              editable={form.ownership !== ""}
              invalid={Boolean(errorFor("Payment Date"))}
            />
          </Field>
          <Select
            label="Priority"
            required
            data={PRIORITIES.map((priority) => ({
              label: priority.label,
              value: priority.value,
            }))}
            value={form.priority}
            onChange={(priority) => change({ priority: priority as RequestForm["priority"] })}
            disabled={form.paymentDate === ""}
          />
        </Row>

        <Field label="Remarks" required error={errorFor("Remarks")}>
          <Input
            value={form.remarks}
            onChangeText={(remarks) => change({ remarks })}
            placeholder={
              form.paymentDate
                ? "Why this payment is needed, and anything the approver should know"
                : "Fill in the fields above first"
            }
            multiline
            editable={form.paymentDate !== ""}
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

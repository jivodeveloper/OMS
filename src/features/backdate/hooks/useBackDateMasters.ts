import { useEffect, useMemo, useRef, useState } from "react";

import backdateService, {
  BackDateApiError,
  type BackDateCompany,
  type SapDocumentType,
  type SapUser,
} from "@/src/services/backdate.service";

/** Shape the shared Dropdown consumes. */
export interface Option {
  label: string;
  value: string;
}

/**
 * Turn a failed BackDate call into a sentence worth showing.
 *
 * Reads `err.status`, NOT `err.response.status`. `src/services/api.ts` is a
 * fetch wrapper, not axios — it never produces a `response` object, so the
 * axios-shaped helper the payments hooks use falls through to generic text for
 * every error. `backdate.service.ts` throws `BackDateApiError` with the status
 * lifted onto it, and that is what this reads.
 */
export function messageFrom(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof BackDateApiError) {
    if (err.status === 403) return "You do not have permission to do this.";
    if (err.status === 404) return "Not found.";
    // A 400 names the field and why. The envelope `message` beside it is only
    // "Please correct the highlighted fields", and nothing on a phone form is
    // highlighted -- so the per-field text is the part the user needs.
    const details = fieldErrorLines(err.errors);
    if (details.length > 0) return details.join("\n");
    if (err.message) return err.message;
  }
  const anyErr = err as { message?: string };
  return anyErr?.message || fallback;
}

/** Server field names as the form labels them. */
const FIELD_LABELS: Record<string, string> = {
  company: "Company",
  sap_username: "SAP User",
  document_type_name: "Document Type",
  action: "Action",
  from_date: "From Date",
  to_date: "To Date",
  time_limit: "Rights Expire",
  remarks: "Reason",
};

/**
 * `{"company": ["..."], "non_field_errors": ["..."]}` as display lines.
 *
 * Values come as a string, a list of strings, or (for nested serializers) an
 * object of the same; anything else is skipped rather than printed raw.
 * `sap` is left out: the approval screens render that one themselves.
 */
function fieldErrorLines(errors: unknown): string[] {
  if (!errors || typeof errors !== "object") return [];
  const lines: string[] = [];
  for (const [field, value] of Object.entries(errors as Record<string, unknown>)) {
    if (field === "sap") continue;
    const texts = Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? fieldErrorLines(value)
          : [];
    const label =
      field === "non_field_errors" || field === "detail"
        ? ""
        : FIELD_LABELS[field] ?? field.replace(/_/g, " ");
    for (const text of texts) lines.push(label ? `${label}: ${text}` : text);
  }
  return lines;
}

/**
 * SAP's user and object-type lists for one company.
 *
 * Both are per company, so picking a different company reloads them and the
 * caller clears whatever was chosen from the old lists.
 *
 * THE DEGRADE IS PART OF THE CONTRACT, not a safety net. `/sap-users/` and
 * `/document-types/` are gated on the `BackDate` key alone, so an approver
 * correcting a request SAP refused gets 403 from both — every time, by design.
 * `mastersError` is how the form knows to offer free text instead of a picker,
 * and the edit screen always takes that path for an approver-only user.
 */
export function useBackDateMasters(company: BackDateCompany | null) {
  const [sapUsers, setSapUsers] = useState<SapUser[]>([]);
  const [docTypes, setDocTypes] = useState<SapDocumentType[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [mastersError, setMastersError] = useState("");

  // A slow answer for the company the user has already moved off must not
  // overwrite the current one.
  const runId = useRef(0);

  useEffect(() => {
    if (!company) {
      setSapUsers([]);
      setDocTypes([]);
      return;
    }
    const run = ++runId.current;
    let cancelled = false;

    setLoadingMasters(true);
    setMastersError("");

    Promise.all([
      backdateService.sapUsers(company),
      backdateService.documentTypes(company),
    ])
      .then(([users, types]) => {
        if (cancelled || run !== runId.current) return;
        setSapUsers(users);
        setDocTypes(types);
      })
      .catch((err) => {
        if (cancelled || run !== runId.current) return;
        setSapUsers([]);
        setDocTypes([]);
        setMastersError(
          messageFrom(err, "SAP's lists could not be loaded."),
        );
      })
      .finally(() => {
        if (!cancelled && run === runId.current) setLoadingMasters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [company]);

  const userOptions = useMemo<Option[]>(
    () => sapUsers.map((u) => ({ label: u.user_code, value: u.user_code })),
    [sapUsers],
  );

  /**
   * The object NAME is both the label and the value. A request stores the
   * name; SAP's numeric ObjType is resolved from it server-side at the moment
   * of the call, so the number never travels through the form.
   */
  const typeOptions = useMemo<Option[]>(
    () => docTypes.map((t) => ({ label: t.name, value: t.name })),
    [docTypes],
  );

  return { userOptions, typeOptions, loadingMasters, mastersError };
}

export default useBackDateMasters;

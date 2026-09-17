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
    if (err.message) return err.message;
  }
  const anyErr = err as { message?: string };
  return anyErr?.message || fallback;
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

import { API_BASE_URL, api } from "./api";
import { storage } from "../utils/storage";

/**
 * Credit Limit — ask for a customer's SAP credit limit to be changed.
 *
 * THE TYPES ARE THE WEB CLIENT'S, verbatim
 * (`OMS-Frontend/src/services/creditLimitService.ts`): they mirror
 * `credit_limit/serializers.py`, and two hand-written copies of one server's
 * shapes drift. What differs is the CALLS — this app's fetch wrapper resolves
 * `{success, message, data}` rather than throwing, sends React Native's
 * FormData, and has no axios `response` to read an error out of.
 *
 * Decimals arrive as STRINGS and are kept that way: a credit limit is money,
 * and a float is the wrong type to carry one through a form.
 */

const BASE = "/credit-limit";

/** Read past the client's cache — a queue is stale the moment somebody acts. */
const FRESH = { cache: "no-store" } as const;

export type CreditLimitCompany = "OIL" | "BEVERAGES" | "MART";
export const CREDIT_LIMIT_COMPANIES: CreditLimitCompany[] = ["OIL", "BEVERAGES", "MART"];

export type CreditLimitStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Live OCRD facts for one customer. Decimals arrive as strings. */
export interface CreditLimitCustomer {
  card_code: string;
  card_name: string;
  card_type: string;
  main_group: string;
  balance: string;
  credit_limit: string;
}

export interface CreditLimitFlow {
  status: CreditLimitStatus;
  workflow_code: string;
  current_stage_name: string;
  current_stage_sequence: number | null;
  current_user_username: string;
  total_stage: number;
  /** SAP's own words on the last write attempt; empty until one is made. */
  sap_response: string;
  updated_at: string;
}

export interface CreditLimitRequest {
  id: number;
  company: CreditLimitCompany;
  card_code: string;
  card_name: string;
  main_group: string;
  /** Snapshotted from SAP at submission. */
  current_balance: string;
  current_credit_limit: string;
  new_credit_limit: string;
  valid_till: string;
  remarks: string;
  /** Supporting documents — shared by every request of one submission. */
  attachments: CreditLimitAttachment[];
  invoice_log: unknown;
  created_by?: number;
  created_by_username: string;
  created_at: string;
  flow: CreditLimitFlow | null;
}

/** One supporting document on a request. The bytes are fetched separately. */
export interface CreditLimitAttachment {
  id: number;
  name: string;
}

export interface CreditLimitActionRow {
  id?: number;
  action: string;
  stage?: number | null;
  stage_name: string;
  acted_by?: number | null;
  acted_by_username: string;
  remarks: string;
  acted_at: string;
}

export interface CreditLimitStageProgress {
  stage_id: number;
  sequence: number;
  stage_name: string;
  status: "APPROVED" | "REJECTED" | "AWAITING" | "UPCOMING" | "SKIPPED";
  reviewer: string;
  acted_by: string;
  acted_at: string | null;
  remarks: string;
}

export interface CreditLimitHistory {
  actions: CreditLimitActionRow[];
  stages: CreditLimitStageProgress[];
}

/** A file as this app gets one — `expo-document-picker` / `expo-image-picker`. */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

/** One party of a submission: who, how much, and until when. */
export interface CreditLimitLine {
  card_code: string;
  new_credit_limit: string;
  /** `YYYY-MM-DD`, today or later. */
  valid_till: string;
}

export interface NewCreditLimitRequest {
  company: CreditLimitCompany;
  /** One or more parties. The server raises one request per line. */
  lines: CreditLimitLine[];
  /** Shared by every line of the submission. */
  remarks?: string;
  /** Shared by every line too. At most `MAX_CREDIT_LIMIT_ATTACHMENTS`. */
  attachments?: PickedFile[];
}

/** At most this many parties in one submission (`flow.MAX_LINES`). */
export const MAX_CREDIT_LIMIT_LINES = 50;

/** At most this many documents in one submission (`flow.MAX_ATTACHMENTS`). */
export const MAX_CREDIT_LIMIT_ATTACHMENTS = 10;

/**
 * THE RULE, as `flow.attachment_required` states it: a single-party request
 * needs AT LEAST ONE supporting document; a multi-party submission may go
 * without.
 *
 * One change is argued on its own evidence. A batch is argued on the covering
 * note, and asking for a file per party would mean one file repeated fifty
 * times.
 */
export const attachmentRequired = (lineCount: number): boolean => lineCount === 1;

/** One line the server refused, as `errors.lines` names it. */
export interface CreditLimitLineError {
  index: number;
  card_code: string;
  message: string;
}

/**
 * The lines a refusal names, so a form can mark the rows that failed rather
 * than showing the first message alone. NOTHING WAS SAVED when this is set:
 * the server submits a batch atomically.
 */
export function creditLimitLineErrors(err: unknown): CreditLimitLineError[] {
  const lines = (err as { errors?: { lines?: unknown } })?.errors?.lines;
  if (!Array.isArray(lines)) return [];
  return lines.filter(
    (line): line is CreditLimitLineError =>
      Boolean(line) && typeof line === "object" && "message" in (line as object),
  );
}

/** One party of a company's synced SAP table: who a request can be raised for. */
export interface CreditLimitParty {
  card_code: string;
  card_name: string;
  main_group?: string | null;
  state?: string | null;
}

/* ------------------------------------------------------------------ *
 * Envelope, errors
 * ------------------------------------------------------------------ */

/** A thrown refusal, carrying what the server said. */
interface CreditLimitApiError extends Error {
  status?: number;
  errors?: unknown;
}

/**
 * Turn this app's `{success:false}` answer into a thrown error.
 *
 * The fetch client RESOLVES on failure, so every call has to decide for
 * itself; `guard` is that decision in one place, and it keeps the server's
 * message and `errors` so the screen can show both.
 */
function guard(res: any): any {
  if (res && typeof res === "object" && "success" in res && res.success === false) {
    const error: CreditLimitApiError = new Error(
      res?.message || "The request could not be completed.",
    );
    error.status = typeof res?.status === "number" ? res.status : undefined;
    error.errors = res?.errors;
    throw error;
  }
  return res;
}

const unwrap = <T,>(body: any): T =>
  body && typeof body === "object" && "data" in body ? (body.data as T) : (body as T);

const rows = <T,>(body: any): T[] => {
  const inner = unwrap<any>(body);
  if (Array.isArray(inner)) return inner;
  if (inner && Array.isArray(inner.results)) return inner.results;
  return [];
};

/**
 * A readable sentence from a refusal.
 *
 * The server's message is passed through: a 409 ("SAP has no customer …", "no
 * workflow matches …"), a 403 ("not your stage") and a 502 SAP refusal each
 * say something specific, and a generic line would hide the one thing the
 * reader can act on. SAP's own words (`errors.sap`) are appended when there.
 */
export function creditLimitError(err: unknown): string {
  const failure = err as CreditLimitApiError;
  const message = (failure?.message || "").trim();
  const detail = (failure?.errors as { sap?: unknown })?.sap;
  const sap = typeof detail === "string" ? detail.trim() : "";

  if (message && sap) return `${message}\n${sap}`;
  if (message && message !== "The request could not be completed.") return message;
  if (sap) return sap;

  switch (failure?.status) {
    case undefined:
    case 0:
      return "The server could not be reached. Check the connection and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You are not allowed to do that.";
    case 404:
      return "That request is no longer there.";
    case 502:
    case 503:
      return "SAP could not be reached. Try again shortly.";
    default:
      return failure?.status
        ? `The server refused that (${failure.status}).`
        : "The request could not be completed.";
  }
}

/** Every line of detail a refusal carries beside its headline. */
export function creditLimitProblems(err: unknown): string[] {
  const errors = (err as CreditLimitApiError)?.errors;
  if (!errors || typeof errors !== "object") return [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    // `sap` is already in the headline; naming it twice helps nobody.
    if (key === "sap") continue;
    for (const line of Array.isArray(value) ? value : [value]) {
      if (typeof line === "string" && line.trim()) {
        out.push(key === "non_field_errors" ? line : `${key.replace(/_/g, " ")}: ${line}`);
      }
    }
  }
  return out;
}

/** `?a=1&b=2`, leaving out anything empty. */
const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.append(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
};

export interface ListOptions {
  company?: CreditLimitCompany | "";
  status?: CreditLimitStatus | "";
}

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export const creditLimitService = {
  /**
   * One customer, read LIVE from SAP.
   *
   * The synced party table answers "which customer"; this answers "what is
   * their balance and limit RIGHT NOW", which is the pair a requester is
   * asking to change and an approver is deciding on.
   */
  customer: async (
    company: CreditLimitCompany,
    cardCode: string,
  ): Promise<CreditLimitCustomer> =>
    unwrap<CreditLimitCustomer>(
      guard(await api.get(`${BASE}/customers/${encodeURIComponent(cardCode)}/${query({ company })}`)),
    ),

  /** The requests this user raised. */
  listRequests: async (options: ListOptions = {}): Promise<CreditLimitRequest[]> =>
    rows<CreditLimitRequest>(
      guard(
        await api.get(
          `${BASE}/requests/${query({ company: options.company, status: options.status })}`,
          undefined,
          FRESH,
        ),
      ),
    ),

  getRequest: async (id: number): Promise<CreditLimitRequest> =>
    unwrap<CreditLimitRequest>(
      guard(await api.get(`${BASE}/requests/${id}/`, undefined, FRESH)),
    ),

  /**
   * Raise ONE REQUEST PER PARTY, in one submission.
   *
   * Multipart, because it carries the shared file; `lines` travels as a JSON
   * STRING beside it, which is what the view parses (a multipart field cannot
   * carry a list any other way). Answers with one request per line, in the
   * order the server created them.
   *
   * ATOMIC: if any line is refused nothing is saved, and the refusal names
   * which (`creditLimitLineErrors`).
   */
  createRequest: async (body: NewCreditLimitRequest): Promise<CreditLimitRequest[]> => {
    const form = new FormData();
    form.append("company", body.company);
    form.append("lines", JSON.stringify(body.lines));
    if (body.remarks) form.append("remarks", body.remarks);
    // SEVERAL FILES UNDER ONE KEY, which is what the view reads
    // (`request.FILES.getlist("attachments")`).
    for (const file of body.attachments ?? []) {
      form.append("attachments", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/octet-stream",
      } as unknown as Blob);
    }
    return rows<CreditLimitRequest>(guard(await api.post(`${BASE}/requests/`, form)));
  },

  /** What was done to it, and the stages it has still to pass. */
  history: async (id: number): Promise<CreditLimitHistory> =>
    unwrap<CreditLimitHistory>(
      guard(await api.get(`${BASE}/requests/${id}/history/`, undefined, FRESH)),
    ),

  /* --- The approval desk ------------------------------------------- */

  /** Waiting on THIS user, at their stage. */
  approvalQueue: async (options: ListOptions = {}): Promise<CreditLimitRequest[]> =>
    rows<CreditLimitRequest>(
      guard(
        await api.get(
          `${BASE}/approvals/queue/${query({ company: options.company })}`,
          undefined,
          FRESH,
        ),
      ),
    ),

  /** What this user has already decided. */
  approvalHistory: async (options: ListOptions = {}): Promise<CreditLimitRequest[]> =>
    rows<CreditLimitRequest>(
      guard(
        await api.get(
          `${BASE}/approvals/history/${query({ company: options.company, status: options.status })}`,
          undefined,
          FRESH,
        ),
      ),
    ),

  approve: async (id: number, remarks = ""): Promise<CreditLimitRequest> =>
    unwrap<CreditLimitRequest>(
      guard(await api.post(`${BASE}/requests/${id}/approve/`, { remarks })),
    ),

  reject: async (id: number, remarks: string): Promise<CreditLimitRequest> =>
    unwrap<CreditLimitRequest>(
      guard(await api.post(`${BASE}/requests/${id}/reject/`, { remarks })),
    ),

  /**
   * ONE DOCUMENT'S BYTES, as a `data:` URI an `<Image>` can render.
   *
   * Fetched WITH the bearer token: the endpoint is permission-checked, so
   * handing its URL to `<Image>` or `openURL` would send an unauthenticated
   * request and come back 401.
   */
  attachmentImage: async (requestId: number, attachmentId: number): Promise<string> =>
    fetchDataUri(
      `${API_BASE_URL}${BASE}/requests/${requestId}/attachments/${attachmentId}/`,
    ),

  /** The same bytes, written to a file the OS can hand to a PDF viewer. */
  saveAttachment: async (
    requestId: number,
    attachmentId: number,
    name: string,
  ): Promise<string> =>
    download(
      `${API_BASE_URL}${BASE}/requests/${requestId}/attachments/${attachmentId}/`,
      name,
    ),

  /**
   * The company's parties, from the SYNCED SAP table.
   *
   * The same list the web's picker reads (`/sap/parties/category/`), and it
   * only answers "which customer" — the balance and the limit are then read
   * live, because this table can be stale.
   */
  parties: async (company: CreditLimitCompany): Promise<CreditLimitParty[]> =>
    rows<CreditLimitParty>(
      guard(await api.get(`/sap/parties/category/${query({ category: company })}`)),
    ),
};

/* ------------------------------------------------------------------ *
 * Files
 *
 * THE SAME TWO HELPERS the advance payment service carries, and for the same
 * reason: these endpoints need the bearer token, so the bytes have to be
 * fetched rather than linked.
 * ------------------------------------------------------------------ */

/** What a failed file read means, in words a reader can act on. */
function fileError(status: number): string {
  if (status === 403) return "You do not have permission to open this file.";
  if (status === 404) return "That file is no longer on the server.";
  return `The file could not be opened (status ${status}).`;
}

/** The bytes, as a `data:` URI an `<Image>` can render. */
async function fetchDataUri(url: string): Promise<string> {
  const token = await storage.getAccessToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(fileError(res.status));
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * The bytes, written to a file the OS can open.
 *
 * `documentDirectory` rather than the cache, which the OS may purge while the
 * viewer app is still holding the file; on Android the path is handed over as
 * a `content://` URI, because a `file://` one throws FileUriExposedException
 * in the app that receives it.
 */
async function download(url: string, name: string): Promise<string> {
  const FileSystem = await import("expo-file-system/legacy");
  const { Platform } = await import("react-native");
  const token = await storage.getAccessToken();

  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  const safe = name.replace(/[^\w.\- ]+/g, "_") || "attachment";
  const result = await FileSystem.downloadAsync(url, `${dir}${safe}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) throw new Error(fileError(result.status));
  return Platform.OS === "android"
    ? await FileSystem.getContentUriAsync(result.uri)
    : result.uri;
}

export default creditLimitService;

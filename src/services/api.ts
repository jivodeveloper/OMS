import { Platform } from 'react-native';
import { storage } from '../utils/storage';
import Constants from 'expo-constants';
import { getGetCacheTtl, getInvalidationPrefixes } from '../cache/policy';
import { fetchQuery, invalidateQueries } from '../cache/queryClient';
  
// Fallback used only when EXPO_PUBLIC_API_BASE_URL is not set at build time.
// This MUST stay reachable from a real device: loopback hosts (127.0.0.1) and
// the emulator-only alias 10.0.2.2 resolve to the phone itself in a release
// APK, which makes every request fail with a generic network error.
// For local backend work, override it in .env instead of editing this.
const SHARED_BASE_URL = 'http://103.89.45.75:8081/api';

const DEFAULT_BASE_URL = Platform.select({
  android: SHARED_BASE_URL,
  ios: SHARED_BASE_URL,
  web: SHARED_BASE_URL,
  default: SHARED_BASE_URL,
}) as string;

const ENV_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  process.env.EXPO_PUBLIC_API_URL?.trim();
const BASE_URL = ENV_BASE_URL || DEFAULT_BASE_URL;
export const API_BASE_URL = BASE_URL;
const DEFAULT_REQUEST_TIMEOUT_MS = 70000;
const STATUS_TRACKING_REQUEST_TIMEOUT_MS = 45000;
const SAP_SYNC_REQUEST_TIMEOUT_MS = 0;
const isExpoGo = Constants.appOwnership === 'expo';

const getBaseUrlRiskHint = (): string => {
  try {
    const parsedUrl = new URL(BASE_URL);
    const hints: string[] = [];

    if (Platform.OS === 'ios' && parsedUrl.protocol === 'http:') {
      hints.push('iPhone builds are more reliable with HTTPS');
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsedUrl.hostname)) {
      hints.push('raw IP hosts are fragile on mobile networks');
    }

    if (parsedUrl.port && !['80', '443'].includes(parsedUrl.port)) {
      hints.push(`port ${parsedUrl.port} can be blocked on some networks`);
    }

    return hints.length ? ` ${hints.join('; ')}.` : '';
  } catch {
    return '';
  }
};

if (process.env.EXPO_PUBLIC_API_URL?.trim() && !process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) {
  console.warn(
    'Using deprecated EXPO_PUBLIC_API_URL. Rename it to EXPO_PUBLIC_API_BASE_URL for future builds.',
  );
}

const getTimeoutForEndpoint = (endpoint: string): number => {
  if (endpoint.startsWith('/orders/status-tracking/')) {
    return STATUS_TRACKING_REQUEST_TIMEOUT_MS;
  }

  if (
    endpoint.startsWith('/sap/sync/') ||
    endpoint.startsWith('/sap/approve-sales-order/') ||
    endpoint.startsWith('/sap/push-quotation/')
  ) {
    return SAP_SYNC_REQUEST_TIMEOUT_MS;
  }
  return DEFAULT_REQUEST_TIMEOUT_MS;
};

// Turn a DRF/Django error payload into a readable, human-friendly message.
// Handles strings, arrays of strings, { detail }, { message }, { errors } and
// field-keyed dicts like { items: ["...", "..."], qty: ["..."] }.
const extractErrorMessage = (data: any): string | null => {
  if (data == null) return null;
  if (typeof data === 'string') return data.trim() || null;
  if (Array.isArray(data)) {
    const parts = data.map(extractErrorMessage).filter(Boolean) as string[];
    return parts.length ? parts.join('\n') : null;
  }
  if (typeof data === 'object') {
    if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
    if (typeof data.detail === 'string' && data.detail.trim()) return data.detail.trim();
    const source = data.errors ?? data;
    const parts: string[] = [];
    for (const value of Object.values(source)) {
      const msg = extractErrorMessage(value);
      if (msg) parts.push(msg);
    }
    return parts.length ? parts.join('\n') : null;
  }
  return null;
};

const parseResponse = async (response: Response) => {
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { raw, data };
};

const requestWithFallback = async (
  endpoint: string,
  init: RequestInit
): Promise<any> => {
  const url = `${BASE_URL}${endpoint}`;
  const timeoutMs = getTimeoutForEndpoint(endpoint);
  const shouldUseTimeout = timeoutMs > 0;

  try {
    console.log(`${init.method} request to:`, url);
    const controller = shouldUseTimeout ? new AbortController() : null;
    const timeout = shouldUseTimeout
      ? setTimeout(() => controller?.abort(), timeoutMs)
      : null;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    const { raw, data } = await parseResponse(response);

    if (!response.ok) {
      console.log('API Error:', response.status, data || raw);
      return {
        success: false,
        message:
          (data && data.message) ||
          extractErrorMessage(data) ||
          `Request failed (${response.status})`,
        status: response.status,
        errors: data?.errors,
        data,
      };
    }

    return data ?? { success: true };
  } catch (error) {
    const isAbortError =
      error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'));
    const errorMessage = isAbortError
      ? shouldUseTimeout
        ? `Request timed out after ${timeoutMs / 1000}s`
        : 'Request timed out'
      : error instanceof Error
        ? error.message
        : 'Network request failed';
    console.log('Network request failed for URL:', url, errorMessage);

    const cleartextHint =
      isExpoGo && BASE_URL.startsWith('http://')
        ? ' HTTP URL may be blocked in Expo Go. Use a development build for cleartext HTTP.'
        : '';
    const baseUrlRiskHint = getBaseUrlRiskHint();

    return {
      success: false,
      message: isAbortError
        ? shouldUseTimeout
          ? `Request timed out after ${timeoutMs / 1000}s.${cleartextHint}${baseUrlRiskHint}`
          : `Request timed out.${cleartextHint}${baseUrlRiskHint}`
        : `Network request failed.${cleartextHint}${baseUrlRiskHint}`,
      error: errorMessage,
      baseUrlTried: BASE_URL,
    };
  }
};

/* ------------------------------------------------------------------ *
 * JWT lifecycle: automatic refresh on 401, single-flight, no retry of
 * auth endpoints, and a session-expired handoff. Tokens are NEVER logged.
 * ------------------------------------------------------------------ */

// Auth endpoints must never trigger auto-refresh / retry (Task 10).
const AUTH_ENDPOINTS = ['/auth/login/', '/auth/refresh/', '/auth/logout/'];
const isAuthEndpoint = (endpoint: string) =>
  AUTH_ENDPOINTS.some((path) => endpoint.startsWith(path));

// Outcome of a refresh attempt. `invalid` = the refresh token was rejected
// (401/400) → real session end. `network` = timeout/offline/DNS/5xx → the
// session MUST be kept (network errors must never log the user out).
type RefreshResult =
  | { ok: true; access: string }
  | { ok: false; reason: 'invalid' | 'network' };

// Single-flight guard: 20 concurrent 401s trigger exactly ONE /auth/refresh/.
let refreshPromise: Promise<RefreshResult> | null = null;

// Session-expired handoff (AuthContext registers navigation + alert).
let sessionExpiredHandler: (() => void) | null = null;
let sessionExpiring = false;
export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  sessionExpiredHandler = fn;
};

// Device/version metadata headers. DeviceService registers a synchronous
// provider here so version/device headers ride on EVERY request from the one
// chokepoint below — the API layer never imports DeviceService (avoids a cycle
// and keeps this file free of device concerns).
let deviceHeaderProvider: (() => Record<string, string>) | null = null;
export const setDeviceHeaderProvider = (
  fn: (() => Record<string, string>) | null,
) => {
  deviceHeaderProvider = fn;
};

// Post-authentication hook, fired after a SUCCESSFUL token refresh. Lets device
// registration retry itself on the next auth event without this layer knowing
// what DeviceService is. Same inversion-of-control shape as the handler above.
let authenticatedHandler: (() => void) | null = null;
export const setAuthenticatedHandler = (fn: (() => void) | null) => {
  authenticatedHandler = fn;
};

const decodeBase64 = (input: string): string | null => {
  try {
    if (typeof atob === 'function') return atob(input);
    const g = globalThis as unknown as { atob?: (s: string) => string };
    return g.atob ? g.atob(input) : null;
  } catch {
    return null;
  }
};

/** True when the access token is expired (or within 15s of expiring). Returns
 * false if it can't be decoded — the reactive 401 path still covers that. */
export const isAccessTokenExpired = (token: string): boolean => {
  const part = token.split('.')[1];
  if (!part) return false;
  const json = decodeBase64(part.replace(/-/g, '+').replace(/_/g, '/'));
  if (!json) return false;
  try {
    const payload = JSON.parse(json);
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + 15000;
  } catch {
    return false;
  }
};

const doRefresh = async (): Promise<RefreshResult> => {
  let refresh: string | null = null;
  try {
    refresh = await storage.getRefreshToken();
  } catch {
    refresh = null;
  }
  if (!refresh) return { ok: false, reason: 'invalid' };

  const result = await requestWithFallback('/auth/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  const newAccess: string | undefined = result?.access;
  const newRefresh: string | undefined = result?.refresh;

  if (newAccess) {
    try {
      // Rotation returns a new refresh token; persist both.
      await storage.saveTokens(newAccess, newRefresh || refresh);
    } catch {
      /* ignore persistence errors */
    }
    // Successful (re)authentication — let device registration retry if a prior
    // attempt hadn't succeeded. Fire-and-forget; never affects the refresh.
    try {
      authenticatedHandler?.();
    } catch {
      /* device hook must never impact the auth path */
    }
    return { ok: true, access: newAccess };
  }

  // requestWithFallback returns `status: 401` (or 400) for a genuine auth
  // rejection, and NO `status` for network/timeout errors. Only the former
  // ends the session; everything else keeps the tokens.
  if (result?.status === 401 || result?.status === 400) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: false, reason: 'network' };
};

/** Obtain a fresh access token, ensuring only one refresh runs at a time. */
export const refreshAccessToken = (): Promise<RefreshResult> => {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

/** Proactively refresh if the stored access token is expired (startup +
 * background-resume). No-op when there is no refresh token. */
export const ensureFreshAccessToken = async (): Promise<void> => {
  let access: string | null = null;
  let refresh: string | null = null;
  try {
    access = await storage.getAccessToken();
    refresh = await storage.getRefreshToken();
  } catch {
    return;
  }
  if (!refresh) return;
  if (access && !isAccessTokenExpired(access)) return;
  await refreshAccessToken();
};

const handleSessionExpired = async () => {
  if (sessionExpiring) return;
  sessionExpiring = true;
  try {
    await storage.clear();
  } catch {
    /* ignore */
  }
  try {
    sessionExpiredHandler?.();
  } finally {
    sessionExpiring = false;
  }
};

/** Single place that attaches the Bearer token, sends the request, and on a
 * 401 (for non-auth endpoints) refreshes once and retries. */
const sendAuthed = async (
  method: string,
  endpoint: string,
  body?: object,
  tokenOverride?: string,
  isRetry = false,
): Promise<any> => {
  let token = tokenOverride;
  // Never attach a stored token to /auth/login/ (or refresh/logout, which carry
  // their own token in the body). Signing in must not depend on — or be
  // confused by — whatever stale token happens to be on the device. This
  // mirrors the web client, which excludes the login URL from its auth header.
  if (!token && !isAuthEndpoint(endpoint)) {
    try {
      token = (await storage.getAccessToken()) || undefined;
    } catch {
      token = undefined;
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Attach device/version metadata to every request from this single place.
  // Applied BEFORE Authorization so the provider can never clobber the token.
  if (deviceHeaderProvider) {
    try {
      Object.assign(headers, deviceHeaderProvider());
    } catch {
      /* never fail a request over metadata headers */
    }
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const result = await requestWithFallback(endpoint, init);

  if (result?.status === 401 && !isRetry && !isAuthEndpoint(endpoint)) {
    const refreshResult = await refreshAccessToken();
    if (refreshResult.ok) {
      return sendAuthed(method, endpoint, body, refreshResult.access, true);
    }
    // ONLY a rejected refresh token ends the session. A network failure keeps
    // the tokens and just lets this request fail — the user stays logged in.
    if (refreshResult.reason === 'invalid') {
      await handleSessionExpired();
    }
  }

  return result;
};

/**
 * Only responses that actually succeeded are worth caching. The client returns
 * parsed payloads (arrays/objects) rather than throwing on every failure, so
 * guard against storing an error envelope and serving it back as "data".
 */
const isCacheableResponse = (result: any): boolean => {
  if (result == null) return false;
  if (Array.isArray(result)) return true;
  if (typeof result !== 'object') return false;
  if (result.success === false) return false;
  if (result.status === 401 || result.status === 403) return false;
  if ('error' in result && result.error) return false;
  return true;
};

export type ApiGetOptions = {
  /**
   * 'default'  – stale-while-revalidate (cache first, refresh in background)
   * 'reload'   – bypass the cache, fetch fresh, then update the cache
   * 'no-store' – never touch the cache
   */
  cache?: 'default' | 'reload' | 'no-store';
};

/**
 * GET with transparent stale-while-revalidate caching.
 *
 * Caching is opt-in per endpoint via the allowlist in `cache/policy.ts`, so any
 * endpoint without a rule behaves exactly as it did before this layer existed.
 * The signature is unchanged, which keeps every existing call site working.
 */
const cachedGet = async (
  endpoint: string,
  token?: string,
  options?: ApiGetOptions,
): Promise<any> => {
  const mode = options?.cache ?? 'default';
  const ttlMs = mode === 'no-store' ? null : getGetCacheTtl(endpoint);

  // Not cacheable (or explicitly opted out) → original behaviour.
  if (ttlMs == null) return sendAuthed('GET', endpoint, undefined, token);

  return fetchQuery(
    endpoint,
    async () => {
      const result = await sendAuthed('GET', endpoint, undefined, token);
      if (!isCacheableResponse(result)) {
        // Surface the failure to the caller without poisoning the cache.
        throw new ApiResponseNotCacheable(result);
      }
      return result;
    },
    { ttlMs, force: mode === 'reload' },
  ).catch((error) => {
    if (error instanceof ApiResponseNotCacheable) return error.payload;
    throw error;
  });
};

/** Carries a non-cacheable payload back to the caller unchanged. */
class ApiResponseNotCacheable extends Error {
  payload: any;
  constructor(payload: any) {
    super('response not cacheable');
    this.payload = payload;
  }
}

/** Run a mutation, then drop the caches it makes stale. */
const mutate = async (
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: object,
  token?: string,
): Promise<any> => {
  const result = await sendAuthed(method, endpoint, body, token);

  // Only invalidate when the write plausibly succeeded — a failed request must
  // not throw away cache the user can still read.
  if (result?.success !== false && result?.status !== 401) {
    const prefixes = getInvalidationPrefixes(method, endpoint);
    if (prefixes.length) void invalidateQueries(prefixes).catch(() => undefined);
  }

  return result;
};

export const api = {
  get: (endpoint: string, token?: string, options?: ApiGetOptions): Promise<any> =>
    cachedGet(endpoint, token, options),

  post: (endpoint: string, body: object, token?: string): Promise<any> =>
    mutate('POST', endpoint, body, token),

  put: (endpoint: string, body: object, token?: string): Promise<any> =>
    mutate('PUT', endpoint, body, token),

  patch: (endpoint: string, body?: object, token?: string): Promise<any> =>
    mutate('PATCH', endpoint, body, token),

  delete: (endpoint: string, body?: object, token?: string): Promise<any> =>
    mutate('DELETE', endpoint, body, token),

  //   delete: async (endpoint: string, token?: string): Promise<any> => {
  //   const headers: Record<string, string> = {
  //     'Content-Type': 'application/json',
  //   };

  //   if (!token) {
  //     try {
  //       token = await storage.getToken();
  //     } catch (error) {
  //       console.log('Error retrieving token:', error);
  //     }
  //   }

  //   if (token) {
  //     headers['Authorization'] = `Bearer ${token}`;
  //   }

  //   try {
  //     const url = `${BASE_URL}${endpoint}`;
  //     const response = await fetch(url, {
  //       method: 'DELETE',
  //       headers,
  //     });

  //     if (!response.ok) {
  //       return { success: false };
  //     }

  //     return { success: true };
  //   } catch (error) {
  //     console.log('Delete Error:', error);
  //     return { success: false };
  //   }
  // },

};

/**
 * DeviceService — the single home for all device & app-version logic.
 *
 * Everything about "what device/build is this" and "tell the backend about it"
 * lives here so the login flow, the API layer, and the profile screen never
 * grow their own copies. Future features (force update, optional update, device
 * analytics, crash reporting, session tracking, push-token association) hang off
 * this service and MUST NOT require touching the auth flow again — see the
 * "Future extension points" section at the bottom.
 *
 * Responsibilities:
 *   1. Report the app version from NATIVE metadata (single source of truth).
 *   2. Own the stable, logout-surviving device id.
 *   3. Collect device/platform/locale info.
 *   4. Register/refresh the device with the backend after authentication —
 *      best-effort, never blocking, self-retrying on the next auth event.
 *   5. Provide version/device HTTP headers to the central API client.
 *
 * Dependency note: this app currently ships `expo-constants` and (transitively)
 * `expo-application`, but NOT `expo-device` / `expo-localization`. So hardware
 * details come from React Native's `Platform.constants` (rich on Android) and
 * locale/timezone from the `Intl` API — no native rebuild required. Device
 * NAME (e.g. "Alex's iPhone") needs `expo-device`; that is a documented
 * follow-up and its absence leaves the field blank, never breaks anything.
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { storage } from '../utils/storage';
import { api, setAuthenticatedHandler, setDeviceHeaderProvider } from './api';

// ---------------------------------------------------------------------------
// Constants — mirror the backend's `platform` / `app_type` enums exactly.
// ---------------------------------------------------------------------------
const PLATFORM_BY_OS: Record<string, string> = {
  android: 'ANDROID',
  ios: 'IOS',
  web: 'WEB',
};
// This is the phone/tablet app. Tablet detection is a future refinement; the
// backend enum already has TABLET when we want it.
const APP_TYPE = 'MOBILE';

export interface DeviceInfo {
  device_id: string;
  platform: string;
  app_type: string;
  app_version: string;
  build_number: number;
  device_name: string;
  manufacturer: string;
  device_model: string;
  os_name: string;
  os_version: string;
  language: string;
  timezone: string;
}

// ---------------------------------------------------------------------------
// Module state (all private; the exported `deviceService` is the only surface).
// ---------------------------------------------------------------------------
let cachedDeviceId: string | null = null;
let initialized = false;
let registeredThisSession = false;
let registerInFlight: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Version — read from the installed native binary, never from a JS constant.
// ---------------------------------------------------------------------------
function getAppVersion(): string {
  // Application.nativeApplicationVersion is the real installed version (EAS
  // stamps it). expoConfig.version is the manifest fallback for dev/Expo Go.
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    ''
  );
}

function getBuildNumber(): number {
  const raw =
    Application.nativeBuildVersion ??
    (Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode);
  const parsed = parseInt(String(raw ?? ''), 10);
  // Backend requires build_number >= 1. In a real build the native value is
  // always present and >= 1; the floor only matters in dev/Expo Go where
  // registration is non-critical anyway.
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function getPlatform(): string {
  return PLATFORM_BY_OS[Platform.OS] ?? Platform.OS.toUpperCase();
}

// ---------------------------------------------------------------------------
// OS + hardware — from Platform.constants (no extra native module).
// On Android these carry manufacturer/model/OS release; iOS exposes far less
// without expo-device, so those fields degrade to blank/"Apple".
// ---------------------------------------------------------------------------
function getOsInfo(): { os_name: string; os_version: string } {
  const c = Platform.constants as any;
  if (Platform.OS === 'android') {
    return { os_name: 'Android', os_version: String(c?.Release ?? Platform.Version ?? '') };
  }
  if (Platform.OS === 'ios') {
    return { os_name: 'iOS', os_version: String(c?.osVersion ?? Platform.Version ?? '') };
  }
  return { os_name: Platform.OS, os_version: String(Platform.Version ?? '') };
}

function getHardwareInfo(): {
  manufacturer: string;
  device_model: string;
  device_name: string;
} {
  const c = Platform.constants as any;
  if (Platform.OS === 'android') {
    return {
      manufacturer: String(c?.Manufacturer ?? ''),
      device_model: String(c?.Model ?? ''),
      device_name: '', // needs expo-device (follow-up)
    };
  }
  if (Platform.OS === 'ios') {
    return { manufacturer: 'Apple', device_model: '', device_name: '' };
  }
  return { manufacturer: '', device_model: '', device_name: '' };
}

function getLocale(): { language: string; timezone: string } {
  let language = '';
  let timezone = '';
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    language = opts.locale || '';
    timezone = opts.timeZone || '';
  } catch {
    /* Intl unavailable — leave blank, both fields are optional server-side */
  }
  // Respect backend column caps (language<=10, timezone<=64).
  return { language: language.slice(0, 10), timezone: timezone.slice(0, 64) };
}

// ---------------------------------------------------------------------------
// Device id — created once, then stable for the life of the install.
// ---------------------------------------------------------------------------
function uuidv4(): string {
  // Not cryptographically strong, and it doesn't need to be — this is an opaque
  // stable identifier, not a secret. Matches the backend's accepted shape.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id: string | null = null;
  try {
    id = await storage.getDeviceId();
  } catch {
    id = null;
  }
  if (!id) {
    id = uuidv4();
    try {
      await storage.setDeviceId(id);
    } catch {
      /* if persistence fails we still return an id for this session */
    }
  }
  cachedDeviceId = id;
  return id;
}

async function getDeviceInfo(): Promise<DeviceInfo> {
  const device_id = await getDeviceId();
  const os = getOsInfo();
  const hw = getHardwareInfo();
  const loc = getLocale();
  return {
    device_id,
    platform: getPlatform(),
    app_type: APP_TYPE,
    app_version: getAppVersion(),
    build_number: getBuildNumber(),
    device_name: hw.device_name,
    manufacturer: hw.manufacturer,
    device_model: hw.device_model,
    os_name: os.os_name,
    os_version: os.os_version,
    language: loc.language,
    timezone: loc.timezone,
  };
}

/** Read-only summary for the profile screen (all synchronous). */
function getSummary(): {
  appVersion: string;
  buildNumber: number;
  platform: string;
  deviceName: string;
  osName: string;
  osVersion: string;
} {
  const os = getOsInfo();
  const hw = getHardwareInfo();
  return {
    appVersion: getAppVersion(),
    buildNumber: getBuildNumber(),
    platform: getPlatform(),
    deviceName: hw.device_name || hw.device_model || '',
    osName: os.os_name,
    osVersion: os.os_version,
  };
}

// ---------------------------------------------------------------------------
// HTTP headers — provided synchronously to the central API client. Version and
// platform are always available; device id appears once init() has loaded it.
// A throwing/empty provider must never break a request, so keep this trivial.
// ---------------------------------------------------------------------------
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-App-Version': getAppVersion(),
    'X-Build-Number': String(getBuildNumber()),
    'X-Platform': getPlatform(),
    'X-App-Type': APP_TYPE,
  };
  const os = getOsInfo();
  if (os.os_version) headers['X-OS-Version'] = os.os_version;
  if (cachedDeviceId) headers['X-Device-Id'] = cachedDeviceId;
  return headers;
}

// ---------------------------------------------------------------------------
// Backend registration — best-effort, never throws, never blocks login.
// The backend endpoint is an idempotent upsert, so calling it repeatedly is
// safe and cheap.
// ---------------------------------------------------------------------------
async function registerDevice(): Promise<void> {
  try {
    const info = await getDeviceInfo();
    const res = await api.post('/devices/register/', info);

    // The API client returns the backend JSON on success (no `status` on 2xx)
    // and an envelope with `status`/`success:false` on failure.
    const status: number | undefined = res?.status;
    const failed = res == null || res.success === false || status != null;

    if (!failed) {
      registeredThisSession = true;
      console.log('DeviceService: device registered', info.device_id);
    } else {
      // Includes 401/403 (not yet authenticated) and transient network errors.
      // We simply leave `registeredThisSession` false so the next successful
      // authentication retries. No throw, no crash.
      console.log(
        'DeviceService: registration not confirmed, will retry after next auth',
        status ?? res?.message,
      );
    }
  } catch (error) {
    console.log('DeviceService: registration error (non-blocking)', error);
  }
}

/**
 * Call after any successful authentication event.
 *   • 'login'   — always (re)assert the device for the freshly signed-in user.
 *   • 'startup' — a valid session was restored on launch; assert once.
 *   • 'refresh' — token was refreshed; only retry if a prior attempt hasn't
 *                 succeeded this session (this is the automatic retry path).
 * Never awaited by callers, never throws.
 */
async function onAuthenticated(
  trigger: 'login' | 'startup' | 'refresh' = 'login',
): Promise<void> {
  try {
    await init();
    if (trigger === 'refresh' && registeredThisSession) return;
    // Coalesce concurrent triggers into one in-flight registration.
    if (!registerInFlight) {
      registerInFlight = registerDevice().finally(() => {
        registerInFlight = null;
      });
    }
    await registerInFlight;
  } catch (error) {
    console.log('DeviceService: onAuthenticated error (non-blocking)', error);
  }
}

/** Reset per-session state on logout. The device id is deliberately kept. */
function reset(): void {
  registeredThisSession = false;
}

/**
 * One-time wiring: load the device id and register this service with the API
 * client (header provider + post-refresh retry hook). Idempotent and safe to
 * call from app startup before any login.
 */
async function init(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Register the IoC hooks first so headers are attached even to the very first
  // requests; device id fills in as soon as it loads just below.
  setDeviceHeaderProvider(getHeaders);
  setAuthenticatedHandler(() => {
    void onAuthenticated('refresh');
  });

  try {
    await getDeviceId();
  } catch (error) {
    console.log('DeviceService: init failed to load device id', error);
  }
}

export const deviceService = {
  init,
  onAuthenticated,
  registerDevice,
  reset,
  getDeviceId,
  getDeviceInfo,
  getSummary,
  getHeaders,
  // Individual reporters, handy for the login footer and future callers.
  getAppVersion,
  getBuildNumber,
  getPlatform,

  // ---- Future extension points (intentionally not implemented in Phase 3) ----
  // These belong HERE so no future feature needs to touch the auth flow again:
  //   • checkForUpdate()      -> GET /app/version/ + compare (force/optional UI)
  //   • associatePushToken()  -> link the Expo push token to this device row
  //   • trackSession()        -> heartbeat / last-active pings
  //   • reportCrashContext()  -> attach device info to crash reports
};

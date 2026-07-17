// App-level constants.
//
// The application VERSION deliberately does NOT live here anymore. A hand-typed
// version string drifts out of sync with the shipped binary (it did). The one
// source of truth is the native application metadata, read at runtime via
// DeviceService.getAppVersion(). Do not reintroduce a version constant here.
export const APP_CONFIG = {
  APP_NAME: 'Order Management',
};

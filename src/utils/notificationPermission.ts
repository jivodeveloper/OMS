import type { NotificationPromptState } from "./storage";

/**
 * Decision logic for our custom "explain first" notification-permission prompt
 * (shared rules, Task 3/5/6/7). Kept pure so it is trivially testable and the
 * screen just calls it with the current OS + stored state.
 */

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether to show OUR modal now.
 *
 * @param osStatus     Expo permission status ("granted" | "denied" | "undetermined").
 * @param canAskAgain  Whether the OS will still show its dialog (false on iOS once denied).
 * @param state        Our persisted prompt state.
 */
export const shouldShowPermissionPrompt = (
  osStatus: string,
  canAskAgain: boolean,
  state: NotificationPromptState,
): boolean => {
  // Task 6/7 — already granted (OS or our record): never show.
  if (osStatus === "granted" || state.status === "granted") return false;

  // Denied and the OS won't ask again (iOS): our modal can't help — the user
  // must re-enable from system Settings, so don't nag. (The Settings screen
  // surfaces the "Enable" path instead.)
  if (osStatus === "denied" && !canAskAgain) return false;

  // First time we've ever considered prompting → show.
  if (state.status === "never_asked") return true;

  // Previously dismissed / denied-but-can-ask → only after 7 days (Task 5).
  if (!state.lastPromptAt) return true;
  return Date.now() - state.lastPromptAt >= SEVEN_DAYS_MS;
};

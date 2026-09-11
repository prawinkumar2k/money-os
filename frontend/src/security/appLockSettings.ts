const ENABLED_KEY = "moneyos.appLock.enabled";
const TIMEOUT_KEY = "moneyos.appLock.timeoutMinutes";

export const TIMEOUT_OPTIONS_MINUTES = [0, 1, 5, 15, 30] as const; // 0 = lock immediately on every resume

export function isAppLockEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setAppLockEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch {
    // best-effort
  }
}

export function getAppLockTimeoutMinutes(): number {
  try {
    const stored = localStorage.getItem(TIMEOUT_KEY);
    const parsed = stored ? Number(stored) : 1;
    return Number.isFinite(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
}

export function setAppLockTimeoutMinutes(minutes: number): void {
  try {
    localStorage.setItem(TIMEOUT_KEY, String(minutes));
  } catch {
    // best-effort
  }
}

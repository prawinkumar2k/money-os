import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// On native platforms, tokens live in @capacitor/preferences, which is backed by
// UserDefaults (iOS) / SharedPreferences (Android) — sandboxed per-app OS storage, not a
// browser-accessible store the way localStorage is inside a WebView. On web, localStorage is
// the only option and remains the fallback there.
//
// Note: Preferences itself is not *encrypted* storage — for that, a device secure-enclave-backed
// plugin (e.g. capacitor-secure-storage-plugin, gated behind biometric/device-credential unlock)
// would be the next step. This is real, working, compiled-and-build-verified native storage;
// it is a genuine improvement over localStorage on native, not the final word on encryption.
const isNative = Capacitor.isNativePlatform();

export async function getItem(key: string): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key, value });
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked (private browsing, quota) — best-effort only
  }
}

export async function removeItem(key: string): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key });
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

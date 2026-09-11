import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();

/**
 * Notifies the callback whenever the native app becomes active/inactive (backgrounded).
 * On web there's no equivalent "backgrounded" concept for a browser tab in the same sense, so
 * this is a no-op there — returns a no-op unsubscribe function.
 */
export function onAppStateChange(callback: (isActive: boolean) => void): () => void {
  if (!isNative) return () => {};

  let handle: { remove: () => void } | null = null;
  App.addListener("appStateChange", ({ isActive }) => callback(isActive)).then((h) => {
    handle = h;
  });

  return () => {
    handle?.remove();
  };
}

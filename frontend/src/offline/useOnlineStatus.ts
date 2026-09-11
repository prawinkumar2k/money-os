import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

const isNative = Capacitor.isNativePlatform();

// Deliberately not status.connected: Capacitor's Android implementation defines `connected` as
// NET_CAPABILITY_VALIDATED && NET_CAPABILITY_INTERNET — it requires the OS to have successfully
// reached a generic external connectivity-check endpoint (e.g. Google's), not just "is there a
// working network". That makes it a false negative for a legitimate case: a device connected to
// a network that can reach this app's own API but not the wider internet (a captive portal, a
// restrictive corporate/firewalled network, a LAN-only backend deployment) — real testing on an
// emulator surfaced exactly this: login/API calls succeeded while `connected` stayed false and
// the app wrongly showed "you're offline". `connectionType` is set independently of validation
// (`"none"` only when there is truly no active network interface at all), which matches the same
// interface-presence semantics `navigator.onLine` already uses on web below — so this keeps
// native and web consistent, and lets an actual failed API call (not a generic OS ping) be what
// ultimately decides "really offline" for a write.
function isNativelyOnline(status: { connected: boolean; connectionType: string }): boolean {
  return status.connectionType !== "none";
}

/**
 * On native platforms, WebView `navigator.onLine`/online/offline events are known to be
 * unreliable (they often reflect whether the WebView has ever loaded, not live connectivity),
 * so this uses `@capacitor/network`'s real OS-level connectivity API instead. Web keeps using
 * the standard browser events, since there is no native layer to query there.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (isNative) {
      let handle: { remove: () => void } | null = null;
      let cancelled = false;

      Network.getStatus().then((status) => {
        if (!cancelled) setOnline(isNativelyOnline(status));
      });
      Network.addListener("networkStatusChange", (status) => {
        setOnline(isNativelyOnline(status));
      }).then((h) => {
        if (cancelled) h.remove();
        else handle = h;
      });

      return () => {
        cancelled = true;
        handle?.remove();
      };
    }

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}

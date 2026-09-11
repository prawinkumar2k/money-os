import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";

// Biometric authentication is only meaningful on a real device with real biometric hardware —
// there is no honest way to "simulate" Face ID/Touch ID/fingerprint in a browser, and a fake web
// implementation would be exactly the "insecure custom biometric storage" the spec forbids. On
// web this reports unavailable; the app must fall back to whatever session auth it already has
// (the JWT flow), not pretend a biometric check happened.
const isNative = Capacitor.isNativePlatform();

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/** Resolves if the user authenticates; rejects (throws) on failure/cancellation — never resolves silently on failure. */
export async function verifyBiometric(reason: string): Promise<void> {
  if (!isNative) throw new Error("Biometric authentication is not available on the web");
  await NativeBiometric.verifyIdentity({
    reason,
    title: "Unlock Money OS",
    subtitle: reason,
    useFallback: true, // allow device PIN/passcode as a fallback, per the spec's "PIN fallback" requirement
  });
}

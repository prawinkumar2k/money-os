import { ReactNode, useEffect, useRef, useState } from "react";
import { isBiometricAvailable, verifyBiometric } from "../native/biometrics";
import { onAppStateChange } from "../native/appLifecycle";
import { getAppLockTimeoutMinutes, isAppLockEnabled } from "./appLockSettings";

/**
 * Gates the app behind a biometric check after it's been backgrounded past the configured
 * timeout. Only ever activates when running natively AND the device actually reports biometric
 * hardware is available — there is no web fallback that pretends to be biometric security (a
 * bare password re-prompt would be a different, legitimate feature, not implemented here to
 * avoid half-building something that isn't the real "biometric app lock" this component claims
 * to be). On web, or on a device without biometrics, this is fully transparent — the JWT session
 * flow (see AuthContext) is the only gate, exactly as before this component existed.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = onAppStateChange(async (isActive) => {
      if (!isActive) {
        backgroundedAtRef.current = Date.now();
        return;
      }

      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (backgroundedAt === null) return; // initial "became active" on cold start — nothing to check against

      if (!isAppLockEnabled()) return;
      const elapsedMinutes = (Date.now() - backgroundedAt) / 60000;
      if (elapsedMinutes < getAppLockTimeoutMinutes()) return;

      if (await isBiometricAvailable()) {
        setLocked(true);
      }
      // Device has no biometric hardware: intentionally does not lock — see the note above.
    });

    return unsubscribe;
  }, []);

  async function handleUnlock() {
    setVerifying(true);
    setError(null);
    try {
      await verifyBiometric("Unlock Money OS to continue");
      setLocked(false);
    } catch {
      setError("Authentication failed or was cancelled. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  if (!locked) return <>{children}</>;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--color-bg)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div className="card" style={{ width: 320, textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Money OS is locked</h1>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Unlock with your fingerprint, face, or device passcode.</p>
        {error && <p style={{ color: "var(--color-danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button className="btn" onClick={handleUnlock} disabled={verifying}>
          {verifying ? "Verifying..." : "Unlock"}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { deleteAllData, downloadBackup, restoreBackup } from "../api/backup";
import { ThemePreference, applyTheme, getStoredTheme } from "../theme";
import { isBiometricAvailable } from "../native/biometrics";
import { isNative } from "../local/db";
import {
  TIMEOUT_OPTIONS_MINUTES,
  getAppLockTimeoutMinutes,
  isAppLockEnabled,
  setAppLockEnabled,
  setAppLockTimeoutMinutes,
} from "../security/appLockSettings";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function SettingsPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [theme, setTheme] = useState<ThemePreference>(getStoredTheme());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [appLockEnabled, setAppLockEnabledState] = useState(isAppLockEnabled());
  const [appLockTimeout, setAppLockTimeoutState] = useState(getAppLockTimeoutMinutes());
  const [backupPassword, setBackupPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  function handleThemeChange(next: ThemePreference) {
    setTheme(next);
    applyTheme(next);
  }

  function handleAppLockToggle(enabled: boolean) {
    setAppLockEnabledState(enabled);
    setAppLockEnabled(enabled);
  }

  function handleAppLockTimeoutChange(minutes: number) {
    setAppLockTimeoutState(minutes);
    setAppLockTimeoutMinutes(minutes);
  }

  async function handleBackup() {
    if (isNative && backupPassword.length < 8) {
      setError("Enter a backup password (at least 8 characters) first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await downloadBackup(isNative ? backupPassword : undefined);
      setMessage(isNative ? "Encrypted backup shared. Remember this password — it's the only way to restore this file." : "Backup downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isNative) {
      // Native backups are encrypted — hold the file until a password is entered, rather than
      // restoring immediately as the (unencrypted, backend-exported) web path does below.
      setPendingRestoreFile(file);
      setError(null);
      setMessage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const result = await restoreBackup(backup);
      const total = Object.values(result.restoredCounts).reduce((a, b) => a + b, 0);
      setMessage(`Restored ${total} records from backup.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed — is this a valid Money OS backup file?");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRestoreWithPassword() {
    if (!pendingRestoreFile) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await pendingRestoreFile.text();
      const backup = JSON.parse(text);
      const result = await restoreBackup(backup, restorePassword);
      const total = Object.values(result.restoredCounts).reduce((a, b) => a + b, 0);
      setMessage(`Restored ${total} records from backup.`);
      setPendingRestoreFile(null);
      setRestorePassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed — is this a valid Money OS backup file?");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll() {
    if (confirmText !== "DELETE ALL MY DATA") return;
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
      setMessage("All financial data has been deleted.");
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Account</h2>
        <div className="text-muted" style={{ fontSize: 14 }}>{user?.name} · {user?.email}</div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Appearance</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={theme === opt.value ? "btn" : "btn btn-secondary"}
              onClick={() => handleThemeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>App lock</h2>
        {biometricAvailable ? (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={appLockEnabled} onChange={(e) => handleAppLockToggle(e.target.checked)} />
              Require fingerprint / Face ID / device passcode after the app has been in the background
            </label>
            {appLockEnabled && (
              <div style={{ marginTop: 10 }}>
                <label className="text-muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  Lock after
                </label>
                <select className="input" style={{ width: 200 }} value={appLockTimeout} onChange={(e) => handleAppLockTimeoutChange(Number(e.target.value))}>
                  {TIMEOUT_OPTIONS_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Immediately" : `${m} minute${m === 1 ? "" : "s"}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted" style={{ fontSize: 13 }}>
            No biometric hardware detected. This app never falls back to a fake "biometric" check — on
            the web or a device without fingerprint/Face ID support, your session (auto-expiring login
            token) is the only lock, exactly as it already is.
          </p>
        )}
      </div>

      {message && <p style={{ color: "var(--color-success)" }}>{message}</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Backup & restore</h2>
        {isNative ? (
          <p className="text-muted" style={{ fontSize: 13 }}>
            Your data lives only on this device. Download an AES-256 encrypted snapshot — protected
            by a password only you know, not stored anywhere — and keep it somewhere safe (a second
            device, cloud storage). It's the only way to recover your data if this device is lost,
            reset, or the app is reinstalled.
          </p>
        ) : (
          <p className="text-muted" style={{ fontSize: 13 }}>
            Download an encrypted-in-transit (HTTPS) JSON snapshot of all your data, or restore from a
            previous backup. Restoring never touches other users' data — everything is re-imported as
            new records under your account.
          </p>
        )}

        {isNative && (
          <input
            className="input"
            type="password"
            placeholder="Backup password (min. 8 characters)"
            value={backupPassword}
            onChange={(e) => setBackupPassword(e.target.value)}
            style={{ marginBottom: 8, maxWidth: 320 }}
          />
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={handleBackup} disabled={busy}>
            {isNative ? "Download encrypted backup" : "Download backup"}
          </button>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
            Restore from file
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleRestoreFile} style={{ display: "none" }} />
          </label>
        </div>

        {isNative && pendingRestoreFile && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Restoring: {pendingRestoreFile.name} — this replaces all current data.
            </span>
            <input
              className="input"
              type="password"
              placeholder="Backup password"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <button className="btn" onClick={handleRestoreWithPassword} disabled={busy || !restorePassword}>
              Restore
            </button>
            <button className="btn btn-secondary" onClick={() => setPendingRestoreFile(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ borderColor: "var(--color-danger)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16, color: "var(--color-danger)" }}>Danger zone</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Permanently deletes all accounts, transactions, budgets, goals, bills, subscriptions, credit
          cards, loans, and investments. This cannot be undone — back up first if you're not sure.
        </p>
        <p style={{ fontSize: 13 }}>
          Type <strong>DELETE ALL MY DATA</strong> to confirm:
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE ALL MY DATA" />
          <button
            className="btn"
            style={{ background: "var(--color-danger)" }}
            onClick={handleDeleteAll}
            disabled={busy || confirmText !== "DELETE ALL MY DATA"}
          >
            Delete everything
          </button>
        </div>
      </div>
    </div>
  );
}

import { apiFetch, getAccessToken } from "./client";
import { saveAndShareFile } from "../native/fileExport";
import { isNative } from "../local/db";
import { deleteAllDataLocal, exportEncryptedBackupLocal, importEncryptedBackupLocal, isEncryptedBackupFile } from "../local/backup";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

/**
 * On native, `passphrase` is required — the local backup is AES-256-GCM encrypted with it (see
 * local/backup.ts). On web (backend-backed), it's ignored: the backend's own /backup endpoint
 * already returns a plain JSON export over an authenticated HTTPS connection.
 */
export async function downloadBackup(passphrase?: string): Promise<void> {
  const filename = `money-os-backup-${new Date().toISOString().slice(0, 10)}.json`;

  if (isNative) {
    if (!passphrase) throw new Error("A backup password is required");
    const blob = await exportEncryptedBackupLocal(passphrase);
    if (await saveAndShareFile(blob, filename)) return;
    throw new Error("Sharing the backup file failed");
  }

  const token = getAccessToken();
  const res = await fetch(`${API_URL}/backup`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Backup failed");
  const blob = await res.blob();

  if (await saveAndShareFile(blob, filename)) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(backup: unknown, passphrase?: string): Promise<{ restoredCounts: Record<string, number> }> {
  if (isNative) {
    if (!isEncryptedBackupFile(backup)) throw new Error("This doesn't look like a Money OS backup file");
    if (!passphrase) throw new Error("A backup password is required");
    return importEncryptedBackupLocal(backup, passphrase);
  }
  return apiFetch("/backup/restore", { method: "POST", body: JSON.stringify({ backup }) });
}

export async function deleteAllData(): Promise<void> {
  if (isNative) return deleteAllDataLocal();
  await apiFetch("/backup/delete-all", { method: "POST", body: JSON.stringify({ confirmation: "DELETE ALL MY DATA" }) });
}

import { apiFetch, getAccessToken } from "./client";
import { saveAndShareFile } from "../native/fileExport";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export async function downloadBackup(): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/backup`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("Backup failed");
  const blob = await res.blob();
  const filename = `money-os-backup-${new Date().toISOString().slice(0, 10)}.json`;

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

export async function restoreBackup(backup: unknown): Promise<{ restoredCounts: Record<string, number> }> {
  return apiFetch("/backup/restore", { method: "POST", body: JSON.stringify({ backup }) });
}

export async function deleteAllData(): Promise<void> {
  await apiFetch("/backup/delete-all", { method: "POST", body: JSON.stringify({ confirmation: "DELETE ALL MY DATA" }) });
}

import { apiFetch, getAccessToken } from "./client";
import { saveAndShareFile } from "../native/fileExport";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export interface ImportPreviewRow {
  rowNumber: number;
  date: string | null;
  description: string;
  merchant: string | null;
  amount: number | null;
  errors: string[];
  suggestedCategory: string | null;
  isDuplicate: boolean;
}

export interface ImportPreview {
  filename: string;
  accountId: string;
  rowsTotal: number;
  rowsWithErrors: number;
  rowsDuplicate: number;
  rows: ImportPreviewRow[];
}

export async function previewImport(accountId: string, file: File): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("accountId", accountId);
  formData.append("file", file);

  const token = getAccessToken();
  const res = await fetch(`${API_URL}/import/preview`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Import preview failed");
  return body;
}

export async function confirmImport(
  accountId: string,
  filename: string,
  rows: ImportPreviewRow[],
  totals: { rowsTotal: number; rowsSkippedError: number; rowsSkippedDuplicate: number }
): Promise<void> {
  await apiFetch("/import/confirm", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      filename,
      ...totals,
      transactions: rows.map((r) => ({
        date: r.date,
        description: r.description,
        merchant: r.merchant,
        amount: r.amount,
        category: r.suggestedCategory,
      })),
    }),
  });
}

// A plain <a href> can't carry an Authorization header, and tokens don't belong in URLs (they'd
// leak via browser history / server access logs), so the export is fetched with the header and
// handed to the browser as a blob download instead.
export async function downloadExport(format: "csv" | "xlsx"): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/export/transactions?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Export failed");

  const blob = await res.blob();
  const filename = `transactions-export.${format}`;

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

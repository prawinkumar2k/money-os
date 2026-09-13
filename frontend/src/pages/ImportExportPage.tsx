import { useEffect, useState } from "react";
import { Account, listAccounts } from "../api/accounts";
import { ImportPreview, confirmImport, downloadExport, previewImport } from "../api/importExport";
import { isNative } from "../local/db";

export function ImportExportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    listAccounts().then((a) => {
      setAccounts(a);
      if (a.length > 0) setAccountId(a[0]._id);
    });
  }, []);

  async function handlePreview() {
    if (!file || !accountId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await previewImport(accountId, file);
      setPreview(result);
      setExcludedRows(new Set(result.rows.filter((r) => r.errors.length > 0 || r.isDuplicate).map((r) => r.rowNumber)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(rowNumber: number) {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  async function handleConfirm() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const rowsToImport = preview.rows.filter((r) => r.errors.length === 0 && !excludedRows.has(r.rowNumber));
      await confirmImport(preview.accountId, preview.filename, rowsToImport, {
        rowsTotal: preview.rowsTotal,
        rowsSkippedError: preview.rowsWithErrors,
        rowsSkippedDuplicate: preview.rows.filter((r) => r.isDuplicate && excludedRows.has(r.rowNumber)).length,
      });
      setSuccess(`Imported ${rowsToImport.length} transactions.`);
      setPreview(null);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(format: "csv" | "xlsx") {
    setExporting(true);
    setError(null);
    try {
      await downloadExport(format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 style={{ margin: 0 }}>Import & Export</h1>

      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}
      {success && <p style={{ color: "var(--color-success)" }}>{success}</p>}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Import transactions from CSV{isNative ? "" : " or PDF"}</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          CSV works with common column names (Date, Description/Narration, Amount or separate
          Debit/Credit columns), fully offline — no backend connection needed.
          {isNative
            ? " PDF statement import isn't available in the app yet (the generic PDF parser needs a Node runtime this app doesn't have) — export your statement as CSV instead."
            : " PDF support is a generic line-based parser (date at the start of a line, amount with a Dr/Cr marker at the end) — it is not bank-specific, won't handle every statement layout, and never guesses: any line it can't confidently read is flagged for you to review before anything is saved. Scanned/image-only PDFs aren't supported (no text to read)."}
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select className="input" style={{ width: 200 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>{a.name}</option>
            ))}
          </select>
          <input
            type="file"
            accept={isNative ? ".csv,text/csv" : ".csv,text/csv,.pdf,application/pdf"}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button className="btn" onClick={handlePreview} disabled={!file || loading}>
            {loading ? "Working..." : "Preview"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>
            Preview — {preview.rowsTotal} rows, {preview.rowsWithErrors} with errors, {preview.rowsDuplicate} possible duplicates
          </h2>
          <p className="text-muted" style={{ fontSize: 13 }}>
            Rows with errors or flagged as duplicates are unchecked by default. Nothing is saved until you confirm.
          </p>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr className="text-muted">
                  <th></th>
                  <th style={{ textAlign: "left" }}>Date</th>
                  <th style={{ textAlign: "left" }}>Description</th>
                  <th style={{ textAlign: "left" }}>Category</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "left" }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowNumber} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={r.errors.length > 0}
                        checked={!excludedRows.has(r.rowNumber)}
                        onChange={() => toggleRow(r.rowNumber)}
                      />
                    </td>
                    <td>{r.date ? new Date(r.date).toLocaleDateString() : "—"}</td>
                    <td>{r.description}</td>
                    <td className="text-muted">{r.suggestedCategory ?? "Uncategorized"}</td>
                    <td style={{ textAlign: "right" }}>{r.amount ?? "—"}</td>
                    <td>
                      {r.errors.length > 0 && <span className="badge" style={{ background: "var(--color-danger)" }}>{r.errors[0]}</span>}
                      {r.isDuplicate && <span className="badge" style={{ marginLeft: 4 }}>possible duplicate</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={handleConfirm} disabled={loading}>
            {loading ? "Importing..." : "Confirm import"}
          </button>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Export transactions</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => handleExport("csv")} disabled={exporting}>
            Download CSV
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport("xlsx")} disabled={exporting || isNative} title={isNative ? "Excel export isn't available offline yet — use CSV" : undefined}>
            Download Excel{isNative ? " (needs backend)" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

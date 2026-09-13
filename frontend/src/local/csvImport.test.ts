import { describe, expect, it, vi } from "vitest";

const mockRows: Record<string, unknown[]> = {};
let ranStatements: Array<{ sql: string; params: unknown[] }> = [];

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("FROM accounts WHERE id")) return { values: [{ id: params[0] }] };
        if (sql.includes('FROM "transactions" WHERE deletedAt IS NULL AND accountId')) return { values: mockRows.existing ?? [] };
        return { values: [] };
      }),
      run: vi.fn(async (sql: string, params: unknown[] = []) => {
        ranStatements.push({ sql, params });
        return { changes: { changes: 1 } };
      }),
    }),
  };
});

import { previewImportLocal, confirmImportLocal } from "./csvImport";

function makeFile(content: string, name = "statement.csv", type = "text/csv"): File {
  const file = new File([content], name, { type });
  // jsdom's File.text() is unreliable across its own internal Blob wrapping in this test
  // environment (fails intermittently with "file.text is not a function") — overriding it
  // directly is more robust than depending on that polyfill for a test that isn't about jsdom's
  // Blob implementation in the first place.
  Object.defineProperty(file, "text", { value: async () => content });
  return file;
}

describe("previewImportLocal (client-side CSV parser)", () => {
  it("parses a plain CSV with Date/Description/Amount columns", async () => {
    const csv = "Date,Description,Amount\n2026-01-05,Coffee shop,-150.50\n2026-01-06,Salary,50000\n";
    const preview = await previewImportLocal("acc-1", makeFile(csv));

    expect(preview.rowsTotal).toBe(2);
    expect(preview.rowsWithErrors).toBe(0);
    expect(preview.rows[0]).toMatchObject({ description: "Coffee shop", amount: -150.5 });
    expect(preview.rows[1]).toMatchObject({ description: "Salary", amount: 50000 });
  });

  it("handles quoted fields containing commas", async () => {
    const csv = 'Date,Description,Amount\n2026-01-05,"Store, Inc.",-200\n';
    const preview = await previewImportLocal("acc-1", makeFile(csv));
    expect(preview.rows[0].description).toBe("Store, Inc.");
    expect(preview.rows[0].amount).toBe(-200);
  });

  it("maps separate Debit/Credit columns to a signed amount", async () => {
    const csv = "Date,Narration,Debit,Credit\n2026-01-05,ATM Withdrawal,500,\n2026-01-06,Refund,,300\n";
    const preview = await previewImportLocal("acc-1", makeFile(csv));
    expect(preview.rows[0].amount).toBe(-500);
    expect(preview.rows[1].amount).toBe(300);
  });

  it("flags rows with no recognizable amount or date instead of guessing", async () => {
    const csv = "Foo,Bar\nx,y\n";
    const preview = await previewImportLocal("acc-1", makeFile(csv));
    expect(preview.rowsWithErrors).toBe(1);
    expect(preview.rows[0].errors.length).toBeGreaterThan(0);
  });

  it("rejects a PDF file with an honest message instead of attempting to parse it", async () => {
    const pdfFile = makeFile("%PDF-1.4", "statement.pdf", "application/pdf");
    await expect(previewImportLocal("acc-1", pdfFile)).rejects.toThrow(/PDF statement import isn't available offline/);
  });

  it("flags a row as a duplicate when a matching transaction already exists", async () => {
    mockRows.existing = [{ date: "2026-01-05T00:00:00.000Z", amount: -150.5, description: "Coffee shop" }];
    const csv = "Date,Description,Amount\n2026-01-05,Coffee shop,-150.50\n";
    const preview = await previewImportLocal("acc-1", makeFile(csv));
    expect(preview.rows[0].isDuplicate).toBe(true);
    mockRows.existing = [];
  });
});

describe("confirmImportLocal", () => {
  it("inserts only rows with a valid date and amount, skipping error rows", async () => {
    ranStatements = [];
    await confirmImportLocal("acc-1", [
      { rowNumber: 2, date: "2026-01-05T00:00:00.000Z", description: "Coffee", merchant: null, amount: -150, errors: [], suggestedCategory: "Food", isDuplicate: false },
      { rowNumber: 3, date: null, description: "Bad row", merchant: null, amount: null, errors: ["no date"], suggestedCategory: null, isDuplicate: false },
    ]);
    const inserts = ranStatements.filter((s) => s.sql.includes("INSERT INTO"));
    expect(inserts.length).toBe(1);
  });
});

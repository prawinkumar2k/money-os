import { describe, expect, it, vi } from "vitest";

let tables: Record<string, Record<string, unknown>[]> = {
  accounts: [{ id: "acc-1", name: "Checking", institution: "Test Bank", type: "savings", balance: 5000, currency: "INR" }],
  transactions: [{ id: "txn-1", accountId: "acc-1", amount: -150, description: "Coffee", type: "expense" }],
  categories: [],
  budgets: [],
  goals: [],
  goal_contributions: [],
  bills: [],
  credit_cards: [],
  loans: [{ id: "loan-1", name: "Test", principal: 100000, interestRate: 12, tenureMonths: 12, emi: 8884.88, remainingPrincipal: 92115.12 }],
  loan_payments: [],
  investments: [],
  investment_transactions: [],
  subscriptions: [],
  net_worth_snapshots: [],
};

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({
      query: vi.fn(async (sql: string) => {
        const match = /FROM "(\w+)"/.exec(sql);
        const table = match ? match[1] : null;
        return { values: table ? tables[table] ?? [] : [] };
      }),
      run: vi.fn(async (sql: string, params: unknown[] = []) => {
        const match = /(?:DELETE FROM|INSERT INTO) "(\w+)"/.exec(sql);
        const table = match ? match[1] : null;
        if (!table) return { changes: { changes: 0 } };
        if (sql.startsWith("DELETE")) {
          tables[table] = [];
        } else if (sql.startsWith("INSERT")) {
          const colsMatch = /\(([^)]+)\)\s+VALUES/.exec(sql);
          const cols = colsMatch![1].split(",").map((c) => c.trim().replace(/"/g, ""));
          const row: Record<string, unknown> = {};
          cols.forEach((c, i) => (row[c] = params[i]));
          tables[table].push(row);
        }
        return { changes: { changes: 1 } };
      }),
    }),
  };
});

import { exportEncryptedBackupLocal, importEncryptedBackupLocal, isEncryptedBackupFile, deleteAllDataLocal } from "./backup";

async function blobToJson(blob: Blob) {
  // blob.text() is unreliable in this jsdom version, and Node's Response() doesn't recognize
  // jsdom's own Blob class — FileReader is jsdom's own API for reading its own Blobs, so it's
  // the one thing guaranteed to work here.
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  return JSON.parse(text);
}

describe("encrypted local backup", () => {
  it("produces ciphertext that is not readable as plaintext JSON of the financial data", async () => {
    const blob = await exportEncryptedBackupLocal("correct-horse-battery-staple");
    const file = await blobToJson(blob);

    expect(isEncryptedBackupFile(file)).toBe(true);
    expect(typeof file.ciphertext).toBe("string");
    // The raw account name / loan figures must not appear anywhere in the serialized file.
    const rawFileText = JSON.stringify(file);
    expect(rawFileText).not.toContain("Checking");
    expect(rawFileText).not.toContain("92115.12");
    expect(rawFileText).not.toContain("Coffee");
  });

  it("round-trips correctly: export, wipe, restore with the right password recovers all data", async () => {
    const blob = await exportEncryptedBackupLocal("correct-horse-battery-staple");
    const file = await blobToJson(blob);

    const before = JSON.stringify(tables);
    await deleteAllDataLocal();
    expect(tables.accounts).toEqual([]);
    expect(tables.loans).toEqual([]);

    const result = await importEncryptedBackupLocal(file, "correct-horse-battery-staple");
    expect(result.restoredCounts.accounts).toBe(1);
    expect(result.restoredCounts.loans).toBe(1);
    expect(tables.accounts[0].name).toBe("Checking");
    expect(tables.loans[0].remainingPrincipal).toBe(92115.12);
    expect(JSON.stringify(tables)).toBe(before);
  });

  it("rejects an incorrect password safely, without touching existing data", async () => {
    const blob = await exportEncryptedBackupLocal("correct-horse-battery-staple");
    const file = await blobToJson(blob);
    const snapshotBefore = JSON.stringify(tables);

    await expect(importEncryptedBackupLocal(file, "wrong-password")).rejects.toThrow(/Wrong backup password/);
    expect(JSON.stringify(tables)).toBe(snapshotBefore); // untouched — failure happened before any DELETE ran
  });

  it("rejects a corrupted/tampered backup file safely", async () => {
    const blob = await exportEncryptedBackupLocal("correct-horse-battery-staple");
    const file = await blobToJson(blob);
    file.ciphertext = file.ciphertext.slice(0, -4) + "AAAA"; // flip the tail — breaks the GCM auth tag

    const snapshotBefore = JSON.stringify(tables);
    await expect(importEncryptedBackupLocal(file, "correct-horse-battery-staple")).rejects.toThrow();
    expect(JSON.stringify(tables)).toBe(snapshotBefore);
  });

  it("rejects a passphrase shorter than 8 characters at export time", async () => {
    await expect(exportEncryptedBackupLocal("short")).rejects.toThrow(/at least 8 characters/);
  });

  it("does not recognize a plain unrelated JSON file as a valid backup", () => {
    expect(isEncryptedBackupFile({ hello: "world" })).toBe(false);
    expect(isEncryptedBackupFile(null)).toBe(false);
  });
});

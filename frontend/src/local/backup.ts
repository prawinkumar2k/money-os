import { getDb } from "./db";

// Every table except local_auth (device-specific passcode hash — restoring on a different device
// should mean setting a fresh local passcode there, never inheriting another device's hash) and
// meta (internal bookkeeping, nothing a restore needs).
const BACKUP_TABLES = [
  "categories",
  "accounts",
  "transactions",
  "budgets",
  "goals",
  "goal_contributions",
  "bills",
  "credit_cards",
  "loans",
  "loan_payments",
  "investments",
  "investment_transactions",
  "subscriptions",
  "net_worth_snapshots",
] as const;

const BACKUP_FORMAT = "money-os-local-backup";
const BACKUP_VERSION = 1;

interface EncryptedBackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  salt: string; // hex
  iv: string; // hex
  ciphertext: string; // base64
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(bytes).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 210_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * A full snapshot of every locally-stored financial record, AES-256-GCM encrypted with a
 * passphrase the user supplies at export time (never the app-lock passcode — a leaked backup
 * file shouldn't also expose the passcode that unlocks the live app). This is the only way data
 * survives a reinstall or a lost/replaced device, since the primary store is on-device SQLite,
 * not a server. The output is a plain JSON file (safe to move via the existing native
 * share/filesystem path) whose ciphertext is opaque without the passphrase.
 */
export async function exportEncryptedBackupLocal(passphrase: string): Promise<Blob> {
  if (passphrase.length < 8) throw new Error("Backup password must be at least 8 characters");

  const db = await getDb();
  const snapshot: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const res = await db.query(`SELECT * FROM "${table}" WHERE 1=1`);
    snapshot[table] = res.values ?? [];
  }

  const plaintext = new TextEncoder().encode(JSON.stringify({ tables: snapshot, exportedAt: new Date().toISOString() }));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext);

  const file: EncryptedBackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    salt: toHex(salt),
    iv: toHex(iv),
    ciphertext: toBase64(ciphertext),
  };

  return new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
}

export function isEncryptedBackupFile(parsed: unknown): parsed is EncryptedBackupFile {
  return (
    !!parsed &&
    typeof parsed === "object" &&
    (parsed as EncryptedBackupFile).format === BACKUP_FORMAT &&
    typeof (parsed as EncryptedBackupFile).salt === "string" &&
    typeof (parsed as EncryptedBackupFile).iv === "string" &&
    typeof (parsed as EncryptedBackupFile).ciphertext === "string"
  );
}

/**
 * Decrypts and applies a backup, replacing all current local data with the backup's contents
 * (matching the backend's "restore" semantics — see backup.controller.ts). Wrong passphrase
 * fails loudly (AES-GCM's authentication tag rejects tampered/wrong-key ciphertext) rather than
 * silently producing garbage data.
 */
export async function importEncryptedBackupLocal(file: EncryptedBackupFile, passphrase: string): Promise<{ restoredCounts: Record<string, number> }> {
  const salt = fromHex(file.salt);
  const iv = fromHex(file.iv);
  const key = await deriveKey(passphrase, salt);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, fromBase64(file.ciphertext) as BufferSource);
  } catch {
    throw new Error("Wrong backup password, or this file is corrupted");
  }

  const { tables } = JSON.parse(new TextDecoder().decode(plaintext)) as { tables: Record<string, Record<string, unknown>[]> };

  const db = await getDb();
  const restoredCounts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const rows = tables[table] ?? [];
    await db.run(`DELETE FROM "${table}"`);
    for (const row of rows) {
      const columns = Object.keys(row);
      const placeholders = columns.map(() => "?").join(", ");
      await db.run(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
        columns.map((c) => row[c])
      );
    }
    restoredCounts[table] = rows.length;
  }

  return { restoredCounts };
}

export async function deleteAllDataLocal(): Promise<void> {
  const db = await getDb();
  for (const table of BACKUP_TABLES) {
    await db.run(`DELETE FROM "${table}"`);
  }
}

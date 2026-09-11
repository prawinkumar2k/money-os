import { getDb, nowIso } from "./db";

/**
 * A local passcode gate, independent of the backend entirely — this is what lets the app be
 * opened and used with the backend completely unreachable (PC off, no network). Not a JWT
 * session, not a password the backend knows about: a PBKDF2 hash stored only in the on-device
 * encrypted SQLite database. Layers with the existing biometric AppLockGate (see
 * security/AppLockGate.tsx) rather than replacing it — biometrics unlock the session, this
 * passcode is the fallback/first-time setup that doesn't depend on device biometric hardware.
 */

async function pbkdf2Hash(passcode: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSaltHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isLocalAuthConfigured(): Promise<boolean> {
  const db = await getDb();
  const res = await db.query("SELECT id FROM local_auth WHERE id = 1");
  return (res.values?.length ?? 0) > 0;
}

export async function setLocalPasscode(passcode: string): Promise<void> {
  if (passcode.length < 4) throw new Error("Passcode must be at least 4 characters");
  const db = await getDb();
  const salt = randomSaltHex();
  const hash = await pbkdf2Hash(passcode, salt);
  await db.run(
    "INSERT INTO local_auth (id, passcodeHash, salt, createdAt) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET passcodeHash = excluded.passcodeHash, salt = excluded.salt",
    [hash, salt, nowIso()]
  );
}

export async function verifyLocalPasscode(passcode: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query("SELECT passcodeHash, salt FROM local_auth WHERE id = 1");
  const row = res.values?.[0];
  if (!row) return false;
  const candidateHash = await pbkdf2Hash(passcode, row.salt);
  return timingSafeEqualHex(candidateHash, row.passcodeHash);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

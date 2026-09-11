import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import { Preferences } from "@capacitor/preferences";

const DB_NAME = "moneyos_local";
const SCHEMA_VERSION = 1;
const ENCRYPTION_SECRET_KEY = "moneyos.sqlite.encryptionSecret";

export const isNative = Capacitor.isNativePlatform();

let sqliteConnection: SQLiteConnection | null = null;
let dbConnection: SQLiteDBConnection | null = null;
let initPromise: Promise<SQLiteDBConnection> | null = null;

async function getOrCreateEncryptionSecret(): Promise<string> {
  const existing = await Preferences.get({ key: ENCRYPTION_SECRET_KEY });
  if (existing.value) return existing.value;

  // 32 random bytes, hex-encoded — generated once per install and reused forever after.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await Preferences.set({ key: ENCRYPTION_SECRET_KEY, value: secret });
  return secret;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parentCategory TEXT,
  merchantRules TEXT NOT NULL DEFAULT '[]',
  isSystem INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  type TEXT NOT NULL,
  maskedAccountNumber TEXT,
  ifsc TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  balance REAL NOT NULL DEFAULT 0,
  availableBalance REAL,
  creditLimit REAL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS "transactions" (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT,
  category TEXT,
  subcategory TEXT,
  type TEXT NOT NULL,
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  transferGroupId TEXT,
  receiptImage TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_accountId ON "transactions"(accountId);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON "transactions"(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON "transactions"(category);
CREATE INDEX IF NOT EXISTS idx_transactions_transferGroupId ON "transactions"(transferGroupId);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  category TEXT,
  amount REAL NOT NULL,
  period TEXT NOT NULL,
  rollover INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  targetAmount REAL NOT NULL,
  currentAmount REAL NOT NULL DEFAULT 0,
  targetDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id TEXT PRIMARY KEY,
  goalId TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goalId ON goal_contributions(goalId);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  accountId TEXT NOT NULL,
  category TEXT,
  frequency TEXT NOT NULL,
  dueDate TEXT NOT NULL,
  reminderDaysBefore INTEGER NOT NULL DEFAULT 3,
  active INTEGER NOT NULL DEFAULT 1,
  lastPaidDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  date TEXT PRIMARY KEY,
  netWorth REAL NOT NULL,
  totalAssets REAL NOT NULL,
  totalLiabilities REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS local_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  passcodeHash TEXT NOT NULL,
  salt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`;

/**
 * Opens (creating on first run) the on-device encrypted SQLite database that is this app's
 * primary data store on native platforms — not a cache, not an offline fallback. All CRUD for
 * accounts/transactions/budgets/goals/bills reads and writes here directly; the backend, when
 * reachable, is only ever an optional sync/backup target (see local/sync.ts), never a dependency
 * for normal use. Encrypted at rest via SQLCipher (the plugin's native encryption), keyed by a
 * secret generated once per install and stored in Preferences.
 */
export function getDb(): Promise<SQLiteDBConnection> {
  if (!isNative) {
    return Promise.reject(new Error("Local SQLite database is only available on native platforms"));
  }
  if (dbConnection) return Promise.resolve(dbConnection);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    sqliteConnection = new SQLiteConnection(CapacitorSQLite);
    const secret = await getOrCreateEncryptionSecret();

    const secretStored = await sqliteConnection.isSecretStored();
    if (!secretStored.result) {
      await sqliteConnection.setEncryptionSecret(secret);
    }

    const isConn = (await sqliteConnection.isConnection(DB_NAME, false)).result;
    const db = isConn
      ? await sqliteConnection.retrieveConnection(DB_NAME, false)
      : await sqliteConnection.createConnection(DB_NAME, true, "secret", SCHEMA_VERSION, false);

    await db.open();
    await db.execute(SCHEMA_SQL);
    await ensureSeedData(db);

    dbConnection = db;
    return db;
  })();

  return initPromise;
}

async function ensureSeedData(db: SQLiteDBConnection): Promise<void> {
  const existing = await db.query("SELECT COUNT(*) as count FROM categories WHERE isSystem = 1");
  const count = existing.values?.[0]?.count ?? 0;
  if (count > 0) return;

  const now = new Date().toISOString();
  const SYSTEM_CATEGORIES: Array<{ name: string; merchantRules: string[] }> = [
    { name: "Food", merchantRules: ["swiggy", "zomato", "restaurant", "cafe", "food"] },
    { name: "Transport", merchantRules: ["uber", "ola", "metro", "fuel", "petrol", "parking"] },
    { name: "Shopping", merchantRules: ["amazon", "flipkart", "myntra", "shopping"] },
    { name: "Entertainment", merchantRules: ["netflix", "spotify", "hotstar", "prime video", "bookmyshow"] },
    { name: "Bills", merchantRules: ["electricity", "electricity board", "water board", "internet", "broadband", "mobile recharge"] },
    { name: "Income", merchantRules: ["salary", "employer", "payroll"] },
    { name: "Cash", merchantRules: ["atm withdrawal", "cash withdrawal"] },
    { name: "Investments", merchantRules: ["mutual fund", "sip", "zerodha", "groww", "stocks"] },
    { name: "Healthcare", merchantRules: ["pharmacy", "hospital", "clinic", "apollo", "medplus"] },
  ];

  for (const cat of SYSTEM_CATEGORIES) {
    await db.run(
      "INSERT INTO categories (id, name, parentCategory, merchantRules, isSystem, createdAt, updatedAt) VALUES (?, ?, NULL, ?, 1, ?, ?)",
      [genId(), cat.name, JSON.stringify(cat.merchantRules), now, now]
    );
  }
}

/** A 24-hex-char id shaped like a Mongo ObjectId (timestamp prefix + random suffix) — not a real
 * BSON ObjectId, but sortable by creation time and safe to use as a stable id if this record is
 * ever synced to the backend later. */
export function genId(): string {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  return (timestamp + random).slice(0, 24);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function __resetLocalDbForTests(): Promise<void> {
  dbConnection = null;
  sqliteConnection = null;
  initPromise = null;
}

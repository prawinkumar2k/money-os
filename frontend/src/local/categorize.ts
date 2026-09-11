import { getDb } from "./db";

// Ported verbatim from backend/src/services/categorization.service.ts so offline-created
// transactions get the same category-matching behavior as backend-created ones.
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pvt\.?|private|ltd\.?|limited|inc\.?|llp)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function categorizeLocal(merchant: string | null, description: string): Promise<string | null> {
  const haystack = normalize(`${merchant ?? ""} ${description}`);
  if (!haystack) return null;

  const db = await getDb();
  const res = await db.query("SELECT name, merchantRules FROM categories WHERE merchantRules != '[]'");
  for (const row of res.values ?? []) {
    const rules: string[] = JSON.parse(row.merchantRules);
    for (const rule of rules) {
      const normalizedRule = normalize(rule);
      if (normalizedRule && haystack.includes(normalizedRule)) {
        return row.name;
      }
    }
  }
  return null;
}

import { Category } from "../models/Category";

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pvt\.?|private|ltd\.?|limited|inc\.?|llp)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a category name for a transaction from merchant/description text.
 * User-defined rules always win over system rules. Returns null (Uncategorized) if nothing matches.
 */
export async function categorize(
  userId: string,
  merchant: string | null,
  description: string
): Promise<string | null> {
  const haystack = normalize(`${merchant ?? ""} ${description}`);
  if (!haystack) return null;

  const candidates = await Category.find({
    $or: [{ userId }, { isSystem: true }],
    "merchantRules.0": { $exists: true },
  }).sort({ userId: -1 }); // user-owned categories (userId set) sort before system ones (userId null)

  for (const category of candidates) {
    for (const rule of category.merchantRules) {
      const normalizedRule = normalize(rule);
      if (normalizedRule && haystack.includes(normalizedRule)) {
        return category.name;
      }
    }
  }

  return null;
}

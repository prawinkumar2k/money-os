import { Category } from "../models/Category";
import { logger } from "../utils/logger";

const SYSTEM_CATEGORIES: Array<{ name: string; parentCategory: string | null; merchantRules: string[] }> = [
  { name: "Food", parentCategory: null, merchantRules: ["swiggy", "zomato", "restaurant", "cafe", "food"] },
  { name: "Transport", parentCategory: null, merchantRules: ["uber", "ola", "metro", "fuel", "petrol", "parking"] },
  { name: "Shopping", parentCategory: null, merchantRules: ["amazon", "flipkart", "myntra", "shopping"] },
  { name: "Entertainment", parentCategory: null, merchantRules: ["netflix", "spotify", "hotstar", "prime video", "bookmyshow"] },
  { name: "Bills", parentCategory: null, merchantRules: ["electricity", "electricity board", "water board", "internet", "broadband", "mobile recharge"] },
  { name: "Income", parentCategory: null, merchantRules: ["salary", "employer", "payroll"] },
  { name: "Cash", parentCategory: null, merchantRules: ["atm withdrawal", "cash withdrawal"] },
  { name: "Investments", parentCategory: null, merchantRules: ["mutual fund", "sip", "zerodha", "groww", "stocks"] },
  { name: "Healthcare", parentCategory: null, merchantRules: ["pharmacy", "hospital", "clinic", "apollo", "medplus"] },
];

export async function seedSystemCategories(): Promise<void> {
  const existing = await Category.countDocuments({ isSystem: true });
  if (existing > 0) return;

  await Category.insertMany(
    SYSTEM_CATEGORIES.map((c) => ({
      userId: null,
      name: c.name,
      parentCategory: c.parentCategory,
      merchantRules: c.merchantRules,
      isSystem: true,
    }))
  );

  logger.info(`Seeded ${SYSTEM_CATEGORIES.length} system categories`);
}

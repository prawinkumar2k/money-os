import { getDb } from "./db";
import type { Category } from "../api/categories";

export async function listCategoriesLocal(): Promise<Category[]> {
  const db = await getDb();
  const res = await db.query("SELECT * FROM categories ORDER BY isSystem DESC, name ASC");
  return (res.values ?? []).map((row) => ({
    _id: row.id,
    name: row.name,
    parentCategory: row.parentCategory ?? null,
    isSystem: !!row.isSystem,
  }));
}

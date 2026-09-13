import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { listCategoriesLocal } from "../local/categories";

export interface Category {
  _id: string;
  name: string;
  parentCategory: string | null;
  isSystem: boolean;
}

export async function listCategories(): Promise<Category[]> {
  if (isNative) return listCategoriesLocal();
  const data = await apiFetch("/categories");
  return data.categories;
}

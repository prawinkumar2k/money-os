import { apiFetch } from "./client";

export interface Category {
  _id: string;
  name: string;
  parentCategory: string | null;
  isSystem: boolean;
}

export async function listCategories(): Promise<Category[]> {
  const data = await apiFetch("/categories");
  return data.categories;
}

import { apiFetch } from "./client";
import { isNative } from "../local/db";
import {
  listTransactionsLocal,
  createTransactionLocal,
  deleteTransactionLocal,
  updateTransactionCategoryLocal,
  setTransactionReceiptLocal,
  deleteTransactionReceiptLocal,
} from "../local/transactions";

export interface Transaction {
  _id: string;
  accountId: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  merchant: string | null;
  category: string | null;
  subcategory: string | null;
  type: string;
  provider: string;
  isMockData: boolean;
  source: "manual" | "automatic" | "imported";
  transferGroupId: string | null;
  receiptImage: string | null;
  pendingSync?: boolean; // client-only: set while an offline-created transaction awaits sync
}

export interface TransactionFilters {
  accountId?: string;
  category?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface TransactionListResult {
  transactions: Transaction[];
  pagination: { page: number; limit: number; total: number };
}

export async function listTransactions(filters: TransactionFilters = {}): Promise<TransactionListResult> {
  if (isNative) return listTransactionsLocal(filters);
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return apiFetch(`/transactions${query ? `?${query}` : ""}`);
}

export interface CreateSingleLegInput {
  type: string;
  accountId: string;
  amount: number;
  date: string;
  description: string;
  merchant?: string | null;
  category?: string | null;
  notes?: string | null;
}

export interface CreateTransferInput {
  type: "transfer";
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
}

export async function createTransaction(input: CreateSingleLegInput | CreateTransferInput): Promise<unknown> {
  if (isNative) return createTransactionLocal(input);
  return apiFetch("/transactions", { method: "POST", body: JSON.stringify(input) });
}

export async function deleteTransaction(id: string): Promise<void> {
  if (isNative) return deleteTransactionLocal(id);
  await apiFetch(`/transactions/${id}`, { method: "DELETE" });
}

export async function updateTransactionCategory(id: string, category: string, rememberRule = false): Promise<void> {
  if (isNative) return updateTransactionCategoryLocal(id, category, rememberRule);
  await apiFetch(`/transactions/${id}`, { method: "PUT", body: JSON.stringify({ category, rememberRule }) });
}

export async function setTransactionReceipt(id: string, image: string): Promise<Transaction> {
  if (isNative) return setTransactionReceiptLocal(id, image);
  const data = await apiFetch(`/transactions/${id}/receipt`, { method: "PUT", body: JSON.stringify({ image }) });
  return data.transaction;
}

export async function deleteTransactionReceipt(id: string): Promise<Transaction> {
  if (isNative) return deleteTransactionReceiptLocal(id);
  const data = await apiFetch(`/transactions/${id}/receipt`, { method: "DELETE" });
  return data.transaction;
}

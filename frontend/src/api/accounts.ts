import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { listAccountsLocal, createAccountLocal, deleteAccountLocal } from "../local/accounts";
import { getDashboardLocal } from "../local/dashboard";

export interface Account {
  _id: string;
  name: string;
  institution: string;
  type: string;
  balance: number;
  availableBalance: number | null;
  creditLimit: number | null;
  currency: string;
  provider: string;
  isMockData: boolean;
  lastSyncedAt: string | null;
}

export async function listAccounts(): Promise<Account[]> {
  if (isNative) return listAccountsLocal();
  const data = await apiFetch("/accounts");
  return data.accounts;
}

export interface CreateAccountInput {
  name: string;
  institution: string;
  type: string;
  balance: number;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  if (isNative) return createAccountLocal(input);
  const data = await apiFetch("/accounts", { method: "POST", body: JSON.stringify(input) });
  return data.account;
}

export async function deleteAccount(id: string): Promise<void> {
  if (isNative) return deleteAccountLocal(id);
  await apiFetch(`/accounts/${id}`, { method: "DELETE" });
}

export async function startSync(provider = "mock"): Promise<{ job: { status: string } }> {
  // Provider sync (mock/real bank data) always talks to the backend — this is the "optional
  // sync" surface, not primary local CRUD, so it intentionally does not branch on isNative.
  return apiFetch("/sync", { method: "POST", body: JSON.stringify({ provider }) });
}

export interface DashboardSummary {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  bankBalance: number;
  cashBalance: number;
  investmentsValue: number;
  creditCardOutstanding: number;
  loanDebt: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavings: number;
  savingsRate: number;
  monthlySubscriptionCost: number;
  totalBalance: number;
  accountCount: number;
  hasMockData: boolean;
  upcomingBills: Array<{ _id: string; name: string; amount: number; dueDate: string; status: string }>;
  budgets: Array<{ _id: string; category: string | null; amount: number; spent: number; percentageUsed: number }>;
  goals: Array<{ _id: string; name: string; targetAmount: number; currentAmount: number; progressPercentage: number }>;
  recentTransactions: Array<{
    _id: string;
    description: string;
    amount: number;
    date: string;
    category: string | null;
    isMockData: boolean;
  }>;
}

export async function getDashboard(): Promise<DashboardSummary> {
  if (isNative) return getDashboardLocal();
  return apiFetch("/dashboard");
}

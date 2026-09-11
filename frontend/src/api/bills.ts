import { apiFetch } from "./client";

export interface Bill {
  _id: string;
  name: string;
  amount: number;
  accountId: string;
  category: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  dueDate: string;
  reminderDaysBefore: number;
  active: boolean;
  lastPaidDate: string | null;
  daysUntilDue: number;
  status: "overdue" | "due_soon" | "upcoming";
}

export interface CreateBillInput {
  name: string;
  amount: number;
  accountId: string;
  category?: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  dueDate: string;
  reminderDaysBefore?: number;
}

export async function listBills(): Promise<Bill[]> {
  const data = await apiFetch("/bills");
  return data.bills;
}

export async function createBill(input: CreateBillInput): Promise<Bill> {
  const data = await apiFetch("/bills", { method: "POST", body: JSON.stringify(input) });
  return data.bill;
}

export async function deleteBill(id: string): Promise<void> {
  await apiFetch(`/bills/${id}`, { method: "DELETE" });
}

export async function payBill(id: string): Promise<Bill> {
  const data = await apiFetch(`/bills/${id}/pay`, { method: "POST" });
  return data.bill;
}

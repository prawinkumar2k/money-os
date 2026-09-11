import { apiFetch } from "./client";

export interface CreditCard {
  _id: string;
  accountId: string;
  accountName: string | null;
  statementDay: number;
  dueDate: string;
  minimumDuePercent: number;
  creditLimit: number;
  outstanding: number;
  availableCredit: number;
  utilizationPercent: number;
  minimumDue: number;
  daysUntilDue: number;
  highUtilization: boolean;
}

export interface CreateCreditCardInput {
  accountId: string;
  statementDay: number;
  dueDate: string;
  minimumDuePercent?: number;
}

export async function listCreditCards(): Promise<CreditCard[]> {
  const data = await apiFetch("/credit-cards");
  return data.creditCards;
}

export async function createCreditCard(input: CreateCreditCardInput): Promise<CreditCard> {
  const data = await apiFetch("/credit-cards", { method: "POST", body: JSON.stringify(input) });
  return data.creditCard;
}

export async function deleteCreditCard(id: string): Promise<void> {
  await apiFetch(`/credit-cards/${id}`, { method: "DELETE" });
}

export async function payCreditCard(id: string, fromAccountId: string, amount: number): Promise<CreditCard> {
  const data = await apiFetch(`/credit-cards/${id}/pay`, {
    method: "POST",
    body: JSON.stringify({ fromAccountId, amount }),
  });
  return data.creditCard;
}

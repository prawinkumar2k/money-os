import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { listCreditCardsLocal, createCreditCardLocal, deleteCreditCardLocal, payCreditCardLocal } from "../local/creditCards";

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
  if (isNative) return listCreditCardsLocal();
  const data = await apiFetch("/credit-cards");
  return data.creditCards;
}

export async function createCreditCard(input: CreateCreditCardInput): Promise<CreditCard> {
  if (isNative) return createCreditCardLocal(input);
  const data = await apiFetch("/credit-cards", { method: "POST", body: JSON.stringify(input) });
  return data.creditCard;
}

export async function deleteCreditCard(id: string): Promise<void> {
  if (isNative) return deleteCreditCardLocal(id);
  await apiFetch(`/credit-cards/${id}`, { method: "DELETE" });
}

export async function payCreditCard(id: string, fromAccountId: string, amount: number): Promise<CreditCard> {
  if (isNative) return payCreditCardLocal(id, fromAccountId, amount);
  const data = await apiFetch(`/credit-cards/${id}/pay`, {
    method: "POST",
    body: JSON.stringify({ fromAccountId, amount }),
  });
  return data.creditCard;
}

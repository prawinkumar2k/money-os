import { apiFetch } from "./client";
import { isNative } from "../local/db";
import { getMonthlyReportLocal, getYearlyReportLocal } from "../local/reports";

export interface MonthlyReport {
  from: string;
  to: string;
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  byCategory: Array<{ category: string; total: number }>;
  transactionCount: number;
}

export interface YearlyReport {
  year: number;
  months: Array<{ month: number; totalIncome: number; totalExpenses: number; netSavings: number }>;
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
}

export async function getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
  if (isNative) return getMonthlyReportLocal(year, month);
  const data = await apiFetch(`/reports/monthly?year=${year}&month=${month}`);
  return data.report;
}

export async function getYearlyReport(year: number): Promise<YearlyReport> {
  if (isNative) return getYearlyReportLocal(year);
  const data = await apiFetch(`/reports/yearly?year=${year}`);
  return data.report;
}

import { FinancialDataProvider } from "./FinancialDataProvider";
import { MockProvider } from "./MockProvider";

const registry = new Map<string, FinancialDataProvider>();
registry.set("mock", new MockProvider());

// Register a real provider (Setu / Finvu / Perfios / Yodlee / a bank's own API) here once
// one is chosen and its adapter implements FinancialDataProvider. Nothing else in the
// app should need to change.

export function getProvider(id: string): FinancialDataProvider {
  const provider = registry.get(id);
  if (!provider) {
    throw new Error(`Unknown financial data provider: ${id}`);
  }
  return provider;
}

export function listProviders(): FinancialDataProvider[] {
  return Array.from(registry.values());
}

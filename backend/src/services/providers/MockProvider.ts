import {
  AuthorizationResult,
  ConnectionResult,
  ConnectionStatus,
  FinancialDataProvider,
  ProviderAccount,
  ProviderTransaction,
  SyncResult,
} from "./FinancialDataProvider";

/**
 * DEVELOPMENT-ONLY provider. Returns deterministic, clearly-labeled fake data so the
 * app can be exercised end-to-end before a real bank / Account Aggregator provider is
 * wired in. Every account and transaction it returns carries isMockData so the API and
 * UI can flag it — this data must never be presented to a user as real banking data.
 */
export class MockProvider implements FinancialDataProvider {
  readonly id = "mock";
  readonly isMockData = true;

  async connect(userId: string): Promise<ConnectionResult> {
    return { connectionId: `mock-conn-${userId}`, status: "connected" };
  }

  async authorize(): Promise<AuthorizationResult> {
    return { authorized: true };
  }

  async getAccounts(connectionId: string): Promise<ProviderAccount[]> {
    return [
      {
        externalAccountId: `${connectionId}-acc-savings`,
        name: "Mock Savings Account",
        institution: "Demo Bank",
        type: "savings",
        maskedAccountNumber: "XXXX1234",
        ifsc: "DEMO0001234",
        currency: "INR",
        balance: 84250.5,
        availableBalance: 84250.5,
        creditLimit: null,
      },
      {
        externalAccountId: `${connectionId}-acc-credit`,
        name: "Mock Credit Card",
        institution: "Demo Bank",
        type: "credit_card",
        maskedAccountNumber: "XXXX9876",
        ifsc: null,
        currency: "INR",
        balance: -4200,
        availableBalance: null,
        creditLimit: 150000,
      },
    ];
  }

  async getBalances(connectionId: string) {
    const accounts = await this.getAccounts(connectionId);
    return accounts.map((a) => ({
      externalAccountId: a.externalAccountId,
      balance: a.balance,
      availableBalance: a.availableBalance,
    }));
  }

  async getTransactions(connectionId: string): Promise<ProviderTransaction[]> {
    const savingsId = `${connectionId}-acc-savings`;
    const creditId = `${connectionId}-acc-credit`;
    const today = new Date();
    const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000);

    return [
      {
        externalTransactionId: `${connectionId}-txn-1`,
        externalAccountId: savingsId,
        amount: 50000,
        currency: "INR",
        date: daysAgo(28),
        description: "Salary credit",
        merchant: "Employer Inc",
        type: "income",
      },
      {
        externalTransactionId: `${connectionId}-txn-2`,
        externalAccountId: savingsId,
        amount: -450,
        currency: "INR",
        date: daysAgo(5),
        description: "Swiggy order",
        merchant: "Swiggy",
        type: "expense",
      },
      {
        externalTransactionId: `${connectionId}-txn-3`,
        externalAccountId: savingsId,
        amount: -1200,
        currency: "INR",
        date: daysAgo(3),
        description: "Electricity bill",
        merchant: "State Electricity Board",
        type: "expense",
      },
      {
        externalTransactionId: `${connectionId}-txn-4`,
        externalAccountId: creditId,
        amount: -4200,
        currency: "INR",
        date: daysAgo(2),
        description: "Amazon purchase",
        merchant: "Amazon",
        type: "expense",
      },
    ];
  }

  async refresh(connectionId: string): Promise<SyncResult> {
    const [accounts, transactions] = await Promise.all([
      this.getAccounts(connectionId),
      this.getTransactions(connectionId),
    ]);
    return { accounts, transactions };
  }

  async disconnect(): Promise<void> {
    // no-op for mock provider
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { status: "connected", lastSyncedAt: new Date() };
  }
}

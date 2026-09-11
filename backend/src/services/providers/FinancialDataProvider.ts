export interface ConnectionResult {
  connectionId: string;
  status: "connected" | "pending_authorization";
}

export interface AuthorizationResult {
  authorized: boolean;
  redirectUrl?: string;
}

export interface ProviderAccount {
  externalAccountId: string;
  name: string;
  institution: string;
  type: string;
  maskedAccountNumber: string | null;
  ifsc: string | null;
  currency: string;
  balance: number;
  availableBalance: number | null;
  creditLimit: number | null;
}

export interface ProviderTransaction {
  externalTransactionId: string;
  externalAccountId: string;
  amount: number;
  currency: string;
  date: Date;
  description: string;
  merchant: string | null;
  type: string;
}

export interface SyncResult {
  accounts: ProviderAccount[];
  transactions: ProviderTransaction[];
}

export interface ConnectionStatus {
  status: "connected" | "disconnected" | "error" | "pending_authorization";
  lastSyncedAt: Date | null;
}

/**
 * Common interface every bank/UPI/account-aggregator integration must implement.
 * The app must never depend on a single provider's shape directly — only on this contract.
 */
export interface FinancialDataProvider {
  readonly id: string;
  readonly isMockData: boolean;

  connect(userId: string): Promise<ConnectionResult>;
  authorize(connectionId: string, params: Record<string, unknown>): Promise<AuthorizationResult>;
  getAccounts(connectionId: string): Promise<ProviderAccount[]>;
  getBalances(connectionId: string): Promise<Pick<ProviderAccount, "externalAccountId" | "balance" | "availableBalance">[]>;
  getTransactions(connectionId: string, since?: Date): Promise<ProviderTransaction[]>;
  refresh(connectionId: string): Promise<SyncResult>;
  disconnect(connectionId: string): Promise<void>;
  getConnectionStatus(connectionId: string): Promise<ConnectionStatus>;
}

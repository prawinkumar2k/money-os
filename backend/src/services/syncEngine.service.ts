import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { SyncJob } from "../models/SyncJob";
import { FinancialConnection } from "../models/FinancialConnection";
import { getProvider } from "./providers";
import { categorize } from "./categorization.service";
import { logger } from "../utils/logger";

export interface SyncRunResult {
  job: InstanceType<typeof SyncJob>;
}

/**
 * The actual sync pipeline: connect -> fetch -> upsert accounts -> upsert transactions
 * (deduped by providerTransactionId) -> categorize -> record job + connection state.
 * Shared by the generic POST /api/sync endpoint and the per-connection sync action on the
 * Connected Accounts screen, so there's exactly one sync implementation, not two.
 */
export async function runProviderSync(userId: string, providerId: string): Promise<SyncRunResult> {
  const provider = getProvider(providerId);
  const job = await SyncJob.create({ userId, provider: providerId, status: "running" });

  try {
    const { connectionId } = await provider.connect(userId);

    await FinancialConnection.findOneAndUpdate(
      { userId, provider: providerId },
      { $set: { userId, provider: providerId, status: "connected", providerConnectionId: connectionId } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const { accounts, transactions } = await provider.refresh(connectionId);

    const accountIdMap = new Map<string, string>();

    for (const providerAccount of accounts) {
      const account = await Account.findOneAndUpdate(
        { userId, provider: providerId, "externalRef.externalAccountId": providerAccount.externalAccountId },
        {
          $set: {
            userId,
            name: providerAccount.name,
            institution: providerAccount.institution,
            type: providerAccount.type,
            maskedAccountNumber: providerAccount.maskedAccountNumber,
            ifsc: providerAccount.ifsc,
            currency: providerAccount.currency,
            balance: providerAccount.balance,
            availableBalance: providerAccount.availableBalance,
            creditLimit: providerAccount.creditLimit,
            provider: providerId,
            isMockData: provider.isMockData,
            lastSyncedAt: new Date(),
            syncStatus: "idle",
            "externalRef.externalAccountId": providerAccount.externalAccountId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      accountIdMap.set(providerAccount.externalAccountId, String(account._id));
    }

    let transactionsSynced = 0;
    let transactionsSkippedAsDuplicate = 0;

    for (const providerTxn of transactions) {
      const accountId = accountIdMap.get(providerTxn.externalAccountId);
      if (!accountId) continue;

      const category = await categorize(userId, providerTxn.merchant, providerTxn.description);

      const result = await Transaction.updateOne(
        { accountId, providerTransactionId: providerTxn.externalTransactionId },
        {
          $setOnInsert: {
            userId,
            accountId,
            amount: providerTxn.amount,
            currency: providerTxn.currency,
            date: providerTxn.date,
            description: providerTxn.description,
            merchant: providerTxn.merchant,
            category,
            type: providerTxn.type,
            provider: providerId,
            providerTransactionId: providerTxn.externalTransactionId,
            isMockData: provider.isMockData,
            source: "automatic",
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) transactionsSynced += 1;
      else transactionsSkippedAsDuplicate += 1;
    }

    job.status = "completed";
    job.accountsSynced = accounts.length;
    job.transactionsSynced = transactionsSynced;
    job.transactionsSkippedAsDuplicate = transactionsSkippedAsDuplicate;
    job.finishedAt = new Date();
    await job.save();

    await FinancialConnection.updateOne({ userId, provider: providerId }, { $set: { lastSyncedAt: new Date() } });

    return { job };
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : "Unknown sync error";
    job.finishedAt = new Date();
    await job.save();

    await FinancialConnection.updateOne({ userId, provider: providerId }, { $set: { status: "error" } });

    logger.error("Sync job failed", { jobId: String(job._id) });
    throw err;
  }
}

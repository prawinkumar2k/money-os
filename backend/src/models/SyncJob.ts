import { Schema, model, Types } from "mongoose";

export interface ISyncJob {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  provider: string;
  status: "pending" | "running" | "completed" | "failed";
  accountsSynced: number;
  transactionsSynced: number;
  transactionsSkippedAsDuplicate: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const syncJobSchema = new Schema<ISyncJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, required: true },
    status: { type: String, enum: ["pending", "running", "completed", "failed"], default: "pending" },
    accountsSynced: { type: Number, default: 0 },
    transactionsSynced: { type: Number, default: 0 },
    transactionsSkippedAsDuplicate: { type: Number, default: 0 },
    error: { type: String, default: null },
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const SyncJob = model<ISyncJob>("SyncJob", syncJobSchema);

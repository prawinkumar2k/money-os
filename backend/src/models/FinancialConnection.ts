import { Schema, model, Types } from "mongoose";

export interface IFinancialConnection {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  provider: string; // e.g. "mock", later "setu" | "finvu" | ...
  status: "connected" | "disconnected" | "error" | "pending_authorization";
  providerConnectionId: string | null;
  // Provider access/refresh tokens must always be encrypted at rest — never store plaintext.
  encryptedCredentials: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const financialConnectionSchema = new Schema<IFinancialConnection>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, required: true },
    status: {
      type: String,
      enum: ["connected", "disconnected", "error", "pending_authorization"],
      default: "pending_authorization",
    },
    providerConnectionId: { type: String, default: null },
    encryptedCredentials: { type: String, default: null, select: false },
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

financialConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

export const FinancialConnection = model<IFinancialConnection>(
  "FinancialConnection",
  financialConnectionSchema
);

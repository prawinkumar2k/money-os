import { Schema, model, Types } from "mongoose";

export type AccountType =
  | "savings"
  | "current"
  | "salary"
  | "credit_card"
  | "cash"
  | "upi"
  | "investment"
  | "loan"
  | "fixed_deposit"
  | "recurring_deposit"
  | "custom";

export interface IAccount {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  institution: string;
  type: AccountType;
  maskedAccountNumber: string | null;
  ifsc: string | null;
  currency: string;
  balance: number;
  availableBalance: number | null;
  creditLimit: number | null;
  provider: string;
  isMockData: boolean;
  lastSyncedAt: Date | null;
  syncStatus: "idle" | "syncing" | "error";
  externalRef: { externalAccountId: string | null };
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<IAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: [
        "savings",
        "current",
        "salary",
        "credit_card",
        "cash",
        "upi",
        "investment",
        "loan",
        "fixed_deposit",
        "recurring_deposit",
        "custom",
      ],
    },
    maskedAccountNumber: { type: String, default: null },
    ifsc: { type: String, default: null },
    currency: { type: String, default: "INR" },
    balance: { type: Number, required: true, default: 0 },
    availableBalance: { type: Number, default: null },
    creditLimit: { type: Number, default: null },
    provider: { type: String, required: true, default: "manual" },
    isMockData: { type: Boolean, default: false },
    lastSyncedAt: { type: Date, default: null },
    syncStatus: { type: String, enum: ["idle", "syncing", "error"], default: "idle" },
    externalRef: {
      externalAccountId: { type: String, default: null },
    },
  },
  { timestamps: true }
);

accountSchema.index(
  { userId: 1, provider: 1, "externalRef.externalAccountId": 1 },
  { unique: true, partialFilterExpression: { "externalRef.externalAccountId": { $type: "string" } } }
);

export const Account = model<IAccount>("Account", accountSchema);

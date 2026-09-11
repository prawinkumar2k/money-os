import { Schema, model, Types } from "mongoose";

export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "refund"
  | "investment"
  | "loan_payment"
  | "credit_card_payment"
  | "interest"
  | "cashback"
  | "fee"
  | "adjustment";

export interface ITransaction {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  amount: number;
  currency: string;
  date: Date;
  description: string;
  merchant: string | null;
  category: string | null;
  subcategory: string | null;
  type: TransactionType;
  provider: string;
  providerTransactionId: string | null;
  isMockData: boolean;
  notes: string | null;
  tags: string[];
  source: "manual" | "automatic" | "imported";
  transferGroupId: string | null;
  receiptImage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    date: { type: Date, required: true, index: true },
    description: { type: String, required: true },
    merchant: { type: String, default: null, index: true },
    category: { type: String, default: null, index: true },
    subcategory: { type: String, default: null },
    type: {
      type: String,
      required: true,
      enum: [
        "expense",
        "income",
        "transfer",
        "refund",
        "investment",
        "loan_payment",
        "credit_card_payment",
        "interest",
        "cashback",
        "fee",
        "adjustment",
      ],
    },
    provider: { type: String, required: true, default: "manual" },
    providerTransactionId: { type: String, default: null },
    isMockData: { type: Boolean, default: false },
    notes: { type: String, default: null },
    tags: { type: [String], default: [] },
    source: { type: String, enum: ["manual", "automatic", "imported"], default: "manual" },
    transferGroupId: { type: String, default: null, index: true },
    // A data: URL (base64), capped at upload time — see receiptImageSchema in transactions.controller.ts.
    receiptImage: { type: String, default: null },
  },
  { timestamps: true }
);

// Dedupe key for provider-sourced transactions: same account + same provider transaction id.
transactionSchema.index(
  { accountId: 1, providerTransactionId: 1 },
  { unique: true, partialFilterExpression: { providerTransactionId: { $type: "string" } } }
);

export const Transaction = model<ITransaction>("Transaction", transactionSchema);

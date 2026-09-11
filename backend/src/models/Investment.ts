import { Schema, model, Types } from "mongoose";

export type InvestmentType = "stock" | "mutual_fund" | "etf" | "gold" | "fixed_deposit" | "recurring_deposit" | "other";

export interface IInvestmentTransaction {
  date: Date;
  type: "buy" | "sell";
  units: number;
  pricePerUnit: number;
  amount: number;
}

export interface IInvestment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: InvestmentType;
  units: number;
  avgBuyPrice: number;
  investedAmount: number;
  currentPrice: number; // manually entered unless a real market-data provider is wired in
  isManualPrice: boolean;
  priceUpdatedAt: Date;
  transactions: IInvestmentTransaction[];
  accountId: Types.ObjectId | null; // optional linked account debited/credited on buy/sell
  createdAt: Date;
  updatedAt: Date;
}

const investmentTransactionSchema = new Schema<IInvestmentTransaction>(
  {
    date: { type: Date, required: true },
    type: { type: String, enum: ["buy", "sell"], required: true },
    units: { type: Number, required: true },
    pricePerUnit: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const investmentSchema = new Schema<IInvestment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["stock", "mutual_fund", "etf", "gold", "fixed_deposit", "recurring_deposit", "other"],
      required: true,
    },
    units: { type: Number, default: 0 },
    avgBuyPrice: { type: Number, default: 0 },
    investedAmount: { type: Number, default: 0 },
    currentPrice: { type: Number, required: true },
    isManualPrice: { type: Boolean, default: true },
    priceUpdatedAt: { type: Date, default: () => new Date() },
    transactions: { type: [investmentTransactionSchema], default: [] },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { timestamps: true }
);

export const Investment = model<IInvestment>("Investment", investmentSchema);

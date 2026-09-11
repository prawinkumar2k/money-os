import { Schema, model, Types } from "mongoose";

export interface ICreditCard {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  accountId: Types.ObjectId; // Account of type "credit_card" — balance/creditLimit live there
  statementDay: number; // 1-31
  dueDate: Date; // next payment due date
  minimumDuePercent: number; // e.g. 5 = 5% of outstanding
  createdAt: Date;
  updatedAt: Date;
}

const creditCardSchema = new Schema<ICreditCard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, unique: true },
    statementDay: { type: Number, required: true, min: 1, max: 31 },
    dueDate: { type: Date, required: true },
    minimumDuePercent: { type: Number, default: 5 },
  },
  { timestamps: true }
);

export const CreditCard = model<ICreditCard>("CreditCard", creditCardSchema);

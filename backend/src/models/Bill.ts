import { Schema, model, Types } from "mongoose";

export type BillFrequency = "weekly" | "monthly" | "yearly";

export interface IBill {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  amount: number;
  accountId: Types.ObjectId;
  category: string | null;
  frequency: BillFrequency;
  dueDate: Date;
  reminderDaysBefore: number;
  active: boolean;
  lastPaidDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const billSchema = new Schema<IBill>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    category: { type: String, default: null },
    frequency: { type: String, enum: ["weekly", "monthly", "yearly"], required: true },
    dueDate: { type: Date, required: true, index: true },
    reminderDaysBefore: { type: Number, default: 3 },
    active: { type: Boolean, default: true },
    lastPaidDate: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Bill = model<IBill>("Bill", billSchema);

import { Schema, model, Types } from "mongoose";

export interface IBudget {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  category: string | null; // null = overall budget across all categories
  amount: number;
  period: "weekly" | "monthly";
  rollover: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const budgetSchema = new Schema<IBudget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, default: null },
    amount: { type: Number, required: true, min: 0 },
    period: { type: String, enum: ["weekly", "monthly"], required: true },
    rollover: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Budget = model<IBudget>("Budget", budgetSchema);

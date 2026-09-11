import { Schema, model, Types } from "mongoose";

export interface ISubscription {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  merchant: string; // normalized merchant key, used to de-duplicate against detection
  name: string;
  amount: number;
  frequency: "weekly" | "monthly" | "yearly";
  monthlyCost: number;
  yearlyCost: number;
  status: "confirmed" | "dismissed" | "cancelled";
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    merchant: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    frequency: { type: String, enum: ["weekly", "monthly", "yearly"], required: true },
    monthlyCost: { type: Number, required: true },
    yearlyCost: { type: Number, required: true },
    status: { type: String, enum: ["confirmed", "dismissed", "cancelled"], default: "confirmed" },
    confirmedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, merchant: 1 }, { unique: true });

export const Subscription = model<ISubscription>("Subscription", subscriptionSchema);

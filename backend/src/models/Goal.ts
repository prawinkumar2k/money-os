import { Schema, model, Types } from "mongoose";

export interface IGoalContribution {
  amount: number; // positive = contribution, negative = withdrawal
  date: Date;
  note: string | null;
}

export interface IGoal {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date | null;
  contributions: IGoalContribution[];
  createdAt: Date;
  updatedAt: Date;
}

const contributionSchema = new Schema<IGoalContribution>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: () => new Date() },
    note: { type: String, default: null },
  },
  { _id: false }
);

const goalSchema = new Schema<IGoal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, default: 0, min: 0 },
    targetDate: { type: Date, default: null },
    contributions: { type: [contributionSchema], default: [] },
  },
  { timestamps: true }
);

export const Goal = model<IGoal>("Goal", goalSchema);

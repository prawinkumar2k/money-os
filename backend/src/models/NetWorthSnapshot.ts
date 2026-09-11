import { Schema, model, Types } from "mongoose";

export interface INetWorthSnapshot {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  createdAt: Date;
}

const netWorthSnapshotSchema = new Schema<INetWorthSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true, index: true },
    totalAssets: { type: Number, required: true },
    totalLiabilities: { type: Number, required: true },
    netWorth: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One snapshot per user per calendar day.
netWorthSnapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

export const NetWorthSnapshot = model<INetWorthSnapshot>("NetWorthSnapshot", netWorthSnapshotSchema);

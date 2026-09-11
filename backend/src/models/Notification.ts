import { Schema, model, Types } from "mongoose";

export type NotificationType =
  | "bill_due_soon"
  | "bill_overdue"
  | "budget_alert"
  | "high_credit_utilization"
  | "goal_behind_schedule"
  | "subscription_renewal";

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedId: string | null;
  read: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["bill_due_soon", "bill_overdue", "budget_alert", "high_credit_utilization", "goal_behind_schedule", "subscription_renewal"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedId: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification = model<INotification>("Notification", notificationSchema);

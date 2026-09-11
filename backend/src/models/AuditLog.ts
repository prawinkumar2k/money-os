import { Schema, model, Types } from "mongoose";

export interface IAuditLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId | null;
  action: string; // e.g. "auth.login", "sync.completed", "account.created"
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);

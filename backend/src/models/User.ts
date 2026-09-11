import { Schema, model, Types } from "mongoose";

export interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  refreshTokenHash: string | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;
  personalMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    refreshTokenHash: { type: String, default: null, select: false },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
    personalMode: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = model<IUser>("User", userSchema);

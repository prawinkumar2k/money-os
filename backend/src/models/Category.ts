import { Schema, model, Types } from "mongoose";

export interface ICategory {
  _id: Types.ObjectId;
  userId: Types.ObjectId | null; // null = built-in system category
  name: string;
  parentCategory: string | null;
  merchantRules: string[]; // merchant name fragments that map to this category
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true },
    parentCategory: { type: String, default: null },
    merchantRules: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Category = model<ICategory>("Category", categorySchema);

import { Schema, model, Types } from "mongoose";

export interface IImport {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  filename: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkippedDuplicate: number;
  rowsSkippedError: number;
  createdAt: Date;
}

const importSchema = new Schema<IImport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    filename: { type: String, required: true },
    rowsTotal: { type: Number, required: true },
    rowsImported: { type: Number, required: true },
    rowsSkippedDuplicate: { type: Number, required: true },
    rowsSkippedError: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Import = model<IImport>("Import", importSchema);

import { Schema, model, Types } from "mongoose";

export interface ILoanPayment {
  date: Date;
  amount: number;
  principalComponent: number;
  interestComponent: number;
  remainingPrincipalAfter: number;
}

export interface ILoan {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  principal: number;
  interestRate: number; // annual %
  tenureMonths: number;
  emi: number;
  startDate: Date;
  accountId: Types.ObjectId | null; // account payments are made from
  remainingPrincipal: number;
  nextPaymentDate: Date;
  payments: ILoanPayment[];
  createdAt: Date;
  updatedAt: Date;
}

const loanPaymentSchema = new Schema<ILoanPayment>(
  {
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    principalComponent: { type: Number, required: true },
    interestComponent: { type: Number, required: true },
    remainingPrincipalAfter: { type: Number, required: true },
  },
  { _id: false }
);

const loanSchema = new Schema<ILoan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    principal: { type: Number, required: true, min: 0.01 },
    interestRate: { type: Number, required: true, min: 0 },
    tenureMonths: { type: Number, required: true, min: 1 },
    emi: { type: Number, required: true },
    startDate: { type: Date, required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    remainingPrincipal: { type: Number, required: true },
    nextPaymentDate: { type: Date, required: true },
    payments: { type: [loanPaymentSchema], default: [] },
  },
  { timestamps: true }
);

export const Loan = model<ILoan>("Loan", loanSchema);

import mongoose from 'mongoose';

const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: { type: String, trim: true, uppercase: true },
    bankName: { type: String, trim: true },
    branchName: { type: String, trim: true },
    accountType: { type: String, enum: ['savings', 'current'] },
  },
  { _id: false },
);

const refundMethodSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: { type: String, enum: ['upi', 'bank_transfer'], required: true },
    upiId: { type: String, trim: true, lowercase: true },
    bankDetails: { type: bankDetailsSchema, default: null },
    label: { type: String, trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

refundMethodSchema.index({ user: 1, createdAt: -1 });

export const RefundMethod =
  mongoose.models.RefundMethod || mongoose.model('RefundMethod', refundMethodSchema);

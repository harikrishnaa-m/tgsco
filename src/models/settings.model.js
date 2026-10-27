import mongoose from 'mongoose';

const invoiceSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  active: { type: Boolean, default: true }, archivedAt: Date,
  legalBusinessName: { type: String, required: true }, displayBusinessName: String,
  sellerAddress: { type: mongoose.Schema.Types.Mixed, required: true },
  gstin: String, pan: String, contact: { type: mongoose.Schema.Types.Mixed, default: {} },
  invoicePrefix: { type: String, default: 'INV' }, financialYear: String,
  nextSequence: { type: Number, default: 1 }, terms: String, returnsPolicy: String,
  signatory: { type: mongoose.Schema.Types.Mixed, default: {} },
  bankDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const chargeSettingsSchema = new mongoose.Schema({
  type: { type: String, enum: ['shipping', 'packing'], required: true, index: true },
  code: { type: String, required: true, trim: true }, name: { type: String, required: true },
  active: { type: Boolean, default: true }, archivedAt: Date,
  method: { type: String, enum: ['flat', 'percentage'], default: 'flat' },
  amount: { type: Number, min: 0, default: 0 }, percentage: { type: Number, min: 0, max: 100, default: 0 },
  freeAbove: { type: Number, min: 0 }, taxable: { type: Boolean, default: false },
  taxRate: { type: Number, min: 0, max: 100, default: 0 }, conditions: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
chargeSettingsSchema.index({ type: 1, code: 1 }, { unique: true });

export const InvoiceSettings = mongoose.models.InvoiceSettings
  || mongoose.model('InvoiceSettings', invoiceSettingsSchema);
export const ChargeSettings = mongoose.models.ChargeSettings
  || mongoose.model('ChargeSettings', chargeSettingsSchema);

const orderPolicySettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  cancellationAllowedUntil: {
    type: String,
    enum: ['pending_payment', 'confirmed', 'processing', 'shipped'],
    default: 'shipped',
  },
  returnWindowDays: { type: Number, min: 0, max: 365, default: 7 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const OrderPolicySettings = mongoose.models.OrderPolicySettings
  || mongoose.model('OrderPolicySettings', orderPolicySettingsSchema);

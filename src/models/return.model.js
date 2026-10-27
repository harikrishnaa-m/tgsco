import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct', required: true },
    quantity: { type: Number, required: true, min: 1 },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const returnSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [returnItemSchema], required: true },
    reason: { type: String, required: true, trim: true },
    customerNote: { type: String, trim: true, maxlength: 2000 },
    pickupAddressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true },
    pickupAddress: { type: mongoose.Schema.Types.Mixed, required: true },
    refundMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'RefundMethod', default: null },
    refundMethod: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: [
        'requested',
        'approved',
        'rejected',
        'pickup_pending',
        'received',
        'inspection_pending',
        'approved_for_refund',
        'refund_pending',
        'refunded',
        'completed',
        'cancelled',
      ],
      default: 'requested',
    },
    refund: { type: mongoose.Schema.Types.Mixed, default: null },
    timeline: [{ type: mongoose.Schema.Types.Mixed }],
    cancelledAt: Date,
    cancellationReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

returnSchema.index({ order: 1, status: 1 });
returnSchema.index({ user: 1, createdAt: -1 });
export const Return = mongoose.models.Return || mongoose.model('Return', returnSchema);

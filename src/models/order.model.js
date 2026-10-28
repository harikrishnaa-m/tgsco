import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    mainImage: { type: mongoose.Schema.Types.Mixed, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true },
    label: String,
    recipientName: { type: String, required: true },
    mobile: { type: String, required: true },
    alternateMobile: String,
    addressLine1: { type: String, required: true },
    addressLine2: String,
    locality: { type: String, required: true },
    landmark: String,
    city: { type: String, required: true },
    district: String,
    state: { type: String, required: true },
    stateCode: String,
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    deliveryInstructions: String,
  },
  { _id: false },
);

const reservationSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogProduct', required: true },
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['active', 'consumed', 'released'], default: 'active' },
  },
  { _id: false },
);

const chargeSnapshotSchema = new mongoose.Schema(
  {
    code: String,
    name: String,
    amount: { type: Number, min: 0 },
    taxRate: { type: Number, min: 0, default: 0 },
    taxable: { type: Boolean, default: false },
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const refundSchema = new mongoose.Schema(
  {
    refundId: { type: String, trim: true },
    paymentId: String,
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'processed', 'refunded', 'failed', 'pending'],
      default: 'created',
    },
    returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return' },
    reason: String,
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },
    idempotencyKey: String,
    createdAt: { type: Date, default: Date.now },
    processedAt: Date,
    failure: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    idempotencyKey: { type: String, trim: true },
    items: { type: [orderItemSchema], required: true, minLength: 1 },
    shippingAddress: { type: addressSnapshotSchema, required: true },
    billingAddress: { type: addressSnapshotSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
    discountAmount: { type: Number, required: true, min: 0, default: 0 },
    packingFee: { type: Number, min: 0, default: 0 },
    codFee: { type: Number, min: 0, default: 0 },
    taxBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
    appliedCharges: { type: [chargeSnapshotSchema], default: [] },
    sellerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    invoiceSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    invoiceNumber: String,
    grandTotal: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'INR' },
    paymentMethod: { type: String, enum: ['cod', 'razorpay'], required: true },
    orderStatus: {
      type: String,
      enum: [
        'pending_payment',
        'confirmed',
        'cancelled',
        'processing',
        'shipped',
        'delivered',
        'returned',
        'refunded',
      ],
      default: 'pending_payment',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'created', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'pending',
    },
    razorpayOrderId: { type: String, sparse: true, unique: true },
    razorpayPaymentId: String,
    reservationExpiresAt: Date,
    reservations: { type: [reservationSchema], default: [] },
    processedWebhookEvents: { type: [String], default: [] },
    shipment: { type: mongoose.Schema.Types.Mixed, default: null },
    notes: { type: [String], default: [] },
    timeline: { type: [timelineSchema], default: [] },
    cancellation: { type: mongoose.Schema.Types.Mixed, default: null },
    refund: { type: mongoose.Schema.Types.Mixed, default: null },
    refunds: { type: [refundSchema], default: [] },
    refundedAmount: { type: Number, min: 0, default: 0 },
    returnStatus: {
      type: String,
      enum: [
        'none',
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
      default: 'none',
    },
    returnIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Return' }],
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ reservationExpiresAt: 1, paymentStatus: 1 });
orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

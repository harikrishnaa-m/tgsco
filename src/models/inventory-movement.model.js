import mongoose from 'mongoose';

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogProduct',
      required: true,
      index: true,
    },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    movementType: {
      type: String,
      enum: [
        'restock',
        'adjustment',
        'damage',
        'return',
        'physical_count',
        'reservation',
        'reservation_release',
        'sale',
      ],
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0 },
    quantityDelta: { type: Number, required: true },
    reservedDelta: { type: Number, required: true, default: 0 },
    stockBefore: { type: Number, min: 0 },
    stockAfter: { type: Number, min: 0 },
    reservedBefore: { type: Number, min: 0 },
    reservedAfter: { type: Number, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    note: { type: String, trim: true, maxlength: 2000 },
    referenceType: { type: String, trim: true, maxlength: 50 },
    referenceId: { type: String, trim: true, maxlength: 150 },
    supplierName: { type: String, trim: true, maxlength: 200 },
    supplierInvoiceNumber: { type: String, trim: true, maxlength: 100 },
    unitCost: { type: Number, min: 0 },
    receivedAt: Date,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

inventoryMovementSchema.index({ product: 1, createdAt: -1 });
inventoryMovementSchema.index({ movementType: 1, createdAt: -1 });

export const InventoryMovement =
  mongoose.models.InventoryMovement || mongoose.model('InventoryMovement', inventoryMovementSchema);

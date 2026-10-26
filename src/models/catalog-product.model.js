import mongoose from 'mongoose';

const bulkPriceSchema = new mongoose.Schema(
  {
    minimumQuantity: { type: Number, required: true, min: 1 },
    maximumQuantity: { type: Number, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const productImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, trim: true },
  },
  { _id: false },
);

const catalogProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogCategory', required: true },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CatalogCategory' }],
    categorySlug: { type: String, required: true, lowercase: true, trim: true },
    type: { type: String, lowercase: true, trim: true },
    categorySlugs: { type: [String], default: [] },
    types: { type: [String], lowercase: true, trim: true, default: [] },
    shortDescription: { type: String, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    discountPercent: { type: Number, min: 0, max: 100 },
    currency: { type: String, default: 'INR', trim: true },
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    reservedQuantity: { type: Number, required: true, min: 0, default: 0 },
    active: { type: Boolean, default: true },
    mainImage: { type: productImageSchema, default: null },
    galleryImages: { type: [productImageSchema], default: [] },
    images: { type: [productImageSchema], default: [] },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    bulkPricing: { type: [bulkPriceSchema], default: [] },
    overview: { type: String, trim: true },
    craftStory: { type: String, trim: true },
    materialCare: { type: String, trim: true },
    shippingReturns: { type: String, trim: true },
  },
  { timestamps: true },
);

catalogProductSchema.index({ active: 1, type: 1, categorySlug: 1 });
catalogProductSchema.index({ name: 'text', description: 'text', sku: 'text' });

export const CatalogProduct =
  mongoose.models.CatalogProduct || mongoose.model('CatalogProduct', catalogProductSchema);

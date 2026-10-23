import mongoose from 'mongoose';

const catalogCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: ['weaves', 'occasions', 'fabric'], required: true },
    description: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    image: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const CatalogCategory =
  mongoose.models.CatalogCategory ||
  mongoose.model('CatalogCategory', catalogCategorySchema);

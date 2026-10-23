import mongoose from 'mongoose';

const catalogGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const CatalogGroup =
  mongoose.models.CatalogGroup || mongoose.model('CatalogGroup', catalogGroupSchema);

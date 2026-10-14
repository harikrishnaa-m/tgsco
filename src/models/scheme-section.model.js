import mongoose from 'mongoose';

const schemeSectionSchema = new mongoose.Schema(
  {
    section: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    images: {
      type: [
        {
          field: { type: String, required: true },
          url: { type: String, required: true },
          key: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export const SchemeSection =
  mongoose.models.SchemeSection || mongoose.model('SchemeSection', schemeSectionSchema);

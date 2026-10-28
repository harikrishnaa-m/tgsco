import mongoose from 'mongoose';

const newsSectionSchema = new mongoose.Schema(
  {
    section: { type: String, required: true, unique: true, lowercase: true, trim: true },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
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
  { timestamps: true },
);

export const NewsSection =
  mongoose.models.NewsSection || mongoose.model('NewsSection', newsSectionSchema);

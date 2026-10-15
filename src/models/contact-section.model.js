import mongoose from 'mongoose';

const contactSectionSchema = new mongoose.Schema(
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

export const ContactSection =
  mongoose.models.ContactSection || mongoose.model('ContactSection', contactSectionSchema);

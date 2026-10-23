import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: false,
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'customer', 'merchant'],
      default: 'editor',
      required: true,
    },
    name: { type: String, trim: true },
    mobile: { type: String, unique: true, sparse: true, trim: true },
    facebookId: { type: String, unique: true, sparse: true, trim: true },
    isVerified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);

import mongoose from 'mongoose';

const socialRegistrationSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['google', 'facebook'], required: true },
    providerId: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true },
    name: { type: String, trim: true },
  },
  { _id: false },
);

const socialLoginHandoffSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registration: { type: socialRegistrationSchema },
    rememberMe: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

socialLoginHandoffSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SocialLoginHandoff =
  mongoose.models.SocialLoginHandoff ||
  mongoose.model('SocialLoginHandoff', socialLoginHandoffSchema);

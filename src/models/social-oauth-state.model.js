import mongoose from 'mongoose';

const socialOAuthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true, unique: true },
    provider: { type: String, enum: ['google', 'facebook'], required: true },
    role: { type: String, enum: ['customer', 'merchant'] },
    rememberMe: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

socialOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SocialOAuthState =
  mongoose.models.SocialOAuthState || mongoose.model('SocialOAuthState', socialOAuthStateSchema);

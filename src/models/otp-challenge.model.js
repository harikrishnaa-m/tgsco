import mongoose from 'mongoose';

const otpChallengeSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    role: { type: String, enum: ['customer', 'merchant'] },
    name: { type: String, trim: true },
    passwordHash: { type: String },
    rememberMe: { type: Boolean, default: false },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge =
  mongoose.models.OtpChallenge || mongoose.model('OtpChallenge', otpChallengeSchema);

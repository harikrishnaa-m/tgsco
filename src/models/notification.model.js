import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ['admin', 'customer', 'merchant'],
      required: true,
    },
    type: { type: String, required: true, trim: true, maxlength: 100 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    eventKey: { type: String, required: true, maxlength: 200 },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, eventKey: 1 }, { unique: true });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

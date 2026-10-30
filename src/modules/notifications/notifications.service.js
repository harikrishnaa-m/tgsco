import { AppError } from '../../errors/app-error.js';
import { Notification } from '../../models/notification.model.js';
import { User } from '../../models/user.model.js';

export async function notifyUser(userId, role, { type, title, message, data = {}, eventKey }) {
  if (!userId || !['admin', 'customer', 'merchant'].includes(role)) return;
  await Notification.updateOne(
    { recipient: userId, eventKey },
    {
      $setOnInsert: {
        recipient: userId,
        recipientRole: role,
        type,
        title,
        message,
        data,
        eventKey,
      },
    },
    { upsert: true },
  );
}

export async function notifyAdmins(notification) {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  await Promise.all(admins.map((admin) => notifyUser(admin._id, 'admin', notification)));
}

export async function notifyOrderOwner(order, notification) {
  const owner = await User.findById(order.user).select('_id role').lean();
  if (owner && ['customer', 'merchant'].includes(owner.role)) {
    await notifyUser(owner._id, owner.role, notification);
  }
}

export async function listNotifications(user, query) {
  const filter = { recipient: user.sub };
  if (query.status === 'unread') filter.readAt = null;
  if (query.status === 'read') filter.readAt = { $ne: null };
  if (query.type) filter.type = query.type;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: user.sub, readAt: null }),
  ]);
  return {
    items,
    total,
    unread,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(total / query.limit),
  };
}

export async function getUnreadNotificationCount(user) {
  return { unread: await Notification.countDocuments({ recipient: user.sub, readAt: null }) };
}

export async function markNotificationRead(user, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: user.sub, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();
  if (notification) return notification;

  const existing = await Notification.findOne({
    _id: notificationId,
    recipient: user.sub,
  }).lean();
  if (existing) return existing;
  throw new AppError('The notification was not found.', {
    statusCode: 404,
    code: 'NOTIFICATION_NOT_FOUND',
  });
}

export async function markAllNotificationsRead(user) {
  const result = await Notification.updateMany(
    { recipient: user.sub, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { modifiedCount: result.modifiedCount };
}

export async function deleteNotification(user, notificationId) {
  const result = await Notification.deleteOne({ _id: notificationId, recipient: user.sub });
  if (result.deletedCount !== 1) {
    throw new AppError('The notification was not found.', {
      statusCode: 404,
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }
  return { message: 'Notification deleted.' };
}

export async function deleteReadNotifications(user) {
  const result = await Notification.deleteMany({ recipient: user.sub, readAt: { $ne: null } });
  return { deletedCount: result.deletedCount };
}

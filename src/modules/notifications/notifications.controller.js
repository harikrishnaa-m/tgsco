import * as service from './notifications.service.js';
import * as validation from './notifications.validation.js';
import { AppError } from '../../errors/app-error.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('Notification request is invalid.', {
      statusCode: 400,
      code: 'INVALID_NOTIFICATION_REQUEST',
      details: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export const list = async (req, res) =>
  res.json({
    success: true,
    data: await service.listNotifications(req.user, parse(validation.notificationQuery, req.query)),
  });

export const unreadCount = async (req, res) =>
  res.json({ success: true, data: await service.getUnreadNotificationCount(req.user) });

export const markRead = async (req, res) =>
  res.json({
    success: true,
    data: await service.markNotificationRead(
      req.user,
      parse(validation.notificationId, req.params.id),
    ),
  });

export const markAllRead = async (req, res) =>
  res.json({ success: true, data: await service.markAllNotificationsRead(req.user) });

export const remove = async (req, res) =>
  res.json({
    success: true,
    data: await service.deleteNotification(
      req.user,
      parse(validation.notificationId, req.params.id),
    ),
  });

export const removeRead = async (req, res) =>
  res.json({ success: true, data: await service.deleteReadNotifications(req.user) });

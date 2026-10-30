import { Router } from 'express';

import * as controller from './notifications.controller.js';
import { requireNotificationUser } from './notifications.middleware.js';

const router = Router();

router.use(requireNotificationUser);
router.get('/', controller.list);
router.get('/unread-count', controller.unreadCount);
router.patch('/read-all', controller.markAllRead);
router.delete('/read', controller.removeRead);
router.patch('/:id/read', controller.markRead);
router.delete('/:id', controller.remove);

export default router;

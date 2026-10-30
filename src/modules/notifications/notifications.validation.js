import { z } from 'zod';

export const notificationQuery = z.object({
  status: z.enum(['all', 'unread', 'read']).default('all'),
  type: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationId = z.string().regex(/^[a-f\d]{24}$/i);

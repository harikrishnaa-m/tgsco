import { z } from 'zod';

const mobile = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Please provide a valid mobile number.');

export const profileUpdateSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().email('Please provide a valid email address.').optional(),
    mobile: mobile.optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined || value.mobile !== undefined,
    'Provide at least one profile field to update.',
  );

export const passwordUpdateSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: z.string().min(8, 'New password must contain at least 8 characters.'),
    confirmNewPassword: z.string().min(1, 'Confirm new password is required.'),
  })
  .refine((value) => value.newPassword === value.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'New passwords must match.',
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password.',
  });

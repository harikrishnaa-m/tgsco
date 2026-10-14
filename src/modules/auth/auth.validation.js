import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.'),
  password: z.string().min(1, 'Please provide your password.'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Please provide a refresh token.'),
});

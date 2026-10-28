import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Please provide a valid email address.'),
  password: z.string().min(1, 'Please provide your password.'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Please provide a refresh token.'),
});

const mobileSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Please provide a valid mobile number.');

export const requestOtpSchema = z.object({
  mobile: mobileSchema,
  email: z.string().trim().email('Please provide a valid email address.').optional(),
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().min(8).optional(),
  rememberMe: z.boolean().default(false),
});

export const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must contain exactly 6 digits.'),
  rememberMe: z.boolean().default(false),
});

export const passwordLoginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
});

export const roleSelectionSchema = z.object({
  role: z.enum(['customer', 'merchant']),
  registrationToken: z.string().min(1),
  email: z.string().trim().email('Please provide a valid email address.').optional(),
});

export const socialLoginSchema = z.object({
  code: z.string().trim().min(1),
  role: z.enum(['customer', 'merchant']).optional(),
  rememberMe: z.boolean().default(false),
});

export const socialStartSchema = z.object({
  role: z.enum(['customer', 'merchant']).optional(),
});

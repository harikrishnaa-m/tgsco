import { z } from 'zod';

export const contactInquirySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(1).max(30),
  message: z.string().trim().min(1).max(5000),
});

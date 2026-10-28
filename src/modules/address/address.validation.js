import { z } from 'zod';

const indianMobile = z
  .string()
  .trim()
  .regex(/^(?:\+91[- ]?)?[6-9]\d{9}$/, 'Please provide a valid Indian mobile number.');
const addressId = z.string().regex(/^[a-f\d]{24}$/i, 'Please provide a valid address ID.');

export const addressSchema = z.object({
  label: z.enum(['home', 'work', 'other']).default('home'),
  recipientName: z.string().trim().min(2).max(100),
  mobile: indianMobile,
  alternateMobile: indianMobile.optional(),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  locality: z.string().trim().min(2).max(100),
  landmark: z.string().trim().max(150).optional(),
  city: z.string().trim().min(2).max(100),
  district: z.string().trim().max(100).optional(),
  state: z.string().trim().min(2).max(100),
  stateCode: z.string().trim().max(3).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Please provide a valid six-digit Indian PIN code.'),
  country: z.string().trim().default('India'),
  deliveryInstructions: z.string().trim().max(300).optional(),
  isDefault: z.boolean().default(false),
});

export const updateAddressSchema = addressSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Please provide at least one address field to update.',
  );

export { addressId };

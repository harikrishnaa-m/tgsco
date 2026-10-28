import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Please provide a valid ID.');

export const checkoutOrderSchema = z.object({
  shippingAddressId: objectId,
  billingAddressId: objectId.optional(),
  paymentMethod: z.enum(['cod', 'razorpay']),
});

export const paymentVerificationSchema = z.object({
  orderId: objectId,
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const orderIdSchema = objectId;
export const cancellationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Cancellation reason is required.')
    .max(500, 'Cancellation reason cannot exceed 500 characters.'),
});

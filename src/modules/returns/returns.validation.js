import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Provide a valid MongoDB ObjectId.');
const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Provide a valid Indian IFSC code.');
const accountNumber = z
  .string()
  .trim()
  .regex(/^\d{9,18}$/, 'Account number must contain 9 to 18 digits.');
const refundMethodFields = {
  method: z.enum(['upi', 'bank_transfer']),
  upiId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, 'Provide a valid UPI ID.')
    .optional(),
  confirmUpiId: z.string().trim().toLowerCase().optional(),
  accountHolderName: z.string().trim().min(2).max(150).optional(),
  accountNumber: accountNumber.optional(),
  confirmAccountNumber: z.string().trim().optional(),
  ifscCode: ifsc.optional(),
  confirmIfscCode: z.string().trim().toUpperCase().optional(),
  bankName: z.string().trim().min(2).max(150).optional(),
  branchName: z.string().trim().min(2).max(150).optional(),
  accountType: z.enum(['savings', 'current']).optional(),
  label: z.string().trim().max(100).optional(),
  isDefault: z.boolean().optional(),
};
const validateRefundMethod = (value, ctx) => {
  if (value.method === 'upi') {
    if (!value.upiId)
      ctx.addIssue({ code: 'custom', path: ['upiId'], message: 'UPI ID is required.' });
    if (!value.confirmUpiId)
      ctx.addIssue({
        code: 'custom',
        path: ['confirmUpiId'],
        message: 'Confirm UPI ID is required.',
      });
    if (value.upiId && value.confirmUpiId && value.upiId !== value.confirmUpiId) {
      ctx.addIssue({ code: 'custom', path: ['confirmUpiId'], message: 'UPI IDs must match.' });
    }
  }
  if (value.method === 'bank_transfer') {
    for (const field of [
      'accountHolderName',
      'accountNumber',
      'confirmAccountNumber',
      'ifscCode',
      'confirmIfscCode',
      'bankName',
      'branchName',
      'accountType',
    ]) {
      if (!value[field])
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for bank transfer.`,
        });
    }
    if (
      value.accountNumber &&
      value.confirmAccountNumber &&
      value.accountNumber !== value.confirmAccountNumber
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmAccountNumber'],
        message: 'Account numbers must match.',
      });
    }
    if (value.ifscCode && value.confirmIfscCode && value.ifscCode !== value.confirmIfscCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmIfscCode'],
        message: 'IFSC codes must match.',
      });
    }
  }
};
export const refundMethodBody = z.object(refundMethodFields).superRefine(validateRefundMethod);
export const orderId = id;
export const returnId = id;
export const createBody = z.object({
  items: z
    .array(
      z.object({
        productId: id,
        quantity: z.number().int().positive('Quantity must be greater than zero.'),
      }),
    )
    .min(1, 'At least one product is required.'),
  reason: z.string().trim().min(1, 'Return reason is required.').max(500),
  customerNote: z.string().trim().max(2000).optional(),
  pickupAddressId: id,
  refundMethodId: id.optional(),
});
export const query = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.string().trim().optional(),
    reason: z.string().trim().max(500).optional(),
    paymentMethod: z.enum(['cod', 'razorpay']).optional(),
    paymentStatus: z.string().trim().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((v, c) => {
    if (v.from && v.to && v.from > v.to)
      c.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'from must be earlier than or equal to to',
      });
  });
export const statusBody = z.object({
  status: z.enum([
    'approved',
    'rejected',
    'pickup_pending',
    'received',
    'inspection_pending',
    'approved_for_refund',
    'refund_pending',
    'refunded',
    'completed',
    'cancelled',
  ]),
  message: z.string().trim().max(1000).optional(),
  refundAmount: z.number().positive().optional(),
  refundMethod: z.enum(['upi', 'bank_transfer']).optional(),
  refundReference: z.string().trim().min(3).max(150).optional(),
  refundProcessedAt: z.coerce.date().optional(),
  refundNotes: z.string().trim().max(1000).optional(),
});
export const cancelBody = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Cancellation reason is required.')
    .max(500, 'Cancellation reason cannot exceed 500 characters.'),
});

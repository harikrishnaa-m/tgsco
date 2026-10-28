import { z } from 'zod';

const id = z
  .string({ error: 'An order or setting ID is required.' })
  .regex(/^[a-f\d]{24}$/i, 'Use a valid MongoDB ObjectId.');
const nonEmpty = (label) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} cannot be empty.`);
const address = z.object({
  line1: nonEmpty('Seller address line 1'),
  line2: z.string().trim().optional(),
  city: nonEmpty('Seller city'),
  state: nonEmpty('Seller state'),
  postalCode: z
    .string()
    .regex(/^\d{6}$/, 'Seller postal code must be a six-digit Indian PIN code.'),
  country: z.string().trim().min(2).default('India'),
});

export const orderQuery = z
  .object({
    search: z.string().trim().max(100, 'Search text cannot exceed 100 characters.').optional(),
    status: z.string().trim().optional(),
    paymentStatus: z.string().trim().optional(),
    from: z.coerce.date({ error: 'The from date must be a valid date.' }).optional(),
    to: z.coerce.date({ error: 'The to date must be a valid date.' }).optional(),
    sort: z
      .enum(['newest', 'oldest', 'total'], { error: 'Sort must be newest, oldest, or total.' })
      .default('newest'),
    page: z.coerce
      .number({ error: 'Page must be a positive whole number.' })
      .int()
      .positive()
      .default(1),
    limit: z.coerce
      .number({ error: 'Limit must be a whole number from 1 to 100.' })
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to)
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'The from date must be earlier than or equal to the to date.',
      });
  });
export const orderId = id;
export const statusBody = z.object({
  status: nonEmpty('Order status'),
  message: z.string().trim().max(500, 'Status message cannot exceed 500 characters.').optional(),
});
export const shipmentBody = z
  .object({
    courier: z.string().trim().max(100, 'Courier name cannot exceed 100 characters.').optional(),
    trackingNumber: z
      .string()
      .trim()
      .max(150, 'Tracking number cannot exceed 150 characters.')
      .optional(),
    status: z.string().trim().max(50, 'Shipment status cannot exceed 50 characters.').optional(),
    shippedAt: z.coerce.date({ error: 'shippedAt must be a valid date.' }).optional(),
    estimatedDeliveryAt: z.coerce
      .date({ error: 'estimatedDeliveryAt must be a valid date.' })
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      !value.courier &&
      !value.trackingNumber &&
      !value.status &&
      !value.shippedAt &&
      !value.estimatedDeliveryAt
    ) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: 'Provide at least one shipment field to update.',
      });
    }
  });
export const noteBody = z.object({
  message: nonEmpty('Note message').max(2000, 'Note message cannot exceed 2000 characters.'),
});
export const cancelBody = z.object({
  reason: nonEmpty('Cancellation reason').max(
    1000,
    'Cancellation reason cannot exceed 1000 characters.',
  ),
  refund: z
    .object({
      amount: z
        .number({ error: 'Refund amount must be a number.' })
        .nonnegative('Refund amount cannot be negative.')
        .optional(),
      status: z
        .enum(['requested', 'processed', 'not_required'], { error: 'Refund status is invalid.' })
        .optional(),
      reference: z
        .string()
        .trim()
        .max(150, 'Refund reference cannot exceed 150 characters.')
        .optional(),
    })
    .strict()
    .optional(),
});
export const refundBody = z.object({
  amount: z
    .number({ error: 'Refund amount must be a number.' })
    .positive('Refund amount must be greater than zero.'),
  reason: z.string().trim().max(500, 'Refund reason cannot exceed 500 characters.').optional(),
  notes: z.record(z.string(), z.any()).optional(),
});
export const refundId = z
  .string({ error: 'A Razorpay refund ID is required.' })
  .trim()
  .regex(/^rfnd_[A-Za-z0-9]+$/, 'Provide a valid Razorpay refund ID.');
export const invoiceBody = z.object({
  legalBusinessName: nonEmpty('Legal business name').max(200),
  displayBusinessName: z.string().trim().max(200).optional(),
  sellerAddress: address,
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9A-Z]{15}$/, 'GSTIN must be a valid 15-character GSTIN.')
    .optional(),
  pan: z
    .string()
    .trim()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must be a valid 10-character PAN.')
    .optional(),
  contact: z.record(z.string(), z.any()).optional(),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{1,12}$/, 'Invoice prefix must contain only letters, numbers, or hyphens.')
    .optional(),
  financialYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, 'Financial year must use YYYY-YY format.')
    .optional(),
  nextSequence: z
    .number({ error: 'Next invoice sequence must be a number.' })
    .int()
    .positive()
    .optional(),
  terms: z.string().trim().max(5000).optional(),
  returnsPolicy: z.string().trim().max(5000).optional(),
  signatory: z.record(z.string(), z.any()).optional(),
  bankDetails: z.record(z.string(), z.any()).optional(),
  active: z.boolean().optional(),
});
export const chargeBody = z
  .object({
    type: z.enum(['shipping', 'packing'], { error: 'Charge type must be shipping or packing.' }),
    code: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9_-]{2,50}$/,
        'Charge code must be 2-50 lowercase letters, numbers, underscores, or hyphens.',
      ),
    name: nonEmpty('Charge name').max(150),
    active: z.boolean().optional(),
    method: z
      .enum(['flat', 'percentage'], { error: 'Charge method must be flat or percentage.' })
      .default('flat'),
    amount: z
      .number({ error: 'Charge amount must be a number.' })
      .nonnegative('Charge amount cannot be negative.')
      .optional(),
    percentage: z
      .number({ error: 'Charge percentage must be a number.' })
      .min(0)
      .max(100, 'Charge percentage cannot exceed 100.')
      .optional(),
    freeAbove: z
      .number({ error: 'freeAbove must be a number.' })
      .nonnegative('freeAbove cannot be negative.')
      .optional(),
    taxable: z.boolean().optional(),
    taxRate: z
      .number({ error: 'Tax rate must be a number.' })
      .min(0)
      .max(100, 'Tax rate cannot exceed 100.')
      .default(0),
    conditions: z.record(z.string(), z.any()).optional(),
  })
  .superRefine((value, context) => {
    if (value.method === 'flat' && value.amount === undefined)
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'A flat charge requires amount.',
      });
    if (value.method === 'percentage' && value.percentage === undefined)
      context.addIssue({
        code: 'custom',
        path: ['percentage'],
        message: 'A percentage charge requires percentage.',
      });
    if (!value.taxable && value.taxRate > 0)
      context.addIssue({
        code: 'custom',
        path: ['taxRate'],
        message: 'Set taxable to true before configuring a tax rate.',
      });
  });
export const orderPoliciesBody = z.object({
  cancellationAllowedUntil: z
    .enum(['pending_payment', 'confirmed', 'processing', 'shipped'], {
      error: 'Cancellation policy must be pending_payment, confirmed, processing, or shipped.',
    })
    .default('shipped'),
  returnWindowDays: z
    .number({ error: 'Return window must be a whole number of days.' })
    .int('Return window must be a whole number of days.')
    .min(0)
    .max(365)
    .default(7),
});

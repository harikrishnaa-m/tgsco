import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Provide a valid product ID.');
const quantity = z.number().int().positive('Quantity must be greater than zero.');
const reason = z.string().trim().min(1, 'A stock movement reason is required.').max(500);

export const productId = id;
export const inventoryQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  sort: z.enum(['newest', 'oldest', 'name', 'stock-asc', 'stock-desc']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const movementQuery = z
  .object({
    movementType: z
      .enum([
        'restock',
        'adjustment',
        'damage',
        'return',
        'physical_count',
        'reservation',
        'reservation_release',
        'sale',
      ])
      .optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'from must be earlier than or equal to to',
      });
    }
  });
export const adjustBody = z.object({
  direction: z.enum(['increase', 'decrease']),
  quantity,
  reason,
  note: z.string().trim().max(2000).optional(),
  referenceType: z.string().trim().max(50).optional(),
  referenceId: z.string().trim().max(150).optional(),
});
export const restockBody = z.object({
  quantity,
  reason,
  note: z.string().trim().max(2000).optional(),
  supplierName: z.string().trim().max(200).optional(),
  supplierInvoiceNumber: z.string().trim().max(100).optional(),
  unitCost: z.number().nonnegative().optional(),
  receivedAt: z.coerce.date().optional(),
  referenceId: z.string().trim().max(150).optional(),
});
export const damageBody = z.object({
  quantity,
  reason,
  note: z.string().trim().max(2000).optional(),
  referenceId: z.string().trim().max(150).optional(),
});
export const returnBody = z.object({
  quantity,
  reason,
  note: z.string().trim().max(2000).optional(),
  returnId: id.optional(),
});
export const reconcileBody = z.object({
  physicalQuantity: z.number().int().nonnegative(),
  reason,
  note: z.string().trim().max(2000).optional(),
});

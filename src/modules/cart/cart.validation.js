import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Please provide a valid product ID.');

export const cartItemSchema = z.object({
  productId: objectId,
  quantity: z.number().int().positive(),
});

export const mergeCartSchema = z.object({
  items: z.array(cartItemSchema),
});

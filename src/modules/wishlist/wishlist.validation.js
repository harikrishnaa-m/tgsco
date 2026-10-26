import { z } from 'zod';

export const wishlistProductSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Please provide a valid product ID.'),
});

export const mergeWishlistSchema = z.object({
  productIds: z.array(wishlistProductSchema.shape.productId),
});

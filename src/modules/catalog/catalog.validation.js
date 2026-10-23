import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Please provide valid category IDs.');
const productImageSchema = z.object({
  url: z.string().trim().min(1),
  alt: z.string().trim().optional(),
});

const bulkPriceSchema = z.object({
  minimumQuantity: z.number().int().positive(),
  maximumQuantity: z.number().int().positive().optional(),
  price: z.number().nonnegative(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  groupId: objectIdSchema.optional(),
  description: z.string().trim().optional(),
  subtitle: z.string().trim().optional(),
  image: z.string().trim().optional(),
  active: z.boolean().optional(),
});

export const categoryQuerySchema = z.object({
  type: z.string().trim().min(1).optional(),
  groupId: objectIdSchema.optional(),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().optional(),
  image: z.string().trim().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sku: z.string().trim().min(1),
  categoryIds: z.array(objectIdSchema).min(1).optional(),
  categorySlug: z.string().trim().min(1).optional(),
  categorySlugs: z.array(z.string().trim().min(1)).min(1).optional(),
  type: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  types: z.array(z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).optional(),
  shortDescription: z.string().trim().optional(),
  description: z.string().trim().optional(),
  price: z.number().nonnegative(),
  originalPrice: z.number().nonnegative().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  currency: z.string().trim().default('INR'),
  stockQuantity: z.number().int().nonnegative(),
  active: z.boolean().optional(),
  mainImage: productImageSchema.nullable().optional(),
  galleryImages: z.array(productImageSchema).default([]),
  images: z.array(productImageSchema).default([]),
  attributes: z.record(z.string(), z.unknown()).default({}),
  bulkPricing: z.array(bulkPriceSchema).default([]),
  overview: z.string().trim().optional(),
  craftStory: z.string().trim().optional(),
  materialCare: z.string().trim().optional(),
  shippingReturns: z.string().trim().optional(),
}).refine(
  (value) => value.categoryIds?.length || value.categorySlug || value.categorySlugs?.length,
  'Provide at least one category ID or category slug.',
).refine(
  (value) => value.type || value.types?.length || value.categoryIds?.length,
  'Provide at least one catalogue group or category.',
);

const multiValueQuerySchema = z.preprocess(
  (value) =>
    value
      ? (Array.isArray(value) ? value : [value]).flatMap((entry) => entry.split(','))
      : undefined,
  z.array(z.string().trim().min(1)).optional(),
);
const multiObjectIdQuerySchema = z.preprocess(
  (value) =>
    value
      ? (Array.isArray(value) ? value : [value]).flatMap((entry) => entry.split(','))
      : undefined,
  z.array(objectIdSchema).optional(),
);

export const productQuerySchema = z.object({
  category: z.string().trim().optional(),
  categoryId: objectIdSchema.optional(),
  categoryIds: multiObjectIdQuerySchema,
  type: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  handloomType: multiValueQuerySchema,
  weaveCraft: multiValueQuerySchema,
  color: multiValueQuerySchema,
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['newest', 'price-asc', 'price-desc', 'name']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(48).default(12),
});

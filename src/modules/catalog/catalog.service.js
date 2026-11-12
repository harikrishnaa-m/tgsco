import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

import { AppError } from '../../errors/app-error.js';
import { CatalogCategory } from '../../models/catalog-category.model.js';
import { CatalogGroup } from '../../models/catalog-group.model.js';
import { CatalogProduct } from '../../models/catalog-product.model.js';
import { uploadHomeImages } from '../home-content/home-content.upload.js';

function slugify(value) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

async function resolveSlug(Model, content, id, existing) {
  if (content.slug) return content.slug;

  const current = existing || (id ? await Model.findById(id).select('name slug').lean() : null);
  if (current?.name === content.name) return current.slug;

  const baseSlug = slugify(content.name);
  let slug = baseSlug;
  let suffix = 2;
  while (await Model.exists({ slug, ...(id ? { _id: { $ne: id } } : {}) })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function resolveUniqueProductValue(field, baseValue, reservedValues = new Set()) {
  const base = baseValue || 'item';
  let value = base;
  let suffix = 2;
  const isInUse = async (candidate) => {
    const filter =
      field === 'sku'
        ? { sku: { $regex: `^${candidate}$`, $options: 'i' } }
        : { [field]: candidate };
    return CatalogProduct.exists(filter);
  };
  while (reservedValues.has(value) || (await isInUse(value))) {
    value = `${base}-${suffix}`;
    suffix += 1;
  }
  reservedValues.add(value);
  return value;
}

async function resolveSku(content, id, existing) {
  if (content.sku) {
    const sku = slugify(content.sku).toUpperCase();
    const duplicate = await CatalogProduct.exists({
      sku: { $regex: `^${sku}$`, $options: 'i' },
      ...(id ? { _id: { $ne: id } } : {}),
    });
    if (duplicate) {
      throw new AppError(`The SKU "${sku}" is already in use.`, {
        statusCode: 409,
        code: 'DUPLICATE_SKU',
      });
    }
    return sku;
  }
  if (existing?.sku) return existing.sku;
  const size = content.attributes?.size;
  const baseSku = slugify(`${content.name}${size ? `-${size}` : ''}`).toUpperCase();
  return resolveUniqueProductValue('sku', baseSku);
}

function parseContent(req) {
  const raw = req.body.content || req.body.data;
  if (!raw) {
    const content = { ...req.body };
    const jsonFields = [
      'categoryIds',
      'categorySlugs',
      'types',
      'attributes',
      'bulkPricing',
      'sizes',
    ];
    try {
      for (const field of jsonFields) {
        if (typeof content[field] === 'string') content[field] = JSON.parse(content[field]);
      }
    } catch {
      throw new AppError('A catalogue JSON form-data field is invalid.', {
        statusCode: 400,
        code: 'INVALID_CATALOG_FORM_DATA',
      });
    }
    for (const field of [
      'price',
      'originalPrice',
      'discountPercent',
      'stockQuantity',
      'lowStockThreshold',
      'reorderQuantity',
      'sortOrder',
    ]) {
      if (content[field] !== undefined) content[field] = Number(content[field]);
    }
    if (content.active !== undefined) content.active = content.active === 'true';
    return content;
  }
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError('The content field must contain valid JSON.', {
      statusCode: 400,
      code: 'INVALID_CATALOG_CONTENT',
    });
  }
}

function setNestedValue(target, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = target;

  for (const [index, part] of parts.slice(0, -1).entries()) {
    if (current[part] === undefined || current[part] === null) {
      current[part] = /^\d+$/.test(parts[index + 1]) ? [] : {};
    }
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function applyImages(content, images) {
  const result = structuredClone(content);
  let galleryIndex = 0;
  const sizeGalleryIndexes = new Map();
  for (const image of images) {
    if (image.field === 'mainImage') {
      setNestedValue(result, 'mainImage.url', image.url);
    } else if (image.field === 'galleryImages') {
      setNestedValue(result, `galleryImages[${galleryIndex}].url`, image.url);
      galleryIndex += 1;
    } else if (/^sizes\[\d+\]\.mainImage(?:\.url)?$/.test(image.field)) {
      setNestedValue(result, `${image.field.replace(/\.url$/, '')}.url`, image.url);
    } else if (/^sizes\[\d+\]\.galleryImages$/.test(image.field)) {
      const sizeIndex = Number(image.field.match(/^sizes\[(\d+)\]/)[1]);
      const galleryIndexForSize = sizeGalleryIndexes.get(sizeIndex) || 0;
      setNestedValue(
        result,
        `sizes[${sizeIndex}].galleryImages[${galleryIndexForSize}].url`,
        image.url,
      );
      sizeGalleryIndexes.set(sizeIndex, galleryIndexForSize + 1);
    } else if (/^sizes\[\d+\]\.galleryImages\[\d+\]\.url$/.test(image.field)) {
      setNestedValue(result, image.field, image.url);
    } else if (
      (image.field === 'mainImage.url' || image.field.startsWith('galleryImages[')) &&
      image.field.endsWith('.url')
    ) {
      setNestedValue(result, image.field, image.url);
    } else if (
      (image.field.startsWith('images[') || /^sizes\[\d+\]\.images\[/.test(image.field)) &&
      image.field.endsWith('].url')
    ) {
      setNestedValue(result, image.field, image.url);
    }
  }
  return result;
}

export function parseCatalogContent(req) {
  return parseContent(req);
}

export async function listGroups() {
  return CatalogGroup.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getGroup(id, includeInactive = false) {
  const group = await CatalogGroup.findOne({
    _id: id,
    ...(includeInactive ? {} : { active: true }),
  }).lean();
  if (!group)
    throw new AppError('The catalogue group was not found.', {
      statusCode: 404,
      code: 'CATALOG_GROUP_NOT_FOUND',
    });
  return group;
}

export async function listCategories(type, groupId) {
  const match = { active: true };
  if (type) match.type = type;
  if (groupId) match.group = new mongoose.Types.ObjectId(groupId);

  return CatalogCategory.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'catalogproducts',
        let: { categorySlug: '$slug' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$categorySlug', '$$categorySlug'] }, { $eq: ['$active', true] }],
              },
            },
          },
          { $count: 'count' },
        ],
        as: 'productStats',
      },
    },
    {
      $addFields: {
        itemCount: { $ifNull: [{ $arrayElemAt: ['$productStats.count', 0] }, 0] },
      },
    },
    { $project: { productStats: 0 } },
    { $sort: { type: 1, name: 1 } },
  ]);
}

export async function saveCategory(content, files = [], id) {
  const images = await uploadHomeImages('categories', files, 'catalog');
  const image = images.find((item) => item.field === 'image');
  const { groupId, ...categoryContent } = content;
  categoryContent.slug = await resolveSlug(CatalogCategory, categoryContent, id);
  if (groupId) {
    const group = await CatalogGroup.findOne({ _id: groupId, active: true }).lean();
    if (!group) {
      throw new AppError('The catalogue group was not found.', {
        statusCode: 400,
        code: 'CATALOG_GROUP_NOT_FOUND',
      });
    }
    categoryContent.group = group._id;
    categoryContent.type ||= group.slug;
  }
  const savedContent = {
    ...categoryContent,
    ...(image ? { image: image.url } : {}),
  };
  return id
    ? CatalogCategory.findByIdAndUpdate(id, savedContent, { new: true, runValidators: true }).lean()
    : CatalogCategory.create(savedContent);
}

export async function getCategory(id) {
  const category = await CatalogCategory.findById(id).lean();
  if (!category)
    throw new AppError('The category was not found.', {
      statusCode: 404,
      code: 'CATEGORY_NOT_FOUND',
    });
  return category;
}

export async function listAdminCategories(type, groupId) {
  const filter = {
    ...(type ? { type } : {}),
    ...(groupId ? { group: new mongoose.Types.ObjectId(groupId) } : {}),
  };
  return CatalogCategory.find(filter).sort({ type: 1, name: 1 }).lean();
}

export async function listAdminGroups() {
  return CatalogGroup.find().sort({ sortOrder: 1, name: 1 }).lean();
}

export async function saveGroup(content, files = [], id) {
  const images = await uploadHomeImages('catalog-groups', files, 'catalog');
  const image = images.find((item) => item.field === 'image');
  const savedContent = {
    ...content,
    slug: await resolveSlug(CatalogGroup, content, id),
    ...(image ? { image: image.url } : {}),
  };
  return id
    ? CatalogGroup.findByIdAndUpdate(id, savedContent, { new: true, runValidators: true }).lean()
    : CatalogGroup.create(savedContent);
}

export async function removeGroup(id) {
  const categoryCount = await CatalogCategory.countDocuments({ group: id });
  if (categoryCount) {
    throw new AppError('The catalogue group still contains categories.', {
      statusCode: 409,
      code: 'CATALOG_GROUP_NOT_EMPTY',
    });
  }
  const deleted = await CatalogGroup.findByIdAndDelete(id);
  if (!deleted) {
    throw new AppError('The catalogue group was not found.', {
      statusCode: 404,
      code: 'CATALOG_GROUP_NOT_FOUND',
    });
  }
}

export async function removeCategory(id) {
  const deleted = await CatalogCategory.findByIdAndDelete(id);
  if (!deleted)
    throw new AppError('The category was not found.', {
      statusCode: 404,
      code: 'CATEGORY_NOT_FOUND',
    });
}

export async function listProducts(query) {
  const filter = { active: true };
  const taxonomyFilters = [];
  if (query.category) {
    taxonomyFilters.push({
      $or: [{ categorySlug: query.category }, { categorySlugs: query.category }],
    });
  }

  if (query.categoryId || query.categoryIds?.length) {
    const categoryIds = query.categoryIds?.length ? query.categoryIds : [query.categoryId];
    taxonomyFilters.push({
      $or: [{ category: { $in: categoryIds } }, { categories: { $in: categoryIds } }],
    });
  }
  if (query.type) {
    taxonomyFilters.push({
      $or: [{ type: query.type }, { types: query.type }],
    });
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }
  if (query.handloomType) filter['attributes.handloomType'] = { $in: query.handloomType };
  if (query.color) {
    taxonomyFilters.push({
      $or: [{ color: { $in: query.color } }, { 'attributes.colour': { $in: query.color } }],
    });
  }
  if (query.weaveCraft) {
    taxonomyFilters.push({
      $or: [
        { 'attributes.weave': { $in: query.weaveCraft } },
        { 'attributes.fabric': { $in: query.weaveCraft } },
      ],
    });
  }
  if (taxonomyFilters.length) filter.$and = taxonomyFilters;
  if (query.search) filter.$text = { $search: query.search };

  const sort = {
    newest: { createdAt: -1 },
    'price-asc': { price: 1 },
    'price-desc': { price: -1 },
    name: { name: 1 },
  }[query.sort];
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    CatalogProduct.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    CatalogProduct.countDocuments(filter),
  ]);
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function getProductFilterOptions(query) {
  const filter = { active: true };
  const taxonomyFilters = [];
  if (query.category) {
    taxonomyFilters.push({
      $or: [{ categorySlug: query.category }, { categorySlugs: query.category }],
    });
  }
  if (query.categoryId || query.categoryIds?.length) {
    const categoryIds = query.categoryIds?.length ? query.categoryIds : [query.categoryId];
    const objectIds = categoryIds.map((id) => new mongoose.Types.ObjectId(id));
    taxonomyFilters.push({
      $or: [{ category: { $in: objectIds } }, { categories: { $in: objectIds } }],
    });
  }
  if (query.type) {
    taxonomyFilters.push({
      $or: [{ type: query.type }, { types: query.type }],
    });
  }
  if (taxonomyFilters.length) filter.$and = taxonomyFilters;

  const [handloomType, weave, fabric, legacyColors, productColors, priceBounds] = await Promise.all(
    [
      CatalogProduct.distinct('attributes.handloomType', filter),
      CatalogProduct.distinct('attributes.weave', filter),
      CatalogProduct.distinct('attributes.fabric', filter),
      CatalogProduct.distinct('attributes.colour', filter),
      CatalogProduct.distinct('color', filter),
      CatalogProduct.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            min: { $min: '$price' },
            max: { $max: '$price' },
          },
        },
      ]),
    ],
  );

  const price = priceBounds[0] || { min: null, max: null };
  return {
    handloomType: handloomType.filter(Boolean).sort(),
    weaveCraft: [...new Set([...weave, ...fabric].filter(Boolean))].sort(),
    color: [...new Set([...legacyColors, ...productColors].filter(Boolean))].sort(),
    price: { min: price.min, max: price.max },
  };
}

export async function getProduct(slug) {
  const product = await CatalogProduct.findOne({ slug, active: true }).lean();
  if (!product)
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  return product;
}

export async function getPublicProduct(identifier) {
  const filter = mongoose.isValidObjectId(identifier)
    ? { _id: identifier, active: true }
    : { slug: identifier, active: true };
  const product = await CatalogProduct.findOne(filter).lean();
  if (!product)
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  const associatedProducts = product.productGroup
    ? await CatalogProduct.find({
        productGroup: product.productGroup,
        active: true,
        _id: { $ne: product._id },
      })
        .select('_id attributes.size')
        .sort({ 'attributes.size': 1 })
        .lean()
    : [];
  return {
    ...product,
    associatedProducts: associatedProducts.map((item) => ({
      id: item._id,
      size: item.attributes?.size ?? null,
    })),
  };
}

export async function getAdminProduct(id) {
  const product = await CatalogProduct.findById(id).populate('categories').lean();
  if (!product)
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  const associatedProducts = product.productGroup
    ? await CatalogProduct.find({
        productGroup: product.productGroup,
        _id: { $ne: product._id },
      })
        .select('_id attributes.size')
        .sort({ 'attributes.size': 1 })
        .lean()
    : [];
  return {
    ...product,
    associatedProducts: associatedProducts.map((item) => ({
      id: item._id,
      size: item.attributes?.size ?? null,
    })),
  };
}

export async function listAdminProducts() {
  return CatalogProduct.find().populate('categories').sort({ createdAt: -1 }).lean();
}

async function resolveProductCategories(content) {
  let categories;
  if (content.categoryIds?.length) {
    categories = await CatalogCategory.find({
      _id: { $in: content.categoryIds },
      active: true,
    }).lean();
  } else {
    const categorySlugs = content.categorySlugs || [content.categorySlug];
    categories = await CatalogCategory.find({
      slug: { $in: categorySlugs },
      active: true,
    }).lean();
  }
  if (
    !categories.length ||
    (content.categoryIds && categories.length !== content.categoryIds.length)
  ) {
    throw new AppError('One or more product categories were not found.', {
      statusCode: 400,
      code: 'CATEGORY_NOT_FOUND',
    });
  }

  return categories;
}

function applyResolvedCategories(content, categories) {
  const categorySlugs = categories.map((category) => category.slug);
  const types = content.types || [...new Set(categories.map((category) => category.type))];
  return {
    ...content,
    category: categories.find((category) => category.slug === categorySlugs[0])._id,
    categories: categories.map((category) => category._id),
    categorySlug: categorySlugs[0],
    categorySlugs,
    type: types[0],
    types,
  };
}

export async function saveProduct(content, files, id) {
  const images = await uploadHomeImages('products', files || [], 'catalog');
  const savedContent = applyImages(content, images);
  const existingProduct = id ? await CatalogProduct.findById(id).lean() : null;
  savedContent.slug = await resolveSlug(CatalogProduct, savedContent, id, existingProduct);
  savedContent.sku = await resolveSku(savedContent, id, existingProduct);
  const data = applyResolvedCategories(savedContent, await resolveProductCategories(savedContent));
  if (existingProduct && !images.some((image) => image.field === 'mainImage')) {
    data.mainImage = existingProduct.mainImage;
  }
  if (existingProduct && !images.some((image) => image.field === 'galleryImages')) {
    data.galleryImages = existingProduct.galleryImages;
  }
  if (existingProduct && !images.some((image) => image.field.startsWith('images['))) {
    data.images = existingProduct.images;
  }
  return id
    ? CatalogProduct.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean()
    : CatalogProduct.create(data);
}

export async function saveBulkProducts(content, files = []) {
  const images = await uploadHomeImages('products', files, 'catalog');
  const mappedContent = applyImages(content, images);
  const { sizes, ...sharedFields } = mappedContent;
  const productGroup = randomUUID();
  const reservedSkus = new Set();
  const reservedSlugs = new Set();
  const products = [];

  for (const sizeOption of sizes) {
    const { size, ...overrides } = sizeOption;
    const productContent = {
      ...sharedFields,
      ...overrides,
      name: overrides.name ?? sharedFields.name,
      sku: undefined,
      productGroup,
      attributes: { ...sharedFields.attributes, ...overrides.attributes, size },
      barcode: overrides.barcode ?? (sizes.length === 1 ? sharedFields.barcode : undefined),
    };
    const sku = overrides.sku
      ? slugify(overrides.sku).toUpperCase()
      : await resolveUniqueProductValue(
          'sku',
          slugify(`${productContent.name}-${size}`).toUpperCase(),
          reservedSkus,
        );
    if (sizeOption.sku) {
      const duplicate = await CatalogProduct.exists({
        sku: { $regex: `^${sku}$`, $options: 'i' },
      });
      if (reservedSkus.has(sku) || duplicate) {
        throw new AppError(`The SKU "${sku}" is already in use.`, {
          statusCode: 409,
          code: 'DUPLICATE_SKU',
        });
      }
      reservedSkus.add(sku);
    }

    const slugBase =
      overrides.slug || slugify(`${productContent.slug || productContent.name}-${size}`);
    const slug = await resolveUniqueProductValue('slug', slugBase, reservedSlugs);
    productContent.sku = sku;
    productContent.slug = slug;
    const productData = applyResolvedCategories(
      productContent,
      await resolveProductCategories(productContent),
    );
    delete productData.sizes;
    delete productData.size;
    products.push(productData);
  }

  try {
    const items = await CatalogProduct.insertMany(products, { ordered: true });
    return { productGroup, items };
  } catch (error) {
    await CatalogProduct.deleteMany({ productGroup });
    if (error?.code === 11000) {
      throw new AppError('A product SKU, slug, or barcode is already in use.', {
        statusCode: 409,
        code: 'DUPLICATE_PRODUCT_IDENTIFIER',
      });
    }
    throw error;
  }
}

export async function removeProduct(id) {
  const deleted = await CatalogProduct.findByIdAndDelete(id);
  if (!deleted)
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
}

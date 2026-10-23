import { AppError } from '../../errors/app-error.js';
import { CatalogCategory } from '../../models/catalog-category.model.js';
import { CatalogProduct } from '../../models/catalog-product.model.js';
import { uploadHomeImages } from '../home-content/home-content.upload.js';

function parseContent(req) {
  const raw = req.body.content || req.body.data;
  if (!raw) {
    const content = { ...req.body };
    const jsonFields = ['categoryIds', 'categorySlugs', 'types', 'attributes', 'bulkPricing'];
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
    for (const field of ['price', 'originalPrice', 'discountPercent', 'stockQuantity']) {
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
  for (const image of images) {
    if (image.field === 'mainImage') {
      setNestedValue(result, 'mainImage.url', image.url);
    } else if (image.field === 'galleryImages') {
      setNestedValue(result, `galleryImages[${galleryIndex}].url`, image.url);
      galleryIndex += 1;
    } else if (
      (image.field === 'mainImage.url' || image.field.startsWith('galleryImages[')) &&
      image.field.endsWith('.url')
    ) {
      setNestedValue(result, image.field, image.url);
    } else if (image.field.startsWith('images[') && image.field.endsWith('].url')) {
      setNestedValue(result, image.field, image.url);
    }
  }
  return result;
}

export function parseCatalogContent(req) {
  return parseContent(req);
}

export async function listCategories(type) {
  const match = { active: true };
  if (type) match.type = type;

  return CatalogCategory.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'catalogproducts',
        let: { categorySlug: '$slug' },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ['$categorySlug', '$$categorySlug'] }, { $eq: ['$active', true] }] },
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
  const savedContent = image ? { ...content, image: image.url } : content;
  return id
    ? CatalogCategory.findByIdAndUpdate(id, savedContent, { new: true, runValidators: true }).lean()
    : CatalogCategory.create(savedContent);
}

export async function getCategory(id) {
  const category = await CatalogCategory.findById(id).lean();
  if (!category) throw new AppError('The category was not found.', { statusCode: 404, code: 'CATEGORY_NOT_FOUND' });
  return category;
}

export async function listAdminCategories(type) {
  const filter = type ? { type } : {};
  return CatalogCategory.find(filter).sort({ type: 1, name: 1 }).lean();
}

export async function removeCategory(id) {
  const deleted = await CatalogCategory.findByIdAndDelete(id);
  if (!deleted) throw new AppError('The category was not found.', { statusCode: 404, code: 'CATEGORY_NOT_FOUND' });
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
      $or: [
        { category: { $in: categoryIds } },
        { categories: { $in: categoryIds } },
      ],
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
  if (query.color) filter['attributes.colour'] = { $in: query.color };
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
  return { items, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } };
}

export async function getProduct(slug) {
  const product = await CatalogProduct.findOne({ slug, active: true }).lean();
  if (!product) throw new AppError('The product was not found.', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  return product;
}

export async function getAdminProduct(id) {
  const product = await CatalogProduct.findById(id).populate('categories').lean();
  if (!product) throw new AppError('The product was not found.', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
  return product;
}

export async function listAdminProducts() {
  return CatalogProduct.find().populate('categories').sort({ createdAt: -1 }).lean();
}

export async function saveProduct(content, files, id) {
  const images = await uploadHomeImages('products', files || [], 'catalog');
  const savedContent = applyImages(content, images);
  const existingProduct = id ? await CatalogProduct.findById(id).lean() : null;
  let categories;
  if (savedContent.categoryIds?.length) {
    categories = await CatalogCategory.find({
      _id: { $in: savedContent.categoryIds },
      active: true,
    }).lean();
  } else {
    const categorySlugs = savedContent.categorySlugs || [savedContent.categorySlug];
    categories = await CatalogCategory.find({
      slug: { $in: categorySlugs },
      active: true,
    }).lean();
  }
  if (!categories.length || (savedContent.categoryIds && categories.length !== savedContent.categoryIds.length)) {
    throw new AppError('One or more product categories were not found.', {
      statusCode: 400,
      code: 'CATEGORY_NOT_FOUND',
    });
  }
  const categorySlugs = categories.map((category) => category.slug);
  const types = savedContent.types || [...new Set(categories.map((category) => category.type))];
  const data = {
    ...savedContent,
    category: categories.find((category) => category.slug === categorySlugs[0])._id,
    categories: categories.map((category) => category._id),
    categorySlug: categorySlugs[0],
    categorySlugs,
    type: types[0],
    types,
  };
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

export async function removeProduct(id) {
  const deleted = await CatalogProduct.findByIdAndDelete(id);
  if (!deleted) throw new AppError('The product was not found.', { statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
}

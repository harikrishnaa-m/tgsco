import { AppError } from '../../errors/app-error.js';
import { CatalogProduct } from '../../models/catalog-product.model.js';
import { Wishlist } from '../../models/wishlist.model.js';

async function getOrCreateWishlist(userId) {
  return Wishlist.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { new: true, upsert: true },
  ).populate('items.product');
}

function formatWishlist(wishlist) {
  return {
    id: wishlist._id,
    items: wishlist.items
      .filter((item) => item.product)
      .map((item) => ({
        product: item.product._id,
        name: item.product.name,
        slug: item.product.slug,
        sku: item.product.sku,
        mainImage: item.product.mainImage,
        price: item.product.price,
        currency: item.product.currency,
        stockQuantity: item.product.stockQuantity,
        active: item.product.active,
      })),
  };
}

export async function getWishlist(user) {
  return formatWishlist(await getOrCreateWishlist(user.sub));
}

export async function addWishlistItem(user, { productId }) {
  const product = await CatalogProduct.findOne({ _id: productId, active: true }).lean();
  if (!product) {
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  const wishlist = await getOrCreateWishlist(user.sub);
  const alreadySaved = wishlist.items.some((item) => item.product?._id.toString() === productId);
  if (!alreadySaved) {
    wishlist.items.push({ product: product._id });
    await wishlist.save();
  }

  const populated = await Wishlist.findById(wishlist._id).populate('items.product');
  return formatWishlist(populated);
}

export async function mergeWishlist(user, { productIds }) {
  const uniqueProductIds = [...new Set(productIds)];
  const products = await CatalogProduct.find({
    _id: { $in: uniqueProductIds },
    active: true,
  })
    .select('_id')
    .lean();
  const availableIds = new Set(products.map((product) => product._id.toString()));
  const unavailableProductIds = uniqueProductIds.filter((productId) => !availableIds.has(productId));

  const wishlist = await getOrCreateWishlist(user.sub);
  const savedIds = new Set(
    wishlist.items
      .filter((item) => item.product)
      .map((item) => item.product._id.toString()),
  );
  for (const productId of uniqueProductIds) {
    if (availableIds.has(productId) && !savedIds.has(productId)) {
      wishlist.items.push({ product: productId });
    }
  }
  await wishlist.save();
  const populated = await Wishlist.findById(wishlist._id).populate('items.product');
  return {
    ...formatWishlist(populated),
    unavailableProductIds,
  };
}

export async function removeWishlistItem(user, productId) {
  const wishlist = await getOrCreateWishlist(user.sub);
  const originalLength = wishlist.items.length;
  wishlist.items = wishlist.items.filter((item) => item.product?._id.toString() !== productId);
  if (wishlist.items.length === originalLength) {
    throw new AppError('The product is not in the wishlist.', {
      statusCode: 404,
      code: 'WISHLIST_ITEM_NOT_FOUND',
    });
  }
  await wishlist.save();
  const populated = await Wishlist.findById(wishlist._id).populate('items.product');
  return formatWishlist(populated);
}

export async function clearWishlist(user) {
  const wishlist = await getOrCreateWishlist(user.sub);
  wishlist.items = [];
  await wishlist.save();
  return formatWishlist(wishlist);
}

import { AppError } from '../../errors/app-error.js';
import { Cart } from '../../models/cart.model.js';
import { CatalogProduct } from '../../models/catalog-product.model.js';
import { getUnitPrice } from '../catalog/catalog-pricing.js';

function formatCart(cart, role) {
  const items = cart.items.map((item) => {
    const product = item.product;
    const unitPrice = getUnitPrice(product, role, item.quantity);
    if (role === 'merchant' && unitPrice === undefined) {
      throw new AppError('A cart item no longer matches a configured bulk tier.', {
        statusCode: 409,
        code: 'BULK_QUANTITY_REQUIRED',
      });
    }
    return {
      product: product._id,
      name: product.name,
      slug: product.slug,
      mainImage: product.mainImage,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
      currency: product.currency,
    };
  });
  return {
    id: cart._id,
    items,
    totalItems: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.lineTotal, 0),
    currency: items[0]?.currency || 'INR',
  };
}

async function getOrCreateCart(userId) {
  return Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { new: true, upsert: true },
  ).populate('items.product');
}

export async function getCart(user) {
  const cart = await getOrCreateCart(user.sub);
  return formatCart(cart, user.role);
}

export async function addCartItem(user, { productId, quantity }) {
  const product = await CatalogProduct.findOne({ _id: productId, active: true }).lean();
  if (!product)
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });

  const cart = await getOrCreateCart(user.sub);
  const item = cart.items.find((entry) => entry.product?._id.toString() === productId);
  const nextQuantity = (item?.quantity || 0) + quantity;
  if (user.role === 'merchant' && getUnitPrice(product, user.role, nextQuantity) === undefined) {
    throw new AppError('Merchants can only purchase products in configured bulk quantities.', {
      statusCode: 409,
      code: 'BULK_QUANTITY_REQUIRED',
    });
  }
  if (nextQuantity > product.stockQuantity) {
    throw new AppError('The requested quantity exceeds available stock.', {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
    });
  }
  if (item) item.quantity = nextQuantity;
  else cart.items.push({ product: product._id, quantity });
  await cart.save();
  const populated = await Cart.findById(cart._id).populate('items.product');
  return formatCart(populated, user.role);
}

export async function mergeCart(user, { items }) {
  const requestedQuantities = new Map();
  for (const item of items) {
    requestedQuantities.set(
      item.productId,
      (requestedQuantities.get(item.productId) || 0) + item.quantity,
    );
  }

  const productIds = [...requestedQuantities.keys()];
  const products = await CatalogProduct.find({
    _id: { $in: productIds },
    active: true,
  }).lean();
  const productsById = new Map(products.map((product) => [product._id.toString(), product]));
  for (const productId of productIds) {
    if (!productsById.has(productId)) {
      throw new AppError('One or more guest-cart products are unavailable.', {
        statusCode: 409,
        code: 'CART_PRODUCT_UNAVAILABLE',
      });
    }
  }

  const cart = await getOrCreateCart(user.sub);
  const existingQuantities = new Map(
    cart.items.map((item) => [item.product._id.toString(), item.quantity]),
  );
  const adjustments = [];
  for (const [productId, quantity] of requestedQuantities) {
    const product = productsById.get(productId);
    const requestedFinalQuantity = (existingQuantities.get(productId) || 0) + quantity;
    let nextQuantity = requestedFinalQuantity;
    if (user.role === 'merchant' && getUnitPrice(product, user.role, nextQuantity) === undefined) {
      const nextTier = (product.bulkPricing || [])
        .filter((tier) => tier.minimumQuantity > requestedFinalQuantity)
        .sort((a, b) => a.minimumQuantity - b.minimumQuantity)[0];
      if (!nextTier) {
        throw new AppError(`The quantity for ${product.name} must match a configured bulk tier.`, {
          statusCode: 409,
          code: 'BULK_QUANTITY_REQUIRED',
        });
      }
      nextQuantity = nextTier.minimumQuantity;
      adjustments.push({
        productId,
        productName: product.name,
        requestedQuantity: requestedFinalQuantity,
        adjustedQuantity: nextQuantity,
        reason: 'MERCHANT_BULK_MINIMUM',
      });
    }
    if (nextQuantity > product.stockQuantity) {
      throw new AppError(`The requested quantity for ${product.name} exceeds available stock.`, {
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
      });
    }
    const item = cart.items.find((entry) => entry.product._id.toString() === productId);
    if (item) item.quantity = nextQuantity;
    else cart.items.push({ product: product._id, quantity: nextQuantity });
  }
  await cart.save();
  const populated = await Cart.findById(cart._id).populate('items.product');
  return {
    ...formatCart(populated, user.role),
    adjustments,
  };
}

export async function updateCartItem(user, productId, quantity) {
  const product = await CatalogProduct.findOne({ _id: productId, active: true }).lean();
  if (!product)
    throw new AppError('The product was not found.', {
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  if (quantity > product.stockQuantity) {
    throw new AppError('The requested quantity exceeds available stock.', {
      statusCode: 409,
      code: 'INSUFFICIENT_STOCK',
    });
  }
  if (user.role === 'merchant' && getUnitPrice(product, user.role, quantity) === undefined) {
    throw new AppError('Merchants can only purchase products in configured bulk quantities.', {
      statusCode: 409,
      code: 'BULK_QUANTITY_REQUIRED',
    });
  }
  const cart = await getOrCreateCart(user.sub);
  const item = cart.items.find((entry) => entry.product?._id.toString() === productId);
  if (!item)
    throw new AppError('The product is not in the cart.', {
      statusCode: 404,
      code: 'CART_ITEM_NOT_FOUND',
    });
  item.quantity = quantity;
  await cart.save();
  const populated = await Cart.findById(cart._id).populate('items.product');
  return formatCart(populated, user.role);
}

export async function removeCartItem(user, productId) {
  const cart = await getOrCreateCart(user.sub);
  const originalLength = cart.items.length;
  cart.items = cart.items.filter((item) => item.product?._id.toString() !== productId);
  if (cart.items.length === originalLength) {
    throw new AppError('The product is not in the cart.', {
      statusCode: 404,
      code: 'CART_ITEM_NOT_FOUND',
    });
  }
  await cart.save();
  const populated = await Cart.findById(cart._id).populate('items.product');
  return formatCart(populated, user.role);
}

export async function clearCart(user) {
  const cart = await getOrCreateCart(user.sub);
  cart.items = [];
  await cart.save();
  return formatCart(cart, user.role);
}

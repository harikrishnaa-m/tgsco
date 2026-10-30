import { AppError } from '../../errors/app-error.js';
import { CatalogProduct } from '../../models/catalog-product.model.js';
import { InventoryMovement } from '../../models/inventory-movement.model.js';
import { Order } from '../../models/order.model.js';
import { notifyAdmins } from '../notifications/notifications.service.js';

const statusExpression = {
  $switch: {
    branches: [
      {
        case: { $lte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, 0] },
        then: 'out_of_stock',
      },
      {
        case: {
          $lte: [{ $subtract: ['$stockQuantity', '$reservedQuantity'] }, '$lowStockThreshold'],
        },
        then: 'low_stock',
      },
    ],
    default: 'in_stock',
  },
};

function formatInventory(product) {
  const stockQuantity = product.stockQuantity || 0;
  const reservedQuantity = product.reservedQuantity || 0;
  const availableQuantity = stockQuantity - reservedQuantity;
  const lowStockThreshold = product.lowStockThreshold ?? 5;
  return {
    productId: product._id,
    sku: product.sku,
    name: product.name,
    barcode: product.barcode || null,
    active: product.active,
    stockQuantity,
    reservedQuantity,
    availableQuantity,
    lowStockThreshold,
    reorderQuantity: product.reorderQuantity ?? 0,
    status:
      availableQuantity <= 0
        ? 'out_of_stock'
        : availableQuantity <= lowStockThreshold
          ? 'low_stock'
          : 'in_stock',
  };
}

async function findProduct(productId) {
  const product = await CatalogProduct.findById(productId);
  if (!product)
    throw new AppError('The inventory product was not found.', {
      statusCode: 404,
      code: 'INVENTORY_PRODUCT_NOT_FOUND',
    });
  return product;
}

export async function recordInventoryMovement(input) {
  return InventoryMovement.create(input);
}

export async function listInventory(query) {
  const match = {};
  if (query.active !== 'all') match.active = query.active === 'true';
  if (query.search) {
    const search = new RegExp(query.search, 'i');
    match.$or = [{ name: search }, { sku: search }, { barcode: search }];
  }
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        lowStockThreshold: { $ifNull: ['$lowStockThreshold', 5] },
        reservedQuantity: { $ifNull: ['$reservedQuantity', 0] },
      },
    },
    {
      $addFields: {
        availableQuantity: { $subtract: ['$stockQuantity', '$reservedQuantity'] },
        inventoryStatus: statusExpression,
      },
    },
  ];
  if (query.status) pipeline.push({ $match: { inventoryStatus: query.status } });
  const sort =
    query.sort === 'oldest'
      ? { createdAt: 1 }
      : query.sort === 'name'
        ? { name: 1 }
        : query.sort === 'stock-asc'
          ? { availableQuantity: 1 }
          : query.sort === 'stock-desc'
            ? { availableQuantity: -1 }
            : { createdAt: -1 };
  pipeline.push(
    { $sort: sort },
    {
      $facet: {
        items: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        count: [{ $count: 'value' }],
      },
    },
  );
  const result = await CatalogProduct.aggregate(pipeline);
  const items = (result[0]?.items || []).map(formatInventory);
  const total = result[0]?.count?.[0]?.value || 0;
  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(total / query.limit),
  };
}

export async function inventorySummary() {
  const products = await CatalogProduct.find({})
    .select('stockQuantity reservedQuantity lowStockThreshold active')
    .lean();
  return products.reduce(
    (summary, product) => {
      const available = (product.stockQuantity || 0) - (product.reservedQuantity || 0);
      summary.products += 1;
      summary.totalStock += product.stockQuantity || 0;
      summary.totalReserved += product.reservedQuantity || 0;
      summary.totalAvailable += available;
      if (available <= 0) summary.outOfStock += 1;
      else if (available <= (product.lowStockThreshold ?? 5)) summary.lowStock += 1;
      return summary;
    },
    { products: 0, totalStock: 0, totalReserved: 0, totalAvailable: 0, lowStock: 0, outOfStock: 0 },
  );
}

export async function inventoryFilters() {
  return {
    statuses: ['in_stock', 'low_stock', 'out_of_stock'],
    movementTypes: [
      'restock',
      'adjustment',
      'damage',
      'return',
      'physical_count',
      'reservation',
      'reservation_release',
      'sale',
    ],
    active: ['true', 'false', 'all'],
    sorts: ['newest', 'oldest', 'name', 'stock-asc', 'stock-desc'],
  };
}

export async function getInventory(productId) {
  return formatInventory(await findProduct(productId));
}

export async function listMovements(productId, query) {
  await findProduct(productId);
  const filter = { product: productId };
  if (query.movementType) filter.movementType = query.movementType;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = query.from;
    if (query.to) filter.createdAt.$lte = query.to;
  }
  const [items, total] = await Promise.all([
    InventoryMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    InventoryMovement.countDocuments(filter),
  ]);
  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(total / query.limit),
  };
}

async function changeStock(productId, input, adminId, movementType, quantityDelta, extra = {}) {
  const product = await findProduct(productId);
  const stockBefore = product.stockQuantity;
  const reservedBefore = product.reservedQuantity || 0;
  const threshold = product.lowStockThreshold ?? 5;
  const availableBefore = stockBefore - reservedBefore;
  const stockAfter = stockBefore + quantityDelta;
  if (stockAfter < reservedBefore) {
    throw new AppError(
      'The adjustment cannot reduce available stock below zero or below active reservations.',
      {
        statusCode: 409,
        code: 'NEGATIVE_AVAILABLE_STOCK',
        details: {
          stockQuantity: stockBefore,
          reservedQuantity: reservedBefore,
          requestedDelta: quantityDelta,
        },
      },
    );
  }
  const updated = await CatalogProduct.findOneAndUpdate(
    { _id: productId, stockQuantity: stockBefore, reservedQuantity: reservedBefore },
    { $inc: { stockQuantity: quantityDelta } },
    { new: true },
  );
  if (!updated)
    throw new AppError(
      'The product stock changed while this adjustment was being processed. Retry the request.',
      { statusCode: 409, code: 'INVENTORY_CONCURRENT_UPDATE' },
    );
  const movement = await recordInventoryMovement({
    product: updated._id,
    sku: updated.sku,
    productName: updated.name,
    movementType,
    quantity: Math.abs(quantityDelta),
    quantityDelta,
    reservedDelta: 0,
    stockBefore,
    stockAfter,
    reservedBefore,
    reservedAfter: reservedBefore,
    performedBy: adminId,
    ...input,
    ...extra,
  });
  const availableAfter = stockAfter - reservedBefore;
  const wasLow = availableBefore > 0 && availableBefore <= threshold;
  const isLow = availableAfter > 0 && availableAfter <= threshold;
  if (availableAfter <= 0 && availableBefore > 0) {
    await notifyAdmins({
      type: 'inventory.out_of_stock',
      title: 'Product out of stock',
      message: `${updated.name} (${updated.sku}) is now out of stock.`,
      data: {
        productId: updated._id.toString(),
        sku: updated.sku,
        availableQuantity: availableAfter,
      },
      eventKey: `inventory-out:${movement._id}`,
    });
  } else if (isLow && !wasLow) {
    await notifyAdmins({
      type: 'inventory.low_stock',
      title: 'Low stock alert',
      message: `${updated.name} (${updated.sku}) is at or below its low-stock threshold.`,
      data: {
        productId: updated._id.toString(),
        sku: updated.sku,
        availableQuantity: availableAfter,
        lowStockThreshold: threshold,
      },
      eventKey: `inventory-low:${movement._id}`,
    });
  } else if (availableBefore <= threshold && availableAfter > threshold) {
    await notifyAdmins({
      type: 'inventory.restocked',
      title: 'Stock replenished',
      message: `${updated.name} (${updated.sku}) is above its low-stock threshold again.`,
      data: {
        productId: updated._id.toString(),
        sku: updated.sku,
        availableQuantity: availableAfter,
      },
      eventKey: `inventory-restocked:${movement._id}`,
    });
  }
  return { inventory: formatInventory(updated), movement };
}

export async function adjustInventory(productId, input, adminId) {
  return changeStock(
    productId,
    input,
    adminId,
    'adjustment',
    input.direction === 'increase' ? input.quantity : -input.quantity,
  );
}
export async function restockInventory(productId, input, adminId) {
  return changeStock(productId, input, adminId, 'restock', input.quantity);
}
export async function recordDamage(productId, input, adminId) {
  return changeStock(productId, input, adminId, 'damage', -input.quantity);
}
export async function recordReturn(productId, input, adminId) {
  return changeStock(
    productId,
    { ...input, referenceType: 'return', referenceId: input.returnId?.toString() },
    adminId,
    'return',
    input.quantity,
  );
}
export async function reconcileInventory(productId, input, adminId) {
  const product = await findProduct(productId);
  const delta = input.physicalQuantity - product.stockQuantity;
  if (delta === 0)
    throw new AppError('Physical quantity already matches system stock.', {
      statusCode: 409,
      code: 'INVENTORY_ALREADY_RECONCILED',
    });
  return changeStock(productId, input, adminId, 'physical_count', delta);
}

export async function listReservations(query) {
  const filter = { 'reservations.status': 'active' };
  const orders = await Order.find(filter)
    .select('orderNumber user reservations orderStatus paymentStatus createdAt')
    .populate('user', 'name email mobile')
    .sort({ createdAt: -1 })
    .lean();
  const items = orders.flatMap((order) =>
    order.reservations
      .filter((item) => item.status === 'active')
      .map((reservation) => ({
        orderId: order._id,
        orderNumber: order.orderNumber,
        productId: reservation.productId,
        quantity: reservation.quantity,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        customer: order.user,
        createdAt: order.createdAt,
      })),
  );
  return query.productId
    ? items.filter((item) => item.productId.toString() === query.productId)
    : items;
}

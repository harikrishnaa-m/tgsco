export function getMerchantBulkTier(product, quantity) {
  return (product.bulkPricing || [])
    .filter((item) => item.minimumQuantity <= quantity)
    .filter((item) => item.maximumQuantity === undefined || item.maximumQuantity >= quantity)
    .sort((a, b) => b.minimumQuantity - a.minimumQuantity)[0];
}

export function getUnitPrice(product, role, quantity) {
  if (role !== 'merchant') return product.price;
  return getMerchantBulkTier(product, quantity)?.price;
}

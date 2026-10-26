import {
  addWishlistItem,
  clearWishlist,
  getWishlist,
  mergeWishlist,
  removeWishlistItem,
} from './wishlist.service.js';
import { mergeWishlistSchema, wishlistProductSchema } from './wishlist.validation.js';

export async function getCurrentWishlist(req, res) {
  res.json({ success: true, data: await getWishlist(req.user) });
}

export async function addItem(req, res) {
  res.status(201).json({
    success: true,
    data: await addWishlistItem(req.user, wishlistProductSchema.parse(req.body)),
  });
}

export async function mergeCurrentWishlist(req, res) {
  res.json({
    success: true,
    data: await mergeWishlist(req.user, mergeWishlistSchema.parse(req.body)),
  });
}

export async function removeItem(req, res) {
  const { productId } = wishlistProductSchema.parse(req.params);
  res.json({ success: true, data: await removeWishlistItem(req.user, productId) });
}

export async function clearCurrentWishlist(req, res) {
  res.json({ success: true, data: await clearWishlist(req.user) });
}

import {
  addCartItem,
  clearCart,
  getCart,
  mergeCart,
  removeCartItem,
  updateCartItem,
} from './cart.service.js';
import { cartItemSchema, mergeCartSchema } from './cart.validation.js';

export async function getCurrentCart(req, res) {
  res.json({ success: true, data: await getCart(req.user) });
}

export async function addItem(req, res) {
  res
    .status(201)
    .json({ success: true, data: await addCartItem(req.user, cartItemSchema.parse(req.body)) });
}

export async function mergeCurrentCart(req, res) {
  res.json({
    success: true,
    data: await mergeCart(req.user, mergeCartSchema.parse(req.body)),
  });
}

export async function updateItem(req, res) {
  const { quantity } = cartItemSchema.pick({ quantity: true }).parse(req.body);
  res.json({ success: true, data: await updateCartItem(req.user, req.params.productId, quantity) });
}

export async function removeItem(req, res) {
  res.json({ success: true, data: await removeCartItem(req.user, req.params.productId) });
}

export async function clearCurrentCart(req, res) {
  res.json({ success: true, data: await clearCart(req.user) });
}

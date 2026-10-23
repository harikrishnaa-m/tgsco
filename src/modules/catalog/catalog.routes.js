import { Router } from 'express';
import { requireAdmin } from '../auth/auth.middleware.js';
import { homeImageUpload } from '../home-content/home-content.upload.js';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getCategories,
  getAdminCategories,
  getAdminCategory,
  getAdminProducts,
  getAdminProductById,
  getProductBySlug,
  getProducts,
  updateCategory,
  updateProduct,
} from './catalog.controller.js';

const router = Router();

router.get('/categories', getCategories);
router.get('/products', getProducts);
router.get('/products/:slug', getProductBySlug);
router.get('/admin/categories', requireAdmin, getAdminCategories);
router.get('/admin/categories/:id', requireAdmin, getAdminCategory);
router.get('/admin/products', requireAdmin, getAdminProducts);
router.get('/admin/products/:id', requireAdmin, getAdminProductById);
router.post('/admin/categories', requireAdmin, homeImageUpload.any(), createCategory);
router.patch('/admin/categories/:id', requireAdmin, homeImageUpload.any(), updateCategory);
router.delete('/admin/categories/:id', requireAdmin, deleteCategory);
router.post('/admin/products', requireAdmin, homeImageUpload.any(), createProduct);
router.patch('/admin/products/:id', requireAdmin, homeImageUpload.any(), updateProduct);
router.delete('/admin/products/:id', requireAdmin, deleteProduct);

export default router;

import { Router } from 'express';
import { requireAdmin } from '../auth/auth.middleware.js';
import { homeImageUpload } from '../home-content/home-content.upload.js';
import {
  createCategory,
  createGroup,
  createProduct,
  deleteCategory,
  deleteGroup,
  deleteProduct,
  getCategories,
  getGroups,
  getGroupById,
  getAdminGroups,
  getAdminGroupById,
  getAdminCategories,
  getAdminCategory,
  getAdminProducts,
  getAdminProductById,
  getProductBySlug,
  getProducts,
  getProductFilters,
  updateCategory,
  updateGroup,
  updateProduct,
} from './catalog.controller.js';

const router = Router();

router.get('/categories', getCategories);
router.get('/groups', getGroups);
router.get('/groups/:id', getGroupById);
router.get('/products', getProducts);
router.get('/products/filters', getProductFilters);
router.get('/products/:identifier', getProductBySlug);
router.get('/admin/groups', requireAdmin, getAdminGroups);
router.get('/admin/groups/:id', requireAdmin, getAdminGroupById);
router.get('/admin/categories', requireAdmin, getAdminCategories);
router.post('/admin/groups', requireAdmin, homeImageUpload.any(), createGroup);
router.patch('/admin/groups/:id', requireAdmin, homeImageUpload.any(), updateGroup);
router.delete('/admin/groups/:id', requireAdmin, deleteGroup);
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

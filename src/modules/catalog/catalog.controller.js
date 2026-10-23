import {
  categoryQuerySchema,
  categorySchema,
  productQuerySchema,
  productSchema,
} from './catalog.validation.js';
import {
  getProduct,
  getAdminProduct,
  listAdminCategories,
  listAdminProducts,
  getCategory,
  listCategories,
  listProducts,
  parseCatalogContent,
  removeCategory,
  removeProduct,
  saveCategory,
  saveProduct,
} from './catalog.service.js';

export async function getCategories(req, res) {
  const { type } = categoryQuerySchema.parse(req.query);
  res.json({ success: true, data: await listCategories(type) });
}

export async function getAdminCategories(req, res) {
  const { type } = categoryQuerySchema.parse(req.query);
  res.json({ success: true, data: await listAdminCategories(type) });
}

export async function getAdminCategory(req, res) {
  res.json({ success: true, data: await getCategory(req.params.id) });
}

export async function getProducts(req, res) {
  res.json({ success: true, data: await listProducts(productQuerySchema.parse(req.query)) });
}

export async function getProductBySlug(req, res) {
  res.json({ success: true, data: await getProduct(req.params.slug) });
}

export async function getAdminProducts(req, res) {
  res.json({ success: true, data: await listAdminProducts() });
}

export async function getAdminProductById(req, res) {
  res.json({ success: true, data: await getAdminProduct(req.params.id) });
}

export async function createCategory(req, res) {
  res.status(201).json({
    success: true,
    data: await saveCategory(categorySchema.parse(parseCatalogContent(req)), req.files),
  });
}

export async function updateCategory(req, res) {
  res.json({
    success: true,
    data: await saveCategory(
      categorySchema.parse(parseCatalogContent(req)),
      req.files,
      req.params.id,
    ),
  });
}

export async function deleteCategory(req, res) {
  await removeCategory(req.params.id);
  res.json({ success: true, data: { message: 'The category was deleted successfully.' } });
}

export async function createProduct(req, res) {
  res.status(201).json({
    success: true,
    data: await saveProduct(productSchema.parse(parseCatalogContent(req)), req.files, undefined),
  });
}

export async function updateProduct(req, res) {
  res.json({
    success: true,
    data: await saveProduct(productSchema.parse(parseCatalogContent(req)), req.files, req.params.id),
  });
}

export async function deleteProduct(req, res) {
  await removeProduct(req.params.id);
  res.json({ success: true, data: { message: 'The product was deleted successfully.' } });
}

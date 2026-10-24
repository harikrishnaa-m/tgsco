import {
  categoryQuerySchema,
  categorySchema,
  groupSchema,
  productQuerySchema,
  productFilterQuerySchema,
  productSchema,
} from './catalog.validation.js';
import {
  getPublicProduct,
  getAdminProduct,
  getGroup,
  listAdminGroups,
  listAdminCategories,
  listGroups,
  listAdminProducts,
  getCategory,
  listCategories,
  listProducts,
  getProductFilterOptions,
  parseCatalogContent,
  removeCategory,
  removeGroup,
  removeProduct,
  saveCategory,
  saveGroup,
  saveProduct,
} from './catalog.service.js';

export async function getCategories(req, res) {
  const { type, groupId } = categoryQuerySchema.parse(req.query);
  res.json({ success: true, data: await listCategories(type, groupId) });
}

export async function getGroups(req, res) {
  res.json({ success: true, data: await listGroups() });
}

export async function getGroupById(req, res) {
  res.json({ success: true, data: await getGroup(req.params.id) });
}

export async function getAdminGroups(req, res) {
  res.json({ success: true, data: await listAdminGroups() });
}

export async function getAdminGroupById(req, res) {
  res.json({ success: true, data: await getGroup(req.params.id, true) });
}

export async function getAdminCategories(req, res) {
  const { type, groupId } = categoryQuerySchema.parse(req.query);
  res.json({ success: true, data: await listAdminCategories(type, groupId) });
}

export async function getAdminCategory(req, res) {
  res.json({ success: true, data: await getCategory(req.params.id) });
}

export async function getProducts(req, res) {
  res.json({ success: true, data: await listProducts(productQuerySchema.parse(req.query)) });
}

export async function getProductFilters(req, res) {
  res.json({
    success: true,
    data: await getProductFilterOptions(productFilterQuerySchema.parse(req.query)),
  });
}

export async function getProductBySlug(req, res) {
  res.json({ success: true, data: await getPublicProduct(req.params.identifier) });
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

export async function createGroup(req, res) {
  res.status(201).json({
    success: true,
    data: await saveGroup(groupSchema.parse(parseCatalogContent(req)), req.files),
  });
}

export async function updateGroup(req, res) {
  res.json({
    success: true,
    data: await saveGroup(
      groupSchema.parse(parseCatalogContent(req)),
      req.files,
      req.params.id,
    ),
  });
}

export async function deleteGroup(req, res) {
  await removeGroup(req.params.id);
  res.json({ success: true, data: { message: 'The catalogue group was deleted successfully.' } });
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

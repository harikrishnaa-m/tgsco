import * as service from './inventory.service.js';
import * as v from './inventory.validation.js';
import { AppError } from '../../errors/app-error.js';

function parse(
  schema,
  value,
  code = 'INVALID_INVENTORY_REQUEST',
  message = 'Inventory request is invalid.',
) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(message, {
      statusCode: 400,
      code,
      details: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export const list = async (req, res) =>
  res.json({
    success: true,
    data: await service.listInventory(
      parse(
        v.inventoryQuery,
        req.query,
        'INVALID_INVENTORY_FILTERS',
        'Inventory filters are invalid.',
      ),
    ),
  });
export const summary = async (req, res) =>
  res.json({ success: true, data: await service.inventorySummary() });
export const filters = async (req, res) =>
  res.json({ success: true, data: await service.inventoryFilters() });
export const detail = async (req, res) =>
  res.json({
    success: true,
    data: await service.getInventory(parse(v.productId, req.params.productId)),
  });
export const movements = async (req, res) =>
  res.json({
    success: true,
    data: await service.listMovements(
      parse(v.productId, req.params.productId),
      parse(v.movementQuery, req.query),
    ),
  });
export const reservations = async (req, res) =>
  res.json({ success: true, data: await service.listReservations(req.query) });
export const adjust = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.adjustInventory(
      parse(v.productId, req.params.productId),
      parse(v.adjustBody, req.body),
      req.user.sub,
    ),
  });
export const restock = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.restockInventory(
      parse(v.productId, req.params.productId),
      parse(v.restockBody, req.body),
      req.user.sub,
    ),
  });
export const damage = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.recordDamage(
      parse(v.productId, req.params.productId),
      parse(v.damageBody, req.body),
      req.user.sub,
    ),
  });
export const returned = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.recordReturn(
      parse(v.productId, req.params.productId),
      parse(v.returnBody, req.body),
      req.user.sub,
    ),
  });
export const reconcile = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.reconcileInventory(
      parse(v.productId, req.params.productId),
      parse(v.reconcileBody, req.body),
      req.user.sub,
    ),
  });

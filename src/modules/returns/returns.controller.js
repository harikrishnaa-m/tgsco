import * as service from './returns.service.js';
import * as v from './returns.validation.js';
import { AppError } from '../../errors/app-error.js';
const parse = (schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new AppError('Return request is invalid.', {
      statusCode: 400,
      code: 'INVALID_RETURN_REQUEST',
      details: r.error.issues.map((x) => ({
        field: x.path.join('.') || 'request',
        message: x.message,
      })),
    });
  return r.data;
};
export const create = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createReturn(
      req.user,
      parse(v.orderId, req.params.id),
      parse(v.createBody, req.body),
    ),
  });
export const list = async (req, res) =>
  res.json({
    success: true,
    data: await service.listReturns(
      req.user,
      parse(v.query, req.query),
      req.params.id ? parse(v.orderId, req.params.id) : undefined,
    ),
  });
export const detail = async (req, res) =>
  res.json({
    success: true,
    data: await service.getReturn(req.user, parse(v.orderId, req.params.returnId)),
  });
export const cancel = async (req, res) =>
  res.json({
    success: true,
    data: await service.cancelReturn(
      req.user,
      parse(v.orderId, req.params.returnId),
      parse(v.cancelBody, req.body).reason,
    ),
  });
export const adminList = async (req, res) =>
  res.json({
    success: true,
    data: await service.adminListReturns({
      ...parse(v.query, req.query),
      ...(req.params.id ? { order: parse(v.orderId, req.params.id) } : {}),
    }),
  });
export const adminFilters = async (req, res) =>
  res.json({ success: true, data: await service.returnFilters() });
export const adminDetail = async (req, res) =>
  res.json({
    success: true,
    data: await service.getAdminReturn(parse(v.returnId, req.params.returnId)),
  });
export const adminStatus = async (req, res) =>
  res.json({
    success: true,
    data: await service.updateReturn(
      parse(v.orderId, req.params.returnId),
      parse(v.statusBody, req.body),
      req.user.sub,
    ),
  });
export const createRefundMethod = async (req, res) =>
  res.status(201).json({
    success: true,
    data: await service.createRefundMethod(req.user, parse(v.refundMethodBody, req.body)),
  });
export const listRefundMethods = async (req, res) =>
  res.json({ success: true, data: await service.listRefundMethods(req.user) });
export const getRefundMethod = async (req, res) =>
  res.json({
    success: true,
    data: await service.getRefundMethod(req.user, parse(v.returnId, req.params.refundMethodId)),
  });
export const updateRefundMethod = async (req, res) =>
  res.json({
    success: true,
    data: await service.updateRefundMethod(
      req.user,
      parse(v.returnId, req.params.refundMethodId),
      parse(v.refundMethodBody, req.body),
    ),
  });
export const deleteRefundMethod = async (req, res) =>
  res.json({
    success: true,
    data: await service.deleteRefundMethod(req.user, parse(v.returnId, req.params.refundMethodId)),
  });

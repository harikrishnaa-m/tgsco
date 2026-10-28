import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';

export function requireAdmin(req, res, next) {
  const authorization = req.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    next(
      new AppError('Please provide an access token to use this resource.', {
        statusCode: 401,
        code: 'AUTHENTICATION_REQUIRED',
      }),
    );
    return;
  }

  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    if (typeof payload !== 'object' || payload.type !== 'access' || payload.role !== 'admin') {
      throw new AppError('You do not have permission to use this resource.', {
        statusCode: 403,
        code: 'ADMIN_ACCESS_REQUIRED',
      });
    }

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(error);
  }
}

export function requireUser(req, res, next) {
  const authorization = req.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) {
    next(
      new AppError('Please provide an access token to use this resource.', {
        statusCode: 401,
        code: 'AUTHENTICATION_REQUIRED',
      }),
    );
    return;
  }
  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
    if (
      typeof payload !== 'object' ||
      payload.type !== 'access' ||
      !['customer', 'merchant'].includes(payload.role)
    ) {
      throw new AppError('Only customer and merchant accounts can use a cart.', {
        statusCode: 403,
        code: 'ECOMMERCE_USER_ACCESS_REQUIRED',
      });
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

import { Router } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import * as controller from './profile.controller.js';

function requireAccount(req, res, next) {
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
      !['admin', 'customer', 'merchant'].includes(payload.role)
    ) {
      throw new AppError('Only admin, customer, and merchant accounts can use a profile.', {
        statusCode: 403,
        code: 'PROFILE_ACCESS_REQUIRED',
      });
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

const router = Router();
router.use(requireAccount);
router.get('/', controller.get);
router.patch('/', controller.update);
router.patch('/password', controller.password);

export default router;

import { MulterError } from 'multer';
import mongoose from 'mongoose';
import { z } from 'zod';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError, createNotFoundError } from '../errors/app-error.js';

function formatZodIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    message: issue.message,
  }));
}

function getErrorResponse(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please check the submitted information and correct the highlighted fields.',
      details: formatZodIssues(error),
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      code: 'DATABASE_VALIDATION_ERROR',
      message: 'Some information could not be saved. Please check the submitted fields.',
      details: Object.values(error.errors).map((fieldError) => ({
        field: fieldError.path,
        message: fieldError.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      code: 'INVALID_PARAMETER',
      message: `The value provided for "${error.path}" is not valid.`,
    };
  }

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern || error.keyValue || {});
    return {
      statusCode: 409,
      code: 'DUPLICATE_RESOURCE',
      message: fields.length
        ? `A record with the same ${fields.join(', ')} already exists.`
        : 'A record with the same information already exists.',
    };
  }

  if (error instanceof MulterError) {
    const uploadMessages = {
      LIMIT_FILE_SIZE: 'The uploaded file is too large.',
      LIMIT_FILE_COUNT: 'Too many files were uploaded.',
      LIMIT_UNEXPECTED_FILE: 'This file field is not supported.',
      LIMIT_FIELD_COUNT: 'Too many form fields were submitted.',
    };

    return {
      statusCode: 400,
      code: 'UPLOAD_ERROR',
      message: uploadMessages[error.code] || 'The file could not be uploaded.',
    };
  }

  if (error?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'The request body contains invalid JSON.',
    };
  }

  if (error?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'REQUEST_TOO_LARGE',
      message: 'The request body is too large.',
    };
  }

  if (error?.statusCode === 429) {
    return {
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait a moment and try again.',
    };
  }

  if (error?.name === 'TokenExpiredError') {
    return {
      statusCode: 401,
      code: 'TOKEN_EXPIRED',
      message: 'Your session has expired. Please sign in again.',
    };
  }

  if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') {
    return {
      statusCode: 401,
      code: 'INVALID_TOKEN',
      message: 'Your authentication token is invalid. Please sign in again.',
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong on our side. Please try again later.',
  };
}

export function notFoundHandler(req, res, next) {
  next(createNotFoundError(req.method, req.originalUrl));
}

export function errorHandler(error, req, res, next) {
  logger.error({ err: error, requestId: req.id }, 'Request failed');

  if (res.headersSent) {
    next(error);
    return;
  }

  const response = getErrorResponse(error);
  const errorBody = {
    code: response.code,
    message: response.message,
  };

  if (response.details) {
    errorBody.details = response.details;
  }

  res.status(response.statusCode).json({
    success: false,
    error: errorBody,
    requestId: req.id,
    ...(env.NODE_ENV !== 'production' &&
      response.code === 'INTERNAL_SERVER_ERROR' && {
        debug: { message: error.message },
      }),
  });
}

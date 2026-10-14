export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export function createNotFoundError(method, url) {
  return new AppError(`The requested route does not exist: ${method} ${url}`, {
    statusCode: 404,
    code: 'ROUTE_NOT_FOUND',
  });
}

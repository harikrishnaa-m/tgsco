import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { corsOrigins } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import routes from './routes/index.js';

const app = express();

app.disable('x-powered-by');
// Render terminates the client connection at a reverse proxy and forwards
// X-Forwarded-For to the application.
app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
    message: {
      success: false,
      message: 'Too many requests. Please wait a moment and try again.',
    },
    statusCode: 429,
  }),
);
app.use(pinoHttp({ logger }));
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api/v1', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

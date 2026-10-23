import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/tgsco'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DEFAULT_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  DEFAULT_ADMIN_PASSWORD: z.string().min(1).default('password'),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('development-access-secret-change-me-32'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('24h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  DO_SPACES_ENDPOINT: z.string().url().optional(),
  DO_SPACES_REGION: z.string().optional(),
  DO_SPACES_BUCKET: z.string().optional(),
  DO_SPACES_KEY: z.string().optional(),
  DO_SPACES_SECRET: z.string().optional(),
  DO_SPACES_CDN_URL: z.string().url().optional(),
  TWO_FACTOR_API_KEY: z.string().optional(),
  TWO_FACTOR_TEMPLATE_NAME: z.string().optional(),
  OTP_EXPIRES_MINUTES: z.coerce.number().int().positive().default(5),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  FACEBOOK_CONFIG_ID: z.string().optional(),
  FACEBOOK_REDIRECT_URI: z.string().url().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // The structured logger depends on valid environment configuration.
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration', parsedEnv.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsedEnv.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .flatMap((origin) => origin.split(/\s+/))
  .map((origin) => origin.trim())
  .filter(Boolean);

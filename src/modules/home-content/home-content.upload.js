import { randomUUID } from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';

function createImageUpload(maxFiles) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { files: maxFiles },
    fileFilter: (req, file, callback) => {
      if (!file.mimetype.startsWith('image/')) {
        callback(
          new AppError('Only image files can be uploaded for homepage content.', {
            statusCode: 400,
            code: 'INVALID_IMAGE_TYPE',
          }),
        );
        return;
      }

      callback(null, true);
    },
  });
}

export const homeImageUpload = createImageUpload(20);
export const regionalMapImageUpload = createImageUpload(100);

function getSpacesClient() {
  const required = [
    env.DO_SPACES_ENDPOINT,
    env.DO_SPACES_REGION,
    env.DO_SPACES_BUCKET,
    env.DO_SPACES_KEY,
    env.DO_SPACES_SECRET,
  ];

  if (required.some((value) => !value)) {
    throw new AppError('DigitalOcean Spaces is not configured.', {
      statusCode: 503,
      code: 'IMAGE_STORAGE_NOT_CONFIGURED',
    });
  }

  return new S3Client({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: env.DO_SPACES_REGION,
    credentials: {
      accessKeyId: env.DO_SPACES_KEY,
      secretAccessKey: env.DO_SPACES_SECRET,
    },
  });
}

function publicUrl(key) {
  if (env.DO_SPACES_CDN_URL) {
    return `${env.DO_SPACES_CDN_URL.replace(/\/$/, '')}/${key}`;
  }

  return `${env.DO_SPACES_ENDPOINT.replace(/\/$/, '')}/${env.DO_SPACES_BUCKET}/${key}`;
}

export async function uploadHomeImages(section, files = [], folder = 'home') {
  if (!files.length) {
    return [];
  }

  const client = getSpacesClient();
  const uploaded = [];
  for (let index = 0; index < files.length; index += 5) {
    const batch = files.slice(index, index + 5);
    uploaded.push(
      ...(await Promise.all(
        batch.map(async (file) => {
          const key = `${folder}/${section}/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`;

          await client.send(
            new PutObjectCommand({
              Bucket: env.DO_SPACES_BUCKET,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
              ACL: 'public-read',
              CacheControl: 'public, max-age=31536000, immutable',
            }),
          );

          return {
            field: file.fieldname,
            key,
            url: publicUrl(key),
          };
        }),
      )),
    );
  }
  return uploaded;
}

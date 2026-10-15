import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { createVideoKey } from './video-media.upload.js';

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
      code: 'VIDEO_STORAGE_NOT_CONFIGURED',
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
  const baseUrl = env.DO_SPACES_CDN_URL || `${env.DO_SPACES_ENDPOINT}/${env.DO_SPACES_BUCKET}`;
  return `${baseUrl.replace(/\/$/, '')}/${key}`;
}

function getKeyFromInput(input) {
  if (input.key) {
    return input.key;
  }

  if (input.url) {
    const url = new URL(input.url);
    const bucketPrefix = `/${env.DO_SPACES_BUCKET}/`;
    const prefixIndex = url.pathname.indexOf(bucketPrefix);
    if (prefixIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(prefixIndex + bucketPrefix.length));
    }

    if (env.DO_SPACES_CDN_URL && url.origin === new URL(env.DO_SPACES_CDN_URL).origin) {
      return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    }
  }

  throw new AppError('Provide the video storage key or public URL to delete.', {
    statusCode: 400,
    code: 'VIDEO_REFERENCE_REQUIRED',
  });
}

export async function uploadVideo(file) {
  const key = createVideoKey(file.originalname);
  const client = getSpacesClient();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        Body: createReadStream(file.path),
        ContentType: file.mimetype,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } finally {
    await unlink(file.path).catch(() => {});
  }

  return {
    key,
    url: publicUrl(key),
    contentType: file.mimetype,
    originalName: file.originalname,
  };
}

export async function deleteVideo(input) {
  const key = getKeyFromInput(input);
  await getSpacesClient().send(
    new DeleteObjectCommand({
      Bucket: env.DO_SPACES_BUCKET,
      Key: key,
    }),
  );

  return { key, message: 'The video was deleted successfully.' };
}

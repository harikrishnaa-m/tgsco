import { randomUUID } from 'node:crypto';
import multer from 'multer';

import { AppError } from '../../errors/app-error.js';

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
]);

export const videoUpload = multer({
  dest: 'tmp/videos',
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!VIDEO_MIME_TYPES.has(file.mimetype)) {
      callback(
        new AppError('Only supported video files can be uploaded.', {
          statusCode: 400,
          code: 'INVALID_VIDEO_TYPE',
        }),
      );
      return;
    }

    callback(null, true);
  },
});

export function createVideoKey(originalName) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '-');
  return `videos/${randomUUID()}-${safeName}`;
}

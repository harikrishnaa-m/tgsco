import { AppError } from '../../errors/app-error.js';
import { deleteVideo, uploadVideo } from './video-media.service.js';

export async function upload(req, res) {
  if (!req.file) {
    throw new AppError('Please attach one video file using the "video" field.', {
      statusCode: 400,
      code: 'VIDEO_FILE_REQUIRED',
    });
  }

  const data = await uploadVideo(req.file);
  res.status(201).json({ success: true, data });
}

export async function remove(req, res) {
  const data = await deleteVideo(req.body || {});
  res.status(200).json({ success: true, data });
}

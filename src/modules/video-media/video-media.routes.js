import { Router } from 'express';

import { requireAdmin } from '../auth/auth.middleware.js';
import { remove, upload } from './video-media.controller.js';
import { videoUpload } from './video-media.upload.js';

const router = Router();

router.post('/', requireAdmin, videoUpload.single('video'), upload);
router.delete('/', requireAdmin, remove);

export default router;

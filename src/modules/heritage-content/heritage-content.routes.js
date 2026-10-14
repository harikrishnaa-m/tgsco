import { Router } from 'express';

import { requireAdmin } from '../auth/auth.middleware.js';
import { homeImageUpload } from '../home-content/home-content.upload.js';
import { HERITAGE_SECTIONS } from './heritage-content.constants.js';
import { listSections, sectionController } from './heritage-content.controller.js';

const router = Router();

router.get('/', listSections);

for (const section of HERITAGE_SECTIONS) {
  const handlers = sectionController(section);
  router.get(`/${section}`, handlers.get);
  router.post(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.create);
  router.patch(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.update);
  router.delete(`/${section}`, requireAdmin, handlers.remove);
}

export default router;

import { Router } from 'express';

import { requireAdmin } from '../auth/auth.middleware.js';
import { ABOUT_SECTIONS } from './about-content.constants.js';
import { listSections, sectionController } from './about-content.controller.js';
import { homeImageUpload } from '../home-content/home-content.upload.js';

const router = Router();

router.get('/', listSections);

for (const section of ABOUT_SECTIONS) {
  const handlers = sectionController(section);

  router.get(`/${section}`, handlers.get);
  router.post(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.create);
  router.patch(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.update);
  router.delete(`/${section}`, requireAdmin, handlers.remove);
}

export default router;

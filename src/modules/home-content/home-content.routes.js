import { Router } from 'express';

import { requireAdmin } from '../auth/auth.middleware.js';
import { HOME_SECTIONS } from './home-content.constants.js';
import { listSections, sectionController } from './home-content.controller.js';
import { homeImageUpload } from './home-content.upload.js';

const router = Router();

router.get('/', listSections);

for (const section of HOME_SECTIONS) {
  const handlers = sectionController(section);

  router.get(`/${section}`, handlers.get);
  if (section === 'makers') {
    router.get(`/${section}/items/:slug`, handlers.getItem);
  }
  router.post(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.create);
  router.patch(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.update);
  router.delete(`/${section}`, requireAdmin, handlers.remove);
}

export default router;

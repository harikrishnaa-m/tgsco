import { Router } from 'express';

import { requireAdmin } from '../auth/auth.middleware.js';
import { homeImageUpload } from '../home-content/home-content.upload.js';
import { SCHEME_SECTIONS } from './scheme-content.constants.js';
import { listSections, sectionController } from './scheme-content.controller.js';

const router = Router();

router.get('/', listSections);

for (const section of SCHEME_SECTIONS) {
  const handlers = sectionController(section);

  router.get(`/${section}`, handlers.get);
  if (section === 'current-schemes') {
    router.get(`/${section}/items/:slug`, handlers.getItem);
  }
  router.post(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.create);
  router.patch(`/${section}`, requireAdmin, homeImageUpload.any(), handlers.update);
  router.delete(`/${section}`, requireAdmin, handlers.remove);
}

export default router;

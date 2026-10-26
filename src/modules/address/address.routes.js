import { Router } from 'express';

import { requireUser } from '../auth/auth.middleware.js';
import {
  create,
  getAddressById,
  getAddresses,
  remove,
  setDefault,
  update,
} from './address.controller.js';

const router = Router();

router.use(requireUser);
router.get('/', getAddresses);
router.post('/', create);
router.get('/:id', getAddressById);
router.patch('/:id', update);
router.patch('/:id/default', setDefault);
router.delete('/:id', remove);

export default router;

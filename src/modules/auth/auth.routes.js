import { Router } from 'express';

import {
  guestLogin,
  exchangeSocialCode,
  login,
  logout,
  passwordLogin,
  refresh,
  requestOtp,
  resendOtp,
  selectRole,
  socialCallback,
  socialRedirect,
  verifyOtp,
} from './auth.controller.js';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/ecommerce/request-otp', requestOtp);
router.post('/ecommerce/resend-otp', resendOtp);
router.post('/ecommerce/verify-otp', verifyOtp);
router.post('/ecommerce/select-role', selectRole);
router.post('/ecommerce/password-login', passwordLogin);
router.post('/ecommerce/guest', guestLogin);
router.post('/ecommerce/social/exchange', exchangeSocialCode);
router.get('/ecommerce/:provider', socialRedirect);
router.get('/ecommerce/:provider/callback', socialCallback);

export default router;

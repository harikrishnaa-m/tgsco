import {
  loginSchema,
  passwordLoginSchema,
  refreshTokenSchema,
  requestOtpSchema,
  roleSelectionSchema,
  socialLoginSchema,
  socialStartSchema,
  verifyOtpSchema,
} from './auth.validation.js';
import {
  createGuestSession,
  completeUserRegistration,
  getSocialAuthorizationUrl,
  loginAdmin,
  loginUserWithPassword,
  logoutAdmin,
  loginWithSocial,
  refreshAdminSession,
  requestUserOtp,
  verifyUserOtp,
} from './auth.service.js';

export async function login(req, res) {
  const { email, password } = loginSchema.parse(req.body);
  const data = await loginAdmin(email, password);

  res.status(200).json({ success: true, data });
}

export async function refresh(req, res) {
  const { refreshToken } = refreshTokenSchema.parse(req.body);
  const data = await refreshAdminSession(refreshToken);

  res.status(200).json({ success: true, data });
}

export async function logout(req, res) {
  const { refreshToken } = refreshTokenSchema.parse(req.body);
  await logoutAdmin(refreshToken);

  res.status(200).json({
    success: true,
    data: { message: 'You have been logged out successfully.' },
  });
}

export async function requestOtp(req, res) {
  const data = await requestUserOtp(requestOtpSchema.parse(req.body));
  res.status(200).json({ success: true, data });
}

export async function resendOtp(req, res) {
  const data = await requestUserOtp(requestOtpSchema.parse(req.body));
  res.status(200).json({ success: true, data });
}

export async function verifyOtp(req, res) {
  const data = await verifyUserOtp(verifyOtpSchema.parse(req.body));
  res.status(200).json({ success: true, data });
}

export async function selectRole(req, res) {
  const data = await completeUserRegistration(roleSelectionSchema.parse(req.body));
  res.status(200).json({ success: true, data });
}

export async function passwordLogin(req, res) {
  const data = await loginUserWithPassword(passwordLoginSchema.parse(req.body));
  res.status(200).json({ success: true, data });
}

export async function guestLogin(req, res) {
  res.status(200).json({ success: true, data: await createGuestSession() });
}

export async function socialRedirect(req, res) {
  const { role } = socialStartSchema.parse(req.query);
  res.redirect(getSocialAuthorizationUrl(req.params.provider, role));
}

export async function socialCallback(req, res) {
  const data = socialLoginSchema.parse(req.query);
  const result = await loginWithSocial(req.params.provider, data.code, data.role, data.rememberMe);
  res.status(200).json({ success: true, data: result });
}

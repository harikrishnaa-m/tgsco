import {
  loginSchema,
  passwordLoginSchema,
  refreshTokenSchema,
  requestOtpSchema,
  roleSelectionSchema,
  socialCallbackSchema,
  socialExchangeSchema,
  socialStartSchema,
  verifyOtpSchema,
} from './auth.validation.js';
import { AppError } from '../../errors/app-error.js';
import {
  beginSocialAuthorization,
  createGuestSession,
  createSocialLoginHandoff,
  completeUserRegistration,
  consumeSocialOAuthState,
  exchangeSocialLoginHandoff,
  getFrontendSocialCallbackUrl,
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
  const { role, rememberMe } = socialStartSchema.parse(req.query);
  res.redirect(await beginSocialAuthorization(req.params.provider, role, rememberMe));
}

export async function socialCallback(req, res) {
  const data = socialCallbackSchema.parse(req.query);
  const oauthState = await consumeSocialOAuthState(req.params.provider, data.state);
  const callbackUrl = getFrontendSocialCallbackUrl();

  if (data.error) {
    callbackUrl.searchParams.set('error', 'SOCIAL_AUTH_CANCELLED');
  } else {
    if (!data.code) {
      throw new AppError('The social provider callback did not include an authorization code.', {
        statusCode: 400,
        code: 'SOCIAL_AUTH_CODE_MISSING',
      });
    }
    const result = await loginWithSocial(req.params.provider, data.code, oauthState.role);
    const code = await createSocialLoginHandoff(result, oauthState.rememberMe);
    callbackUrl.searchParams.set('code', code);
  }

  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Referrer-Policy', 'no-referrer');
  res.redirect(303, callbackUrl.toString());
}

export async function exchangeSocialCode(req, res) {
  const { code } = socialExchangeSchema.parse(req.body);
  const data = await exchangeSocialLoginHandoff(code);
  res.status(200).json({ success: true, data });
}

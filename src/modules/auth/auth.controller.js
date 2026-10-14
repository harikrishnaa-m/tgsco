import { loginSchema, refreshTokenSchema } from './auth.validation.js';
import { loginAdmin, logoutAdmin, refreshAdminSession } from './auth.service.js';

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

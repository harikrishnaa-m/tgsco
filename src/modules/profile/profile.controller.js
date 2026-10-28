import { AppError } from '../../errors/app-error.js';
import { passwordUpdateSchema, profileUpdateSchema } from './profile.validation.js';
import { getProfile, updatePassword, updateProfile } from './profile.service.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('Profile request is invalid.', {
      statusCode: 400,
      code: 'INVALID_PROFILE_REQUEST',
      details: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export async function get(req, res) {
  res.json({ success: true, data: await getProfile(req.user) });
}

export async function update(req, res) {
  res.json({
    success: true,
    data: await updateProfile(req.user, parse(profileUpdateSchema, req.body)),
  });
}

export async function password(req, res) {
  res.json({
    success: true,
    data: await updatePassword(req.user, parse(passwordUpdateSchema, req.body)),
  });
}

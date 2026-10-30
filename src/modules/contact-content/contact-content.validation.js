import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { sectionContentSchema } from '../home-content/home-content.validation.js';

const regionalMapLocationSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  image: z.string().trim().min(1),
  address: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().min(1),
  timing: z.string().trim().min(1),
  directionUrl: z.string().trim().url(),
});

const regionalMapRegionSchema = z.object({
  regionId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'regionId must be lowercase words separated by hyphens.'),
  regionName: z.string().trim().min(1),
  locations: z.array(regionalMapLocationSchema).min(1),
});

const regionalMapContentSchema = z.object({
  eyebrow: z.string().trim().min(1),
  regions: z.array(regionalMapRegionSchema).min(1),
});

export function parseContactSectionContent(section, content) {
  const parsed =
    section === 'regional-map'
      ? regionalMapContentSchema.safeParse(content)
      : sectionContentSchema.safeParse(content);

  if (!parsed.success) {
    throw new AppError('The contact section content is invalid.', {
      statusCode: 400,
      code: 'INVALID_CONTACT_SECTION_CONTENT',
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

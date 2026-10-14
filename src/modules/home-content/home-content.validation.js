import { z } from 'zod';
import { AppError } from '../../errors/app-error.js';

export const sectionContentSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, 'Please provide section content.');

const PAIRED_IMAGE_SECTIONS = new Set(['techniques', 'featured-collections']);

export function validatePairedSectionImages(section, content, files, requireImages) {
  if (!PAIRED_IMAGE_SECTIONS.has(section) || (!requireImages && files.length === 0)) {
    return;
  }

  if (!Array.isArray(content.items) || content.items.length === 0) {
    throw new AppError('This section must contain a non-empty items array.', {
      statusCode: 400,
      code: 'INVALID_SECTION_ITEMS',
    });
  }

  const expectedFields = new Set();
  for (const [index] of content.items.entries()) {
    expectedFields.add(`items[${index}].mainImage`);
    expectedFields.add(`items[${index}].borderImage`);
  }

  const receivedFields = files.map((file) => file.fieldname);
  const allowedFields = new Set([...expectedFields, 'backgroundImage']);
  const duplicateFields = receivedFields.filter(
    (field, index) => receivedFields.indexOf(field) !== index,
  );
  const invalidFields = receivedFields.filter((field) => !allowedFields.has(field));
  const missingFields = [...expectedFields].filter((field) => !receivedFields.includes(field));

  if (duplicateFields.length || invalidFields.length || missingFields.length) {
    throw new AppError(
      'Each item must include exactly one mainImage and one borderImage file.',
      {
        statusCode: 400,
        code: 'PAIRED_IMAGES_REQUIRED',
        details: {
          missingFields,
          invalidFields,
          duplicateFields,
        },
      },
    );
  }
}

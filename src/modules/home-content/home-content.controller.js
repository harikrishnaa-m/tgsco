import { AppError } from '../../errors/app-error.js';
import {
  sectionContentSchema,
  validatePairedSectionImages,
} from './home-content.validation.js';
import {
  createHomeSection,
  deleteHomeSection,
  getHomeSection,
  listHomeSections,
  updateHomeSection,
} from './home-content.service.js';

export async function listSections(req, res) {
  const data = await listHomeSections();
  res.status(200).json({ success: true, data });
}

function parseContent(req) {
  const rawContent = req.body.content || req.body.data;
  let content = rawContent;

  if (typeof rawContent === 'string') {
    try {
      content = JSON.parse(rawContent);
    } catch {
      throw new AppError('The content field must contain valid JSON.', {
        statusCode: 400,
        code: 'INVALID_CONTENT_JSON',
      });
    }
  }

  return sectionContentSchema.parse(content);
}

export function sectionController(section) {
  return {
    async get(req, res) {
      const data = await getHomeSection(section);
      res.status(200).json({ success: true, data });
    },

    async create(req, res) {
      const content = parseContent(req);
      validatePairedSectionImages(section, content, req.files, true);
      const data = await createHomeSection(section, content, req.files);
      res.status(201).json({ success: true, data });
    },

    async update(req, res) {
      const content = parseContent(req);
      validatePairedSectionImages(section, content, req.files, false);
      const data = await updateHomeSection(section, content, req.files);
      res.status(200).json({ success: true, data });
    },

    async remove(req, res) {
      await deleteHomeSection(section);
      res.status(200).json({
        success: true,
        data: { message: `The ${section} homepage section was deleted successfully.` },
      });
    },
  };
}

export async function createSection(req, res) {
  const data = await createHomeSection(req.params.section, parseContent(req), req.files);
  res.status(201).json({ success: true, data });
}

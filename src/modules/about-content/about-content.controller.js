import { AppError } from '../../errors/app-error.js';
import { sectionContentSchema } from '../home-content/home-content.validation.js';
import {
  deleteAboutSection,
  getAboutSection,
  listAboutSections,
  saveAboutSection,
} from './about-content.service.js';

export async function listSections(req, res) {
  const data = await listAboutSections();
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
      const data = await getAboutSection(section);
      res.status(200).json({ success: true, data });
    },

    async create(req, res) {
      const data = await saveAboutSection(section, parseContent(req), req.files, true);
      res.status(201).json({ success: true, data });
    },

    async update(req, res) {
      const data = await saveAboutSection(section, parseContent(req), req.files, false);
      res.status(200).json({ success: true, data });
    },

    async remove(req, res) {
      await deleteAboutSection(section);
      res.status(200).json({
        success: true,
        data: { message: `The ${section} about section was deleted successfully.` },
      });
    },
  };
}

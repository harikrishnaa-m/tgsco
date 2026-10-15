import { AppError } from '../../errors/app-error.js';
import { sectionContentSchema } from '../home-content/home-content.validation.js';
import {
  deleteContactSection,
  getContactItem,
  getContactSection,
  listContactSections,
  saveContactSection,
} from './contact-content.service.js';

export async function listSections(req, res) {
  res.status(200).json({ success: true, data: await listContactSections() });
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
      res.status(200).json({ success: true, data: await getContactSection(section) });
    },

    async getItem(req, res) {
      res.status(200).json({ success: true, data: await getContactItem(section, req.params.slug) });
    },

    async create(req, res) {
      res.status(201).json({
        success: true,
        data: await saveContactSection(section, parseContent(req), req.files, true),
      });
    },

    async update(req, res) {
      res.status(200).json({
        success: true,
        data: await saveContactSection(section, parseContent(req), req.files, false),
      });
    },

    async remove(req, res) {
      await deleteContactSection(section);
      res.status(200).json({
        success: true,
        data: { message: `The ${section} contact section was deleted successfully.` },
      });
    },
  };
}

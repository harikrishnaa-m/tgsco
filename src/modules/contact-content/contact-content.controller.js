import { parseContactSectionContent } from './contact-content.validation.js';
import {
  deleteContactSection,
  getContactItem,
  getContactSection,
  listContactSections,
  saveContactSection,
} from './contact-content.service.js';
import { parsePortfolioContent } from '../portfolio-content/portfolio-content.utils.js';

export async function listSections(req, res) {
  res.status(200).json({ success: true, data: await listContactSections() });
}

function parseContent(req) {
  return parsePortfolioContent(req);
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
        data: await saveContactSection(
          section,
          parseContactSectionContent(section, parseContent(req)),
          req.files,
          true,
        ),
      });
    },

    async update(req, res) {
      res.status(200).json({
        success: true,
        data: await saveContactSection(
          section,
          parseContactSectionContent(section, parseContent(req), true),
          req.files,
          false,
        ),
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

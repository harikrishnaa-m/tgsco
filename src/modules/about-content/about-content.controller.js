import {
  sectionContentPatchSchema,
  sectionContentSchema,
} from '../home-content/home-content.validation.js';
import { parsePortfolioContent } from '../portfolio-content/portfolio-content.utils.js';
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

function parseContent(req, partial = false) {
  return (partial ? sectionContentPatchSchema : sectionContentSchema).parse(
    parsePortfolioContent(req),
  );
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
      const data = await saveAboutSection(section, parseContent(req, true), req.files, false);
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

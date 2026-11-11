import {
  sectionContentPatchSchema,
  sectionContentSchema,
} from '../home-content/home-content.validation.js';
import { parsePortfolioContent } from '../portfolio-content/portfolio-content.utils.js';
import {
  deleteHeritageSection,
  getHeritageSection,
  listHeritageSections,
  saveHeritageSection,
} from './heritage-content.service.js';

export async function listSections(req, res) {
  res.status(200).json({ success: true, data: await listHeritageSections() });
}

function parseContent(req, partial = false) {
  return (partial ? sectionContentPatchSchema : sectionContentSchema).parse(
    parsePortfolioContent(req),
  );
}

export function sectionController(section) {
  return {
    async get(req, res) {
      res.status(200).json({ success: true, data: await getHeritageSection(section) });
    },
    async create(req, res) {
      res.status(201).json({
        success: true,
        data: await saveHeritageSection(section, parseContent(req), req.files, true),
      });
    },
    async update(req, res) {
      res.status(200).json({
        success: true,
        data: await saveHeritageSection(section, parseContent(req, true), req.files, false),
      });
    },
    async remove(req, res) {
      await deleteHeritageSection(section);
      res.status(200).json({
        success: true,
        data: { message: `The ${section} heritage section was deleted successfully.` },
      });
    },
  };
}

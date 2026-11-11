import {
  sectionContentPatchSchema,
  sectionContentSchema,
} from '../home-content/home-content.validation.js';
import { parsePortfolioContent } from '../portfolio-content/portfolio-content.utils.js';
import {
  deleteNewsSection,
  getNewsItem,
  getNewsSection,
  listNewsSections,
  saveNewsSection,
} from './news-content.service.js';

export async function listSections(req, res) {
  res.status(200).json({ success: true, data: await listNewsSections() });
}

function parseContent(req, partial = false) {
  return (partial ? sectionContentPatchSchema : sectionContentSchema).parse(
    parsePortfolioContent(req),
  );
}

export function sectionController(section) {
  return {
    async get(req, res) {
      res.status(200).json({ success: true, data: await getNewsSection(section) });
    },
    async getItem(req, res) {
      res.status(200).json({ success: true, data: await getNewsItem(section, req.params.slug) });
    },
    async create(req, res) {
      res.status(201).json({
        success: true,
        data: await saveNewsSection(section, parseContent(req), req.files, true),
      });
    },
    async update(req, res) {
      res.status(200).json({
        success: true,
        data: await saveNewsSection(section, parseContent(req, true), req.files, false),
      });
    },
    async remove(req, res) {
      await deleteNewsSection(section);
      res.status(200).json({
        success: true,
        data: { message: `The ${section} news and events section was deleted successfully.` },
      });
    },
  };
}

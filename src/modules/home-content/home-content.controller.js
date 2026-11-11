import {
  chroniclesSectionPatchSchema,
  chroniclesSectionContentSchema,
  sectionContentPatchSchema,
  sectionContentSchema,
  validatePairedSectionImages,
} from './home-content.validation.js';
import {
  createHomeSection,
  deleteHomeSection,
  getHomeItem,
  getHomeSection,
  listHomeSections,
  updateHomeSection,
} from './home-content.service.js';
import { parsePortfolioContent } from '../portfolio-content/portfolio-content.utils.js';

export async function listSections(req, res) {
  const data = await listHomeSections();
  res.status(200).json({ success: true, data });
}

function parseContent(req, section, partial = false) {
  const content = parsePortfolioContent(req);
  const schema =
    section === 'chronicles-of-thread'
      ? partial
        ? chroniclesSectionPatchSchema
        : chroniclesSectionContentSchema
      : partial
        ? sectionContentPatchSchema
        : sectionContentSchema;
  return schema.parse(content);
}

export function sectionController(section) {
  return {
    async get(req, res) {
      const data = await getHomeSection(section);
      res.status(200).json({ success: true, data });
    },

    async getItem(req, res) {
      const data = await getHomeItem(section, req.params.slug);
      res.status(200).json({ success: true, data });
    },

    async create(req, res) {
      const content = parseContent(req, section);
      validatePairedSectionImages(section, content, req.files, true);
      const data = await createHomeSection(section, content, req.files);
      res.status(201).json({ success: true, data });
    },

    async update(req, res) {
      const content = parseContent(req, section, true);
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
  const data = await createHomeSection(
    req.params.section,
    parseContent(req, req.params.section),
    req.files,
  );
  res.status(201).json({ success: true, data });
}

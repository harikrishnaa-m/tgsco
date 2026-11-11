import { AppError } from '../../errors/app-error.js';
import { SchemeSection } from '../../models/scheme-section.model.js';
import {
  latestImagesByField,
  replaceImagesByField,
  uploadHomeImages,
} from '../home-content/home-content.upload.js';
import { mergePortfolioContent } from '../portfolio-content/portfolio-content.utils.js';

function serializeSection(section) {
  return {
    id: section._id.toString(),
    section: section.section,
    content: section.content,
    images: latestImagesByField(section.images),
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

export async function listSchemeSections() {
  const sections = await SchemeSection.find().sort({ section: 1 }).lean();
  return sections.map(serializeSection);
}

export async function getSchemeSection(sectionName) {
  const section = await SchemeSection.findOne({ section: sectionName }).lean();

  if (!section) {
    throw new AppError(`The scheme section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'SCHEME_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function getSchemeItem(sectionName, slug) {
  const section = await getSchemeSection(sectionName);
  const item = (section.content.schemes || []).find(
    (entry) => entry.slug === slug || entry.id === slug,
  );

  if (!item) {
    throw new AppError(`The scheme "${slug}" was not found.`, {
      statusCode: 404,
      code: 'SCHEME_ITEM_NOT_FOUND',
    });
  }

  return { section: sectionName, item };
}

export async function saveSchemeSection(sectionName, content, files, isCreate) {
  const currentSection = !isCreate
    ? await SchemeSection.findOne({ section: sectionName }).select('content images').lean()
    : null;
  if (!isCreate && !currentSection) {
    throw new AppError(`The scheme section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'SCHEME_SECTION_NOT_FOUND',
    });
  }

  const savedContent = isCreate ? content : mergePortfolioContent(currentSection.content, content);
  const images = await uploadHomeImages(sectionName, files, 'schemes');
  const updatedImages = replaceImagesByField(currentSection?.images, images);
  const section = isCreate
    ? await SchemeSection.create({ section: sectionName, content: savedContent, images })
    : await SchemeSection.findOneAndUpdate(
        { section: sectionName },
        images.length
          ? { $set: { content: savedContent, images: updatedImages } }
          : { $set: { content: savedContent } },
        { new: true, runValidators: true },
      );

  if (!section) {
    throw new AppError(`The scheme section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'SCHEME_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function deleteSchemeSection(sectionName) {
  const section = await SchemeSection.findOneAndDelete({ section: sectionName });

  if (!section) {
    throw new AppError(`The scheme section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'SCHEME_SECTION_NOT_FOUND',
    });
  }
}

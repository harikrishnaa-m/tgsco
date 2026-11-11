import { AppError } from '../../errors/app-error.js';
import { NewsSection } from '../../models/news-section.model.js';
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

export async function listNewsSections() {
  const sections = await NewsSection.find().sort({ section: 1 }).lean();
  return sections.map(serializeSection);
}

export async function getNewsSection(sectionName) {
  const section = await NewsSection.findOne({ section: sectionName }).lean();
  if (!section) {
    throw new AppError(`The news and events section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'NEWS_SECTION_NOT_FOUND',
    });
  }
  return serializeSection(section);
}

export async function getNewsItem(sectionName, slug) {
  const section = await getNewsSection(sectionName);
  const items = section.content.items || section.content.articles || section.content.cards || [];
  const item = items.find((entry) => entry.slug === slug || entry.id === slug);
  if (!item) {
    throw new AppError(`The item "${slug}" was not found in "${sectionName}".`, {
      statusCode: 404,
      code: 'NEWS_ITEM_NOT_FOUND',
    });
  }
  return { section: sectionName, item };
}

export async function saveNewsSection(sectionName, content, files, isCreate) {
  const currentSection = !isCreate
    ? await NewsSection.findOne({ section: sectionName }).select('content images').lean()
    : null;
  if (!isCreate && !currentSection) {
    throw new AppError(`The news and events section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'NEWS_SECTION_NOT_FOUND',
    });
  }

  const savedContent = isCreate ? content : mergePortfolioContent(currentSection.content, content);
  const images = await uploadHomeImages(sectionName, files, 'news-events');
  const updatedImages = replaceImagesByField(currentSection?.images, images);
  const section = isCreate
    ? await NewsSection.create({ section: sectionName, content: savedContent, images })
    : await NewsSection.findOneAndUpdate(
        { section: sectionName },
        images.length
          ? { $set: { content: savedContent, images: updatedImages } }
          : { $set: { content: savedContent } },
        { new: true, runValidators: true },
      );
  if (!section) {
    throw new AppError(`The news and events section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'NEWS_SECTION_NOT_FOUND',
    });
  }
  return serializeSection(section);
}

export async function deleteNewsSection(sectionName) {
  const section = await NewsSection.findOneAndDelete({ section: sectionName });
  if (!section) {
    throw new AppError(`The news and events section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'NEWS_SECTION_NOT_FOUND',
    });
  }
}

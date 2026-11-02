import { AppError } from '../../errors/app-error.js';
import { HeritageSection } from '../../models/heritage-section.model.js';
import {
  latestImagesByField,
  replaceImagesByField,
  uploadHomeImages,
} from '../home-content/home-content.upload.js';

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

export async function listHeritageSections() {
  const sections = await HeritageSection.find().sort({ section: 1 }).lean();
  return sections.map(serializeSection);
}

export async function getHeritageSection(sectionName) {
  const section = await HeritageSection.findOne({ section: sectionName }).lean();
  if (!section) {
    throw new AppError(`The heritage section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'HERITAGE_SECTION_NOT_FOUND',
    });
  }
  return serializeSection(section);
}

export async function saveHeritageSection(sectionName, content, files, isCreate) {
  const images = await uploadHomeImages(sectionName, files, 'heritage');
  const currentSection =
    !isCreate && images.length
      ? await HeritageSection.findOne({ section: sectionName }).select('images').lean()
      : null;
  const updatedImages = replaceImagesByField(currentSection?.images, images);
  const section = isCreate
    ? await HeritageSection.create({ section: sectionName, content, images })
    : await HeritageSection.findOneAndUpdate(
        { section: sectionName },
        images.length ? { $set: { content, images: updatedImages } } : { $set: { content } },
        { new: true, runValidators: true },
      );

  if (!section) {
    throw new AppError(`The heritage section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'HERITAGE_SECTION_NOT_FOUND',
    });
  }
  return serializeSection(section);
}

export async function deleteHeritageSection(sectionName) {
  const section = await HeritageSection.findOneAndDelete({ section: sectionName });
  if (!section) {
    throw new AppError(`The heritage section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'HERITAGE_SECTION_NOT_FOUND',
    });
  }
}

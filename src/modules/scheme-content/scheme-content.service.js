import { AppError } from '../../errors/app-error.js';
import { SchemeSection } from '../../models/scheme-section.model.js';
import { uploadHomeImages } from '../home-content/home-content.upload.js';

function serializeSection(section) {
  return {
    id: section._id.toString(),
    section: section.section,
    content: section.content,
    images: section.images,
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

export async function saveSchemeSection(sectionName, content, files, isCreate) {
  const images = await uploadHomeImages(sectionName, files, 'schemes');
  const section = isCreate
    ? await SchemeSection.create({ section: sectionName, content, images })
    : await SchemeSection.findOneAndUpdate(
        { section: sectionName },
        images.length
          ? { $set: { content }, $push: { images: { $each: images } } }
          : { $set: { content } },
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

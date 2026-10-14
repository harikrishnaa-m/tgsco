import { AppError } from '../../errors/app-error.js';
import { HomeSection } from '../../models/home-section.model.js';
import { uploadHomeImages } from './home-content.upload.js';

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

export async function listHomeSections() {
  const sections = await HomeSection.find().sort({ section: 1 }).lean();
  return sections.map(serializeSection);
}

export async function getHomeSection(sectionName) {
  const section = await HomeSection.findOne({ section: sectionName }).lean();

  if (!section) {
    throw new AppError(`The homepage section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'HOME_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function saveHomeSection(sectionName, content, files, isCreate) {
  const images = await uploadHomeImages(sectionName, files);
  const section = isCreate
    ? await HomeSection.create({ section: sectionName, content, images })
    : await HomeSection.findOneAndUpdate(
        { section: sectionName },
        images.length
          ? { $set: { content }, $push: { images: { $each: images } } }
          : { $set: { content } },
        { new: true, runValidators: true },
      );

  if (!section) {
    throw new AppError(`The homepage section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'HOME_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function updateHomeSection(sectionName, content, files) {
  return saveHomeSection(sectionName, content, files, false);
}

export async function createHomeSection(sectionName, content, files) {
  return saveHomeSection(sectionName, content, files, true);
}

export async function deleteHomeSection(sectionName) {
  const section = await HomeSection.findOneAndDelete({ section: sectionName });

  if (!section) {
    throw new AppError(`The homepage section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'HOME_SECTION_NOT_FOUND',
    });
  }
}

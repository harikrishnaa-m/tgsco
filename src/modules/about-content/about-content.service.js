import { AppError } from '../../errors/app-error.js';
import { AboutSection } from '../../models/about-section.model.js';
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

export async function listAboutSections() {
  const sections = await AboutSection.find().sort({ section: 1 }).lean();
  return sections.map(serializeSection);
}

export async function getAboutSection(sectionName) {
  const section = await AboutSection.findOne({ section: sectionName }).lean();

  if (!section) {
    throw new AppError(`The about section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'ABOUT_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function saveAboutSection(sectionName, content, files, isCreate) {
  const images = await uploadHomeImages(sectionName, files, 'about');
  const section = isCreate
    ? await AboutSection.create({ section: sectionName, content, images })
    : await AboutSection.findOneAndUpdate(
        { section: sectionName },
        images.length
          ? { $set: { content }, $push: { images: { $each: images } } }
          : { $set: { content } },
        { new: true, runValidators: true },
      );

  if (!section) {
    throw new AppError(`The about section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'ABOUT_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function deleteAboutSection(sectionName) {
  const section = await AboutSection.findOneAndDelete({ section: sectionName });

  if (!section) {
    throw new AppError(`The about section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'ABOUT_SECTION_NOT_FOUND',
    });
  }
}

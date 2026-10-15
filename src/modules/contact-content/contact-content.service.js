import { AppError } from '../../errors/app-error.js';
import { ContactSection } from '../../models/contact-section.model.js';
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

export async function listContactSections() {
  const sections = await ContactSection.find().sort({ section: 1 }).lean();
  return sections.map(serializeSection);
}

export async function getContactSection(sectionName) {
  const section = await ContactSection.findOne({ section: sectionName }).lean();
  if (!section) {
    throw new AppError(`The contact section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'CONTACT_SECTION_NOT_FOUND',
    });
  }
  return serializeSection(section);
}

export async function getContactItem(sectionName, slug) {
  const section = await getContactSection(sectionName);
  const item = (section.content.items || section.content.locations || []).find(
    (entry) => entry.slug === slug || entry.id === slug,
  );

  if (!item) {
    throw new AppError(`The item "${slug}" was not found in "${sectionName}".`, {
      statusCode: 404,
      code: 'CONTACT_ITEM_NOT_FOUND',
    });
  }

  return { section: sectionName, item };
}

export async function saveContactSection(sectionName, content, files, isCreate) {
  const images = await uploadHomeImages(sectionName, files, 'contact');
  const section = isCreate
    ? await ContactSection.create({ section: sectionName, content, images })
    : await ContactSection.findOneAndUpdate(
        { section: sectionName },
        images.length
          ? { $set: { content }, $push: { images: { $each: images } } }
          : { $set: { content } },
        { new: true, runValidators: true },
      );

  if (!section) {
    throw new AppError(`The contact section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'CONTACT_SECTION_NOT_FOUND',
    });
  }

  return serializeSection(section);
}

export async function deleteContactSection(sectionName) {
  const section = await ContactSection.findOneAndDelete({ section: sectionName });
  if (!section) {
    throw new AppError(`The contact section "${sectionName}" was not found.`, {
      statusCode: 404,
      code: 'CONTACT_SECTION_NOT_FOUND',
    });
  }
}

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

function setNestedValue(target, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = target;

  for (const part of parts.slice(0, -1)) {
    current = current[part];
  }

  current[parts.at(-1)] = value;
}

function applyUploadedImages(content, images) {
  const updatedContent = structuredClone(content);

  for (const image of images) {
    if (image.field.startsWith('regions[') && image.field.endsWith('.image')) {
      setNestedValue(updatedContent, image.field, image.url);
    }
  }

  return updatedContent;
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
  const items =
    section.content.items ||
    section.content.locations ||
    (section.content.regions || []).flatMap((region) => region.locations || []);
  const item = items.find((entry) => entry.slug === slug || entry.id === slug);

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
  const savedContent =
    sectionName === 'regional-map' ? applyUploadedImages(content, images) : content;
  const section =
    isCreate && sectionName !== 'regional-map'
      ? await ContactSection.create({ section: sectionName, content: savedContent, images })
      : sectionName === 'regional-map'
        ? await ContactSection.findOneAndUpdate(
            { section: sectionName },
            images.length
              ? {
                  $set: { content: savedContent },
                  $push: { images: { $each: images } },
                  $setOnInsert: { section: sectionName },
                }
              : { $set: { content: savedContent }, $setOnInsert: { section: sectionName } },
            { new: true, upsert: true, runValidators: true },
          )
        : await ContactSection.findOneAndUpdate(
            { section: sectionName },
            images.length
              ? { $set: { content: savedContent }, $push: { images: { $each: images } } }
              : { $set: { content: savedContent } },
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

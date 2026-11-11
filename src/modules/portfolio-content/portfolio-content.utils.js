import { AppError } from '../../errors/app-error.js';

export function parsePortfolioContent(req) {
  const body = req.body ?? {};
  const rawContent = body.content ?? body.data ?? body;
  let content = rawContent;

  if (typeof rawContent === 'string') {
    try {
      content = JSON.parse(rawContent);
    } catch {
      throw new AppError('The content field must contain valid JSON.', {
        statusCode: 400,
        code: 'INVALID_CONTENT_JSON',
      });
    }
  }

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new AppError('The content field must contain a JSON object.', {
      statusCode: 400,
      code: 'INVALID_CONTENT_JSON',
    });
  }

  return content;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

export function mergePortfolioContent(existingContent, patchContent) {
  if (!isPlainObject(patchContent)) return structuredClone(patchContent);

  const mergedContent = isPlainObject(existingContent) ? structuredClone(existingContent) : {};
  for (const [key, value] of Object.entries(patchContent)) {
    mergedContent[key] =
      isPlainObject(value) && isPlainObject(mergedContent[key])
        ? mergePortfolioContent(mergedContent[key], value)
        : structuredClone(value);
  }
  return mergedContent;
}

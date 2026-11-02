export const HOME_SECTIONS = [
  'hero',
  'our-story',
  'chronicles-of-thread',
  'techniques',
  'journey',
  'makers',
  'why-choose-us',
  'featured-collections',
  'government-initiatives',
  'blog',
  'news-events',
  'footer',
];

export function isHomeSection(value) {
  return HOME_SECTIONS.includes(value);
}

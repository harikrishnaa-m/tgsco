import { describe, expect, it } from 'vitest';

import {
  latestImagesByField,
  replaceImagesByField,
} from '../src/modules/home-content/home-content.upload.js';
import { validatePairedSectionImages } from '../src/modules/home-content/home-content.validation.js';

describe('content image record updates', () => {
  it('allows replacing one image field in a partial section update', () => {
    expect(() =>
      validatePairedSectionImages(
        'techniques',
        { items: [{ name: 'Ikat', mainImage: 'old-main.jpg', borderImage: 'old-border.jpg' }] },
        [{ fieldname: 'items[0].mainImage' }],
        false,
      ),
    ).not.toThrow();
  });

  it('allows replacing one Chronicles image in a partial section update', () => {
    expect(() =>
      validatePairedSectionImages('chronicles-of-thread', {}, [{ fieldname: 'leftImage' }], false),
    ).not.toThrow();
  });

  it('keeps only the latest record per field when serializing', () => {
    const images = latestImagesByField([
      { field: 'cards[0].image', url: 'old-card-0.jpg' },
      { field: 'cards[1].image', url: 'card-1.jpg' },
      { field: 'cards[0].image', url: 'new-card-0.jpg' },
    ]);

    expect(images).toEqual([
      { field: 'cards[0].image', url: 'new-card-0.jpg' },
      { field: 'cards[1].image', url: 'card-1.jpg' },
    ]);
  });

  it('replaces uploaded fields while retaining other fields and removing legacy duplicates', () => {
    const images = replaceImagesByField(
      [
        { field: 'cards[0].image', url: 'old-card-0.jpg' },
        { field: 'cards[0].image', url: 'previous-card-0.jpg' },
        { field: 'cards[1].image', url: 'card-1.jpg' },
      ],
      [
        { field: 'cards[0].image', url: 'new-card-0.jpg' },
        { field: 'cards[0].image', url: 'latest-card-0.jpg' },
      ],
    );

    expect(images).toEqual([
      { field: 'cards[1].image', url: 'card-1.jpg' },
      { field: 'cards[0].image', url: 'latest-card-0.jpg' },
    ]);
  });
});

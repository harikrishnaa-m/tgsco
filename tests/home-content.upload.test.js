import { describe, expect, it } from 'vitest';

import {
  latestImagesByField,
  replaceImagesByField,
} from '../src/modules/home-content/home-content.upload.js';

describe('content image record updates', () => {
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

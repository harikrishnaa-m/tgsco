import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/app-error.js';
import { parseContactSectionContent } from '../src/modules/contact-content/contact-content.validation.js';

const location = {
  id: 'loc-hyderabad-01',
  title: 'Sample TGSCO Office, Hyderabad',
  lat: 17.385,
  lng: 78.4867,
  image: 'https://images.example.com/sample-office.jpg',
  address: 'Sample address, Hyderabad, Telangana',
  phone: '+91 90000 10001',
  email: 'sample.hyderabad@tgsco.example',
  timing: 'Sample hours: Mon-Sat 10:00 AM - 6:00 PM',
  directionUrl: 'https://maps.google.com/?q=17.385,78.4867',
};

describe('regional map content validation', () => {
  it('accepts required numeric latitude and longitude coordinates', () => {
    const result = parseContactSectionContent('regional-map', {
      eyebrow: 'Regional Map',
      regions: [
        {
          regionId: 'hyderabad',
          regionName: 'Hyderabad',
          locations: [location],
        },
      ],
    });

    expect(result.regions[0].locations[0]).toMatchObject({ lat: 17.385, lng: 78.4867 });
  });

  it('rejects missing or out-of-range map coordinates', () => {
    expect(() =>
      parseContactSectionContent('regional-map', {
        eyebrow: 'Regional Map',
        regions: [
          {
            regionId: 'hyderabad',
            regionName: 'Hyderabad',
            locations: [{ ...location, lat: undefined }],
          },
        ],
      }),
    ).toThrow(AppError);

    expect(() =>
      parseContactSectionContent('regional-map', {
        eyebrow: 'Regional Map',
        regions: [
          {
            regionId: 'hyderabad',
            regionName: 'Hyderabad',
            locations: [{ ...location, lng: 181 }],
          },
        ],
      }),
    ).toThrow(AppError);
  });
});

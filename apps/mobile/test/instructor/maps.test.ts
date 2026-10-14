import { describe, expect, it } from 'vitest';
import { mapsUrl } from '../../src/lib/maps';

const PICKUP = { lat: 52.52, lng: 13.388, address: 'Friedrichstraße 100, 10117 Berlin' };

describe('mapsUrl', () => {
  it('opens Apple Maps directions to the coordinates on iOS', () => {
    expect(mapsUrl(PICKUP, 'ios')).toBe('https://maps.apple.com/?daddr=52.52%2C13.388');
  });

  it('opens Google Maps directions to the coordinates on Android and the web', () => {
    const google = 'https://www.google.com/maps/dir/?api=1&destination=52.52%2C13.388';
    expect(mapsUrl(PICKUP, 'android')).toBe(google);
    expect(mapsUrl(PICKUP, 'web')).toBe(google);
  });

  it('falls back to the address when there are no coordinates', () => {
    const pickup = { lat: null, lng: null, address: PICKUP.address };
    expect(mapsUrl(pickup, 'ios')).toBe(
      'https://maps.apple.com/?daddr=Friedrichstra%C3%9Fe+100%2C+10117+Berlin',
    );
    expect(mapsUrl(pickup, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Friedrichstra%C3%9Fe+100%2C+10117+Berlin',
    );
  });

  it('uses the address when only one coordinate is known', () => {
    expect(mapsUrl({ lat: 52.52, lng: null, address: ' Mitte ' }, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Mitte',
    );
  });

  it('returns null when there is neither a position nor an address', () => {
    expect(mapsUrl({ lat: null, lng: null, address: '  ' }, 'ios')).toBeNull();
    expect(mapsUrl({ lat: null, lng: null, address: null }, 'web')).toBeNull();
  });
});

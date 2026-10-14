export interface MapsTarget {
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export function mapsUrl({ lat, lng, address }: MapsTarget, platform: string): string | null {
  const place =
    lat !== null && lng !== null ? `${lat},${lng}` : address?.trim() ? address.trim() : null;
  if (place === null) return null;
  if (platform === 'ios') return `https://maps.apple.com/?${new URLSearchParams({ daddr: place })}`;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: place })}`;
}

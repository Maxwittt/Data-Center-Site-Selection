/**
 * Map search: typed coordinates are handled locally; anything else goes to
 * OpenStreetMap's Nominatim geocoder (light use only, one request per search).
 */

export type LngLat = [number, number];

const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i;

/**
 * "41.6, -93.6", "41.6 -93.6", or "41.6 N, 93.6 W" -> [lng, lat]. Latitude
 * comes first, the way it's usually written. Null when it isn't coordinates.
 */
export function parseCoordinates(text: string): LngLat | null {
  const match = COORDS.exec(text);
  if (!match) return null;
  let lat = Number(match[1]);
  let lng = Number(match[3]);
  if (match[2]?.toUpperCase() === "S") lat = -Math.abs(lat);
  if (match[4]?.toUpperCase() === "W") lng = -Math.abs(lng);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lng, lat];
}

export interface SearchHit {
  point: LngLat;
  label: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function searchPlace(text: string, signal?: AbortSignal): Promise<SearchHit | null> {
  const coords = parseCoordinates(text);
  if (coords) {
    return { point: coords, label: `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}` };
  }
  const params = new URLSearchParams({ q: text, format: "jsonv2", limit: "1", countrycodes: "us,ca" });
  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Search failed (${response.status}).`);
  const [hit] = (await response.json()) as { lat: string; lon: string; display_name: string }[];
  if (!hit) return null;
  return { point: [Number(hit.lon), Number(hit.lat)], label: hit.display_name };
}

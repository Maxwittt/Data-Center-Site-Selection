// Pure geometry helpers with no runtime imports, so they can be unit-tested
// directly with `node --test` (see pointInPolygon.test.ts).

/** [lng, lat] */
export type LngLat = readonly [number, number];

/** GeoJSON ring: array of [lng, lat], first point repeated at the end. */
export type Ring = ReadonlyArray<readonly number[]>;

export type PolygonGeometry =
  | { type: "Polygon"; coordinates: ReadonlyArray<Ring> }
  | { type: "MultiPolygon"; coordinates: ReadonlyArray<ReadonlyArray<Ring>> };

/**
 * Even-odd ray casting in lng/lat space. Treating degrees as planar is fine
 * for point-in-polygon at this scale (the answer is topological, not metric).
 * Points exactly on an edge may land on either side.
 */
export function pointInRing(point: LngLat, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** A polygon is [outerRing, ...holes]. */
function pointInPolygonRings(point: LngLat, rings: ReadonlyArray<Ring>): boolean {
  if (rings.length === 0 || !pointInRing(point, rings[0])) {
    return false;
  }
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

export function pointInGeometry(point: LngLat, geometry: PolygonGeometry): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygonRings(point, geometry.coordinates);
  }
  return geometry.coordinates.some((polygon) => pointInPolygonRings(point, polygon));
}

/**
 * Every feature containing the point, topmost first. Service territories can
 * overlap; the map draws larger ones first (lower `drawOrder`), so the highest
 * `drawOrder` is the one visible on top and the one a pin should report.
 */
export function findZonesAt<
  T extends { geometry: PolygonGeometry; properties: { drawOrder: number } },
>(point: LngLat, features: ReadonlyArray<T>): T[] {
  return features
    .filter((feature) => pointInGeometry(point, feature.geometry))
    .sort((a, b) => b.properties.drawOrder - a.properties.drawOrder);
}

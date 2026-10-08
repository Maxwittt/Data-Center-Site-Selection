// Pure (no runtime imports) so it can be unit-tested with `node --test`.

/** [lng, lat] */
type LngLat = [number, number];

const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LON_AT_EQUATOR = 111_320;
const METERS_PER_MILE = 1609.344;

export interface NearestHit<T> {
  item: T;
  distanceMiles: number;
  /** Closest point on the item, [lng, lat]. */
  closestPoint: LngLat;
}

/** Same local equirectangular projection as lib/geo/proximity.ts. */
function scales(point: LngLat) {
  return {
    kx: METERS_PER_DEG_LON_AT_EQUATOR * Math.cos((point[1] * Math.PI) / 180),
    ky: METERS_PER_DEG_LAT,
  };
}

export function nearestPoint<T>(
  point: LngLat,
  items: readonly T[],
  position: (item: T) => LngLat | null,
): NearestHit<T> | null {
  const { kx, ky } = scales(point);
  let best: { distSq: number; item: T; at: LngLat } | null = null;
  for (const item of items) {
    const at = position(item);
    if (!at) continue;
    const dx = (at[0] - point[0]) * kx;
    const dy = (at[1] - point[1]) * ky;
    const distSq = dx * dx + dy * dy;
    if (!best || distSq < best.distSq) best = { distSq, item, at };
  }
  return best
    ? {
        item: best.item,
        distanceMiles: Math.sqrt(best.distSq) / METERS_PER_MILE,
        closestPoint: best.at,
      }
    : null;
}

/** Nearest point on any polyline. `parts` returns each item's line strings. */
export function nearestOnLines<T>(
  point: LngLat,
  items: readonly T[],
  parts: (item: T) => LngLat[][],
): NearestHit<T> | null {
  const [px, py] = point;
  const { kx, ky } = scales(point);
  let best: { distSq: number; item: T; at: LngLat } | null = null;
  for (const item of items) {
    for (const part of parts(item)) {
      for (let i = 0; i < part.length - 1; i++) {
        const a = part[i];
        const b = part[i + 1];
        const ax = (a[0] - px) * kx;
        const ay = (a[1] - py) * ky;
        const dx = (b[0] - a[0]) * kx;
        const dy = (b[1] - a[1]) * ky;
        const lengthSq = dx * dx + dy * dy;
        const t =
          lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        const distSq = cx * cx + cy * cy;
        if (!best || distSq < best.distSq) {
          best = {
            distSq,
            item,
            at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
          };
        }
      }
    }
  }
  return best
    ? {
        item: best.item,
        distanceMiles: Math.sqrt(best.distSq) / METERS_PER_MILE,
        closestPoint: best.at,
      }
    : null;
}

/** Sum of `weight` over items within `radiusMiles` of the point. */
export function sumWithin<T>(
  point: LngLat,
  items: readonly T[],
  position: (item: T) => LngLat,
  weight: (item: T) => number,
  radiusMiles: number,
): { total: number; count: number } {
  const { kx, ky } = scales(point);
  const limit = (radiusMiles * METERS_PER_MILE) ** 2;
  let total = 0;
  let count = 0;
  for (const item of items) {
    const at = position(item);
    const dx = (at[0] - point[0]) * kx;
    const dy = (at[1] - point[1]) * ky;
    if (dx * dx + dy * dy <= limit) {
      total += weight(item);
      count++;
    }
  }
  return { total, count };
}

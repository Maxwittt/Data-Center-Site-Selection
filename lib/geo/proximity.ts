import type {
  Position,
  TransmissionLineFeature,
} from "@/lib/data/hifld";
import type { Coverage } from "@/lib/geo/coverage";
import { tierIndexForKv, VOLTAGE_TIERS } from "@/lib/grid/voltage";

const METERS_PER_DEG_LAT = 110_574;
const METERS_PER_DEG_LON_AT_EQUATOR = 111_320;
const METERS_PER_MILE = 1609.344;

export interface LineHit {
  kv: number;
  owner: string | null;
  distanceMiles: number;
  /** Closest point on the line to the pin, [lng, lat]. */
  closestPoint: Position;
  tierIndex: number;
}

export interface PinAnalysis {
  point: Position;
  /** Nearest line of any voltage, or null if no lines were loaded. */
  nearest: LineHit | null;
  /** Nearest line within each entry of VOLTAGE_TIERS (null = none loaded). */
  byTier: (LineHit | null)[];
  /**
   * Distance from the pin to the edge of the loaded data area, in miles
   * (0 if the pin is outside it). Any line closer than this is guaranteed to
   * have been considered; a reported distance beyond it may be overstated.
   */
  coverageMarginMiles: number;
  outsideCoverage: boolean;
}

interface Candidate {
  distSq: number;
  point: Position;
  kv: number;
  owner: string | null;
}

/**
 * Finds the nearest transmission line to `point`, overall and per voltage tier.
 *
 * Distances use a local equirectangular projection centred on the pin. That is
 * accurate to well under 1% at the distances relevant for site screening, and
 * is fast enough to brute-force every segment (~10k lines) on each click.
 */
export function analyzePin(
  point: Position,
  lines: TransmissionLineFeature[],
  coverage: Coverage,
): PinAnalysis {
  const [px, py] = point;
  const kx = METERS_PER_DEG_LON_AT_EQUATOR * Math.cos((py * Math.PI) / 180);
  const ky = METERS_PER_DEG_LAT;

  const best: (Candidate | null)[] = VOLTAGE_TIERS.map(() => null);

  for (const line of lines) {
    const geometry = line.geometry;
    if (!geometry) {
      continue;
    }
    const parts =
      geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
    const { VOLTAGE: kv, OWNER: owner } = line.properties;
    const tier = tierIndexForKv(kv);

    for (const part of parts) {
      for (let i = 0; i < part.length - 1; i++) {
        const a = part[i];
        const b = part[i + 1];
        // Segment endpoints relative to the pin, in meters.
        const ax = (a[0] - px) * kx;
        const ay = (a[1] - py) * ky;
        const dx = (b[0] - a[0]) * kx;
        const dy = (b[1] - a[1]) * ky;
        const lengthSq = dx * dx + dy * dy;

        const t =
          lengthSq === 0
            ? 0
            : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        const distSq = cx * cx + cy * cy;

        const current = best[tier];
        if (!current || distSq < current.distSq) {
          best[tier] = {
            distSq,
            point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
            kv,
            owner,
          };
        }
      }
    }
  }

  const byTier = best.map((candidate, tierIndex): LineHit | null =>
    candidate
      ? {
          kv: candidate.kv,
          owner: candidate.owner,
          distanceMiles: Math.sqrt(candidate.distSq) / METERS_PER_MILE,
          closestPoint: candidate.point,
          tierIndex,
        }
      : null,
  );

  const nearest = byTier.reduce<LineHit | null>(
    (min, hit) =>
      hit && (!min || hit.distanceMiles < min.distanceMiles) ? hit : min,
    null,
  );

  const outsideCoverage = !coverage.covers(point);
  const coverageMarginMiles = coverage.marginMiles(point);

  return { point, nearest, byTier, coverageMarginMiles, outsideCoverage };
}

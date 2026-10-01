// Pure (no runtime imports) so it can be unit-tested with `node --test`.

/** [lng, lat] */
type LngLat = readonly [number, number];

/**
 * Where transmission data was loaded, as a grid mask produced by
 * scripts/build-miso-transmission.mjs: MISO's footprint plus a buffer.
 *
 * `runs` is run-length encoded, row-major from the south-west cell, as
 * alternating run lengths that start with a run of 0s (not covered).
 */
export interface CoverageMask {
  west: number;
  south: number;
  /** Cell size in degrees. */
  cellDeg: number;
  cols: number;
  rows: number;
  runs: number[];
}

export interface Coverage {
  /** True if the point lies in a covered cell. */
  covers(point: LngLat): boolean;
  /**
   * Distance in miles from the point to the nearest uncovered ground (0 if the
   * point is itself uncovered). Any line closer than this was certainly loaded;
   * a reported distance beyond it may be overstated. Capped at `maxSearchMiles`.
   */
  marginMiles(point: LngLat): number;
}

// Same constants as lib/geo/proximity.ts, in miles.
const MILES_PER_DEG_LAT = 110_574 / 1609.344;
const MILES_PER_DEG_LON_AT_EQUATOR = 111_320 / 1609.344;

export function decodeMask(mask: CoverageMask): Uint8Array {
  const flat = new Uint8Array(mask.cols * mask.rows);
  let position = 0;
  let value = 0;
  for (const run of mask.runs) {
    if (value === 1) {
      flat.fill(1, position, position + run);
    }
    position += run;
    value = value === 0 ? 1 : 0;
  }
  if (position !== flat.length) {
    throw new Error(
      `Coverage mask is malformed: runs cover ${position} cells, expected ${flat.length}.`,
    );
  }
  return flat;
}

export function createCoverage(mask: CoverageMask, maxSearchMiles = 200): Coverage {
  const cells = decodeMask(mask);
  const { west, south, cellDeg, cols, rows } = mask;

  /** Cells outside the grid count as uncovered. */
  const isCovered = (i: number, j: number) =>
    i >= 0 && i < cols && j >= 0 && j < rows && cells[j * cols + i] === 1;

  const indexOf = (point: LngLat) => ({
    i: Math.floor((point[0] - west) / cellDeg),
    j: Math.floor((point[1] - south) / cellDeg),
  });

  return {
    covers(point) {
      const { i, j } = indexOf(point);
      return isCovered(i, j);
    },

    marginMiles(point) {
      const { i: pi, j: pj } = indexOf(point);
      if (!isCovered(pi, pj)) {
        return 0;
      }

      const [px, py] = point;
      const kx = MILES_PER_DEG_LON_AT_EQUATOR * Math.cos((py * Math.PI) / 180);
      const ky = MILES_PER_DEG_LAT;
      const reachY = Math.ceil(maxSearchMiles / (ky * cellDeg)) + 1;
      const reachX = Math.ceil(maxSearchMiles / (kx * cellDeg)) + 1;

      let best = maxSearchMiles * maxSearchMiles;
      for (let j = pj - reachY; j <= pj + reachY; j++) {
        const cellSouth = south + j * cellDeg;
        const dy = Math.max(cellSouth - py, 0, py - (cellSouth + cellDeg)) * ky;
        if (dy * dy >= best) {
          continue;
        }
        for (let i = pi - reachX; i <= pi + reachX; i++) {
          if (isCovered(i, j)) {
            continue;
          }
          const cellWest = west + i * cellDeg;
          const dx = Math.max(cellWest - px, 0, px - (cellWest + cellDeg)) * kx;
          const distSq = dx * dx + dy * dy;
          if (distSq < best) {
            best = distSq;
          }
        }
      }
      return Math.sqrt(best);
    },
  };
}

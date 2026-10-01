import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createCoverage,
  decodeMask,
  type CoverageMask,
} from "./coverage.ts";

/** Run-length encode a flat 0/1 array the same way the build script does. */
function encode(flat: number[]): number[] {
  const runs: number[] = [];
  let current = 0;
  let length = 0;
  for (const value of flat) {
    if (value === current) {
      length++;
    } else {
      runs.push(length);
      current = value;
      length = 1;
    }
  }
  runs.push(length);
  return runs;
}

/** 10x10 grid of 1-degree cells with SW corner (-100, 30); covered where `f` says so. */
function gridMask(f: (i: number, j: number) => boolean): CoverageMask {
  const flat: number[] = [];
  for (let j = 0; j < 10; j++) {
    for (let i = 0; i < 10; i++) {
      flat.push(f(i, j) ? 1 : 0);
    }
  }
  return { west: -100, south: 30, cellDeg: 1, cols: 10, rows: 10, runs: encode(flat) };
}

const MILES_PER_DEG_LAT = 110_574 / 1609.344;

test("decodeMask: round-trips run-length data, including a covered first cell", () => {
  const flat = [1, 1, 0, 1, 0, 0, 0, 1];
  const mask: CoverageMask = {
    west: 0, south: 0, cellDeg: 1, cols: 4, rows: 2, runs: encode(flat),
  };
  assert.deepEqual([...decodeMask(mask)], flat);
  assert.deepEqual(mask.runs[0], 0); // a leading run of 0s is always present
});

test("decodeMask: rejects a mask whose runs don't match its dimensions", () => {
  const mask: CoverageMask = {
    west: 0, south: 0, cellDeg: 1, cols: 4, rows: 2, runs: [0, 5],
  };
  assert.throws(() => decodeMask(mask), /malformed/);
});

test("covers: a hole in an otherwise covered grid", () => {
  // Everything covered except column 5, row 5: lng -95..-94, lat 35..36.
  const coverage = createCoverage(gridMask((i, j) => !(i === 5 && j === 5)));
  assert.equal(coverage.covers([-94.5, 35.5]), false); // inside the hole
  assert.equal(coverage.covers([-95.5, 35.5]), true); // neighbor to the west
  assert.equal(coverage.covers([-94.5, 36.5]), true); // neighbor to the north
});

test("covers: cell indexing matches the grid origin and cell size", () => {
  // Only cell (col 2, row 3) is covered: lng -98..-97, lat 33..34.
  const coverage = createCoverage(gridMask((i, j) => i === 2 && j === 3));
  assert.equal(coverage.covers([-97.5, 33.5]), true);
  assert.equal(coverage.covers([-96.5, 33.5]), false); // next column
  assert.equal(coverage.covers([-97.5, 34.5]), false); // next row
  assert.equal(coverage.covers([-120, 33.5]), false); // west of the grid
  assert.equal(coverage.covers([-97.5, 60]), false); // north of the grid
});

test("marginMiles: 0 when the point is uncovered", () => {
  const coverage = createCoverage(gridMask((i) => i < 5));
  assert.equal(coverage.marginMiles([-93.5, 35]), 0);
});

test("marginMiles: distance to the nearest uncovered edge", () => {
  // Columns 0-4 covered (lng -100..-95), the rest not. Point at lng -95.25:
  // 0.25 degrees of longitude from the boundary at -95.
  const coverage = createCoverage(gridMask((i) => i < 5));
  const lat = 35.5;
  const milesPerDegLon = (111_320 / 1609.344) * Math.cos((lat * Math.PI) / 180);
  const margin = coverage.marginMiles([-95.25, lat]);
  // Boundary to the south/north is the grid edge, which is farther away.
  assert.ok(Math.abs(margin - 0.25 * milesPerDegLon) < 0.01, `margin ${margin}`);
});

test("marginMiles: the grid edge counts as uncovered", () => {
  // Fully covered grid; point 0.4 degrees north of the southern grid edge (lat 30).
  const coverage = createCoverage(gridMask(() => true));
  const margin = coverage.marginMiles([-95.5, 30.4]);
  assert.ok(Math.abs(margin - 0.4 * MILES_PER_DEG_LAT) < 0.01, `margin ${margin}`);
});

test("marginMiles: takes the nearest of several uncovered regions", () => {
  // Hole at column 7 (lng -93..-92) and the western grid edge at -100.
  const coverage = createCoverage(gridMask((i) => i !== 7));
  const lat = 35.5;
  const milesPerDegLon = (111_320 / 1609.344) * Math.cos((lat * Math.PI) / 180);
  // At lng -94.5 the hole is 1.5 deg east; the west edge is 5.5 deg west.
  const margin = coverage.marginMiles([-94.5, lat]);
  assert.ok(Math.abs(margin - 1.5 * milesPerDegLon) < 0.01, `margin ${margin}`);
});

test("marginMiles: is capped at the search radius", () => {
  const coverage = createCoverage(gridMask(() => true), 50);
  assert.equal(coverage.marginMiles([-95.5, 35.5]), 50);
});

// Regression check against the real generated mask and lines.
interface Geo {
  meta: { coverage: CoverageMask; bufferMiles: number };
  features: Array<{
    geometry:
      | { type: "LineString"; coordinates: number[][] }
      | { type: "MultiLineString"; coordinates: number[][][] };
  }>;
}
const geo = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../public/data/miso-transmission.geojson", import.meta.url)),
    "utf8",
  ),
) as Geo;
const real = createCoverage(geo.meta.coverage);

const covered: Array<[string, [number, number]]> = [
  ["Duluth, MN", [-92.1, 46.79]],
  ["Fargo, ND", [-96.79, 46.88]],
  ["Marquette, MI", [-87.4, 46.54]],
  ["Indianapolis", [-86.16, 39.77]],
  ["St. Louis", [-90.2, 38.63]],
  ["New Orleans", [-90.07, 29.95]],
  ["Little Rock", [-92.29, 34.75]],
  ["Detroit", [-83.05, 42.33]],
  // PJM cities close enough to MISO that the buffer should reach them:
  ["Chicago", [-87.63, 41.88]],
  ["Louisville", [-85.76, 38.25]],
];
const notCovered: Array<[string, [number, number]]> = [
  ["Denver", [-104.99, 39.74]],
  ["Dallas", [-96.8, 32.78]],
  ["Columbus, OH", [-83.0, 39.96]],
  ["Atlanta", [-84.39, 33.75]],
  ["Pittsburgh", [-80.0, 40.44]],
];

for (const [city, point] of covered) {
  test(`real mask: ${city} is covered`, () => {
    assert.equal(real.covers(point), true);
    assert.ok(real.marginMiles(point) >= 0);
  });
}
for (const [city, point] of notCovered) {
  test(`real mask: ${city} is not covered`, () => {
    assert.equal(real.covers(point), false);
    assert.equal(real.marginMiles(point), 0);
  });
}

test("real mask: every covered city has loaded transmission lines nearby", () => {
  // A covered area with no lines would mean the mask and the data disagree.
  for (const [city, [lng, lat]] of covered) {
    const kx = (111_320 / 1609.344) * Math.cos((lat * Math.PI) / 180);
    const ky = 110_574 / 1609.344;
    let best = Infinity;
    for (const feature of geo.features) {
      const parts =
        feature.geometry.type === "LineString"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      for (const part of parts) {
        for (const [x, y] of part) {
          const d = Math.hypot((x - lng) * kx, (y - lat) * ky);
          if (d < best) best = d;
        }
      }
    }
    assert.ok(best < 40, `${city}: nearest loaded line vertex is ${best.toFixed(1)} mi away`);
  }
});

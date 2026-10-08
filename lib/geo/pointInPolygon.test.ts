import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findZonesAt,
  pointInGeometry,
  pointInRing,
  type PolygonGeometry,
} from "./pointInPolygon.ts";

const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
];

test("pointInRing: inside and outside a square", () => {
  assert.equal(pointInRing([5, 5], square), true);
  assert.equal(pointInRing([11, 5], square), false);
  assert.equal(pointInRing([-0.1, 5], square), false);
  assert.equal(pointInRing([5, 10.1], square), false);
});

test("pointInRing: concave (L-shaped) ring", () => {
  // L: the top-right 5x5 block is missing.
  const l = [
    [0, 0],
    [10, 0],
    [10, 5],
    [5, 5],
    [5, 10],
    [0, 10],
    [0, 0],
  ];
  assert.equal(pointInRing([2, 8], l), true); // upper arm
  assert.equal(pointInRing([8, 2], l), true); // lower arm
  assert.equal(pointInRing([8, 8], l), false); // the notch
});

test("pointInGeometry: polygon holes are excluded", () => {
  const donut: PolygonGeometry = {
    type: "Polygon",
    coordinates: [
      square,
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ],
  };
  assert.equal(pointInGeometry([1, 1], donut), true);
  assert.equal(pointInGeometry([5, 5], donut), false); // in the hole
});

test("pointInGeometry: MultiPolygon matches any member", () => {
  const multi: PolygonGeometry = {
    type: "MultiPolygon",
    coordinates: [
      [square],
      [
        [
          [20, 0],
          [30, 0],
          [30, 10],
          [20, 10],
          [20, 0],
        ],
      ],
    ],
  };
  assert.equal(pointInGeometry([5, 5], multi), true);
  assert.equal(pointInGeometry([25, 5], multi), true);
  assert.equal(pointInGeometry([15, 5], multi), false);
});

test("findZonesAt: overlapping zones come back topmost (highest drawOrder) first", () => {
  const big = {
    geometry: { type: "Polygon", coordinates: [square] } as PolygonGeometry,
    properties: { drawOrder: 0, name: "big" },
  };
  const small = {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 6],
          [4, 4],
        ],
      ],
    } as PolygonGeometry,
    properties: { drawOrder: 1, name: "small" },
  };
  // Input order deliberately puts the small one first.
  assert.deepEqual(
    findZonesAt([5, 5], [small, big]).map((z) => z.properties.name),
    ["small", "big"],
  );
  assert.deepEqual(
    findZonesAt([1, 1], [small, big]).map((z) => z.properties.name),
    ["big"],
  );
  assert.deepEqual(findZonesAt([50, 50], [small, big]), []);
});

// Regression check against the real generated territories: known cities must
// land in the utility that serves them, and PJM cities must land in none.
interface GeoFeature {
  geometry: PolygonGeometry;
  properties: { drawOrder: number; name: string };
}

const geojson = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../public/data/miso-congestion.geojson", import.meta.url)),
    "utf8",
  ),
) as { features: GeoFeature[] };

const cities: Array<[string, [number, number], string | null]> = [
  ["Detroit", [-83.05, 42.33], "DTE Electric"],
  ["Lansing", [-84.55, 42.73], "Consumers Energy"],
  ["Indianapolis", [-86.16, 39.77], "AES Indiana (Indianapolis Power & Light)"],
  ["Gary", [-87.35, 41.6], "NIPSCO (Northern Indiana Public Service)"],
  ["Evansville", [-87.57, 37.97], "CenterPoint Energy Indiana (SIGECO)"],
  ["Milwaukee", [-87.91, 43.04], "We Energies (Wisconsin Electric)"],
  ["Green Bay", [-88.02, 44.51], "Wisconsin Public Service"],
  ["Minneapolis", [-93.27, 44.98], "Xcel Energy (Northern States Power)"],
  ["Duluth", [-92.1, 46.79], "Minnesota Power (ALLETE)"],
  ["St. Louis", [-90.2, 38.63], "Ameren Missouri (Union Electric)"],
  ["Champaign", [-88.24, 40.12], "Ameren Illinois"],
  ["Lafayette, LA", [-92.02, 30.22], "Lafayette Utilities System (LA)"],
  // Entergy operating companies, whose price node is a load node rather than *.AZ.
  ["Little Rock", [-92.29, 34.75], "Entergy Arkansas"],
  ["Pine Bluff", [-92.0, 34.23], "Entergy Arkansas"],
  // Downtown Baton Rouge sits inside both Entergy Louisiana and DEMCO in HIFLD.
  // The smaller territory wins, so this coordinate reports DEMCO.
  ["Baton Rouge downtown", [-91.19, 30.45], "DEMCO (Dixie Electric Membership)"],
  ["Baton Rouge west", [-91.25, 30.45], "Entergy Louisiana"],
  ["New Orleans", [-90.07, 29.95], "Entergy New Orleans"],
  ["Jackson, MS", [-90.18, 32.3], "Entergy Mississippi"],
  ["Beaumont, TX", [-94.1, 30.09], "Entergy Texas"],
  // Overlaps: the smaller territory must win.
  ["Madison, WI", [-89.4, 43.07], "Madison Gas & Electric"],
  ["Springfield, IL", [-89.65, 39.8], "Springfield City Water, Light & Power (IL)"],
  ["Columbia, MO", [-92.33, 38.95], "Columbia Water & Light (MO)"],
  // Member utilities of a shared zone price, which have no polygon of their own.
  ["Lake Country Power", [-93.21, 46.51], "Great River Energy (Lake Country Power)"],
  ["Bayfield Electric", [-91.45, 45.76], "Dairyland Power (Bayfield Electric Cooperative)"],
  ["Kenergy", [-88.22, 37.07], "Big Rivers Electric (Kenergy)"],
  ["Egyptian Electric", [-89.42, 37.62], "Southern Illinois Power Cooperative (Egyptian Electric Cooperative)"],
  ["Singing River Electric", [-89.22, 30.29], "Cooperative Energy (Singing River Electric)"],
  ["Conway, AR", [-92.57, 35.01], "Entergy Arkansas (Conway Corporation)"],
  ["DEMCO", [-90.9, 30.18], "DEMCO (Dixie Electric Membership)"],
  ["Rochester, MN", [-92.5, 43.9], "SMMPA (Rochester Public Utilities)"],
  ["Alexandria, LA", [-92.507, 31.214], "LEPA (Alexandria)"],
  // PJM: no MISO territory.
  ["Columbus, OH", [-83.0, 39.96], null],
  ["Chicago", [-87.63, 41.88], null],
];

for (const [city, point, expected] of cities) {
  test(`real territories: ${city} -> ${expected ?? "no MISO zone"}`, () => {
    const hits = findZonesAt(point, geojson.features);
    assert.equal(hits[0]?.properties.name ?? null, expected);
  });
}

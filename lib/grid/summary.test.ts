import assert from "node:assert/strict";
import { test } from "node:test";
import type { PinAnalysis } from "../geo/proximity.ts";
import type { SiteContext } from "../geo/site.ts";
import { defaultInputs } from "./calculator.ts";
import { summarizeSite, summaryCsv } from "./summary.ts";

const analysis: PinAnalysis = {
  point: [-89.5, 39.8],
  nearest: { kv: 138, owner: null, distanceMiles: 0.5, closestPoint: [-89.5, 39.8], tierIndex: 0 },
  byTier: [],
  coverageMarginMiles: 100,
  outsideCoverage: false,
};

const site: SiteContext = {
  substation: {
    status: "ready",
    value: { name: "PAWNEE, IL", kv: 345, lines: 4, distanceMiles: 3, position: [0, 0], uncertain: false },
  },
  pipeline: { status: "ready", value: { operator: "X", distanceMiles: 20, closestPoint: [0, 0], uncertain: false } },
  backlog: { status: "ready", value: { mw: 9000, projects: 40, counties: 6, radiusMiles: 50, heavy: true, heavyMw: 3100 } },
};

test("summarizeSite: uses defaults with the shared megawatts and cost inputs", () => {
  const summary = summarizeSite(analysis, site, { name: "Ameren Illinois", avgMcc: 1.5 }, defaultInputs(2026), 2026);
  // 345 kV substation 5 + heavy backlog 1 = 6 years; gas 2 + ceil(15/15) = 3.
  assert.equal(summary.paths.ftmFullYear, 2032);
  assert.equal(summary.paths.byopYear, 2029);
  assert.equal(summary.cost.utility, 71.5);
  assert.equal(summary.screening.basis.kind, "substation");
});

test("summaryCsv: one row per site, quoting names with commas", () => {
  const summary = summarizeSite(analysis, site, null, defaultInputs(2026), 2026);
  const csv = summaryCsv([summary], defaultInputs(2026));
  const [header, row] = csv.trim().split("\n");
  assert.ok(header.startsWith("site,latitude,longitude"));
  assert.ok(row.startsWith("A,39.80000,-89.50000,138,0.5,345,3.0,\"PAWNEE, IL\",20.0,9000,yes,,"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { LineHit } from "../geo/proximity.ts";
import type { SiteContext } from "../geo/site.ts";
import { screenSite } from "./screening.ts";

const line = (kv: number, distanceMiles: number): LineHit => ({
  kv,
  owner: null,
  distanceMiles,
  closestPoint: [0, 0],
  tierIndex: 0,
});

function site(substation: { kv: number; distanceMiles: number } | null): SiteContext {
  return {
    substation: {
      status: "ready",
      value: substation && { ...substation, name: "X", lines: 2, position: [0, 0], uncertain: false },
    },
    pipeline: { status: "ready", value: { operator: null, distanceMiles: 2, closestPoint: [0, 0], uncertain: false } },
    backlog: { status: "ready", value: { mw: 0, projects: 0, counties: 0, radiusMiles: 50, heavy: false, heavyMw: 1 } },
  };
}

test("screenSite: a nearby substation beats a new station on a nearby line", () => {
  const result = screenSite(line(345, 0.5), site({ kv: 345, distanceMiles: 3 }));
  assert.equal(result.basis.kind, "substation");
  assert.equal(result.defaults.ftmFullYears, 5);
});

test("screenSite: a far substation loses to a new station on a close line", () => {
  const result = screenSite(line(345, 0.5), site({ kv: 345, distanceMiles: 35 }));
  assert.equal(result.basis.kind, "line");
  assert.equal(result.defaults.ftmFullYears, 6);
  assert.equal(result.defaults.parts.stationYears, 1);
});

test("screenSite: nothing loaded falls back to the longest wait", () => {
  const result = screenSite(null, site(null));
  assert.equal(result.basis.kind, "none");
  assert.equal(result.defaults.ftmFullYears, 8);
});

test("screenSite: unknown pipeline data does not penalize gas", () => {
  const ctx: SiteContext = { ...site(null), pipeline: { status: "loading" } };
  assert.equal(screenSite(null, ctx).pipelineMiles, undefined);
  assert.equal(screenSite(null, ctx).defaults.byopYears, 2);
});

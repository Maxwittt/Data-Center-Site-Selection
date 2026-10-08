import assert from "node:assert/strict";
import { test } from "node:test";
import type { GasPipelineFeature, QueueData, SubstationFeature } from "../data/sites.ts";
import { nearestOnLines, nearestPoint, sumWithin } from "./nearest.ts";
import { analyzeSite } from "./site.ts";

const sub = (lng: number, lat: number, kv: number, name: string | null = null): SubstationFeature => ({
  type: "Feature",
  properties: { name, state: "IA", kv, lines: null },
  geometry: { type: "Point", coordinates: [lng, lat] },
});

const pipe = (coords: [number, number][]): GasPipelineFeature => ({
  type: "Feature",
  properties: { operator: "Northern Natural" },
  geometry: { type: "LineString", coordinates: coords },
});

const queue: QueueData = {
  meta: {
    source: "test",
    generatedAt: "",
    activeProjects: 3,
    activeMw: 1500,
    locatedMw: 1500,
    radiusMiles: 50,
    heavyPercentile: 0.75,
    heavyMw: 1000,
  },
  counties: [
    { county: "Story", state: "IA", position: [-93.46, 42.04], mw: 800, projects: 2 },
    { county: "Polk", state: "IA", position: [-93.57, 41.68], mw: 400, projects: 1 },
    { county: "Far", state: "MN", position: [-93.0, 46.0], mw: 9000, projects: 9 },
  ],
};

test("nearestPoint: one degree of latitude is about 68.7 miles", () => {
  const hit = nearestPoint([-93, 42], [[-93, 43]] as [number, number][], (p) => p);
  assert.ok(hit);
  assert.ok(Math.abs(hit.distanceMiles - 68.7) < 0.2);
});

test("nearestOnLines: the closest point can sit mid-segment", () => {
  const line: [number, number][] = [[-1, 0], [1, 0]];
  const hit = nearestOnLines([0, 1], [line], (l) => [l]);
  assert.ok(hit);
  assert.ok(Math.abs(hit.closestPoint[0]) < 1e-9);
  assert.ok(Math.abs(hit.closestPoint[1]) < 1e-9);
});

test("sumWithin: counts only items inside the radius", () => {
  const { total, count } = sumWithin(
    [-93.5, 41.9],
    queue.counties,
    (c) => c.position,
    (c) => c.mw,
    50,
  );
  assert.equal(total, 1200);
  assert.equal(count, 2);
});

test("analyzeSite: picks the nearest substation and flags it beyond the margin", () => {
  const ctx = analyzeSite([-93.5, 42], 5, {
    substations: [sub(-93.5, 42.2, 345, "Far"), sub(-93.5, 42.05, 161, "Near")],
    pipelines: null,
    queue: null,
    failed: {},
  });
  assert.equal(ctx.substation.status, "ready");
  if (ctx.substation.status !== "ready" || !ctx.substation.value) throw new Error("no hit");
  assert.equal(ctx.substation.value.name, "Near");
  assert.equal(ctx.substation.value.uncertain, false);
  assert.equal(ctx.pipeline.status, "loading");
});

test("analyzeSite: pipeline distance and a heavy nearby backlog", () => {
  const ctx = analyzeSite([-93.5, 41.9], 100, {
    substations: null,
    pipelines: [pipe([[-94, 41.8], [-93, 41.8]])],
    queue,
    failed: { substations: true },
  });
  assert.equal(ctx.substation.status, "unavailable");
  if (ctx.pipeline.status !== "ready" || !ctx.pipeline.value) throw new Error("no pipe");
  assert.ok(Math.abs(ctx.pipeline.value.distanceMiles - 6.9) < 0.1);
  if (ctx.backlog.status !== "ready") throw new Error("no backlog");
  assert.equal(ctx.backlog.value.mw, 1200);
  assert.equal(ctx.backlog.value.projects, 3);
  assert.equal(ctx.backlog.value.heavy, true);
});

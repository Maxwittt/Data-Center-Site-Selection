import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePaths, defaultRamp, rampGap } from "./interconnection.ts";

const near = (kv: number, distanceMiles: number) => ({
  connection: { kv, distanceMiles },
  pipelineMiles: 1,
});

test("defaultRamp: 500 kV beside the pin is the shortest utility wait", () => {
  const ramp = defaultRamp(near(765, 0.4));
  assert.equal(ramp.ftmFullYears, 4);
  assert.equal(ramp.ftmPartialYears, 2);
  assert.equal(ramp.byopYears, 2);
  assert.equal(ramp.partialShare, 0.4);
});

test("defaultRamp: 345 kV within a mile has no distance penalty", () => {
  const ramp = defaultRamp(near(345, 1));
  assert.equal(ramp.ftmFullYears, 5);
  assert.equal(ramp.ftmPartialYears, 3);
});

test("defaultRamp: each 10 miles past the first adds a year, capped at 3", () => {
  assert.equal(defaultRamp(near(345, 11)).ftmFullYears, 6);
  assert.equal(defaultRamp(near(345, 21)).ftmFullYears, 7);
  assert.equal(defaultRamp(near(345, 80)).ftmFullYears, 8);
});

test("defaultRamp: 138 kV is slower than 345 kV at the same distance", () => {
  const low = defaultRamp(near(161, 2));
  const high = defaultRamp(near(345, 2));
  assert.equal(low.ftmFullYears, 7);
  assert.ok(low.ftmFullYears > high.ftmFullYears);
});

test("defaultRamp: no loaded connection uses the longest base and no distance adder", () => {
  const ramp = defaultRamp({ connection: null, pipelineMiles: 1 });
  assert.equal(ramp.ftmFullYears, 8);
  assert.equal(ramp.ftmPartialYears, 6);
});

test("defaultRamp: heavy generator backlog adds one year to both utility steps", () => {
  const base = defaultRamp(near(345, 1));
  const heavy = defaultRamp({ ...near(345, 1), heavyBacklog: true });
  assert.equal(heavy.ftmFullYears, base.ftmFullYears + 1);
  assert.equal(heavy.ftmPartialYears, base.ftmPartialYears + 1);
  assert.equal(heavy.parts.backlogYears, 1);
  assert.equal(heavy.byopYears, base.byopYears);
});

test("defaultRamp: a pipeline within 5 miles keeps on-site gas at 2 years", () => {
  assert.equal(defaultRamp({ connection: null, pipelineMiles: 5 }).byopYears, 2);
});

test("defaultRamp: each 15 miles of lateral past 5 adds a gas year, capped at 2", () => {
  assert.equal(defaultRamp({ connection: null, pipelineMiles: 6 }).byopYears, 3);
  assert.equal(defaultRamp({ connection: null, pipelineMiles: 20 }).byopYears, 3);
  assert.equal(defaultRamp({ connection: null, pipelineMiles: 21 }).byopYears, 4);
  assert.equal(defaultRamp({ connection: null, pipelineMiles: 200 }).byopYears, 4);
});

test("defaultRamp: no loaded pipeline counts as the longest gas lead time", () => {
  assert.equal(defaultRamp({ connection: null, pipelineMiles: null }).byopYears, 4);
});

test("defaultRamp: unknown pipeline data leaves the gas default alone", () => {
  assert.equal(defaultRamp({ connection: null }).byopYears, 2);
});

test("comparePaths: on-site gas covers a distant low-voltage site sooner", () => {
  const ramp = defaultRamp(near(138, 25));
  const result = comparePaths({
    requestedMw: 100,
    partialYears: ramp.ftmPartialYears,
    fullYears: ramp.ftmFullYears,
    byopYears: ramp.byopYears,
    partialShare: ramp.partialShare,
    nowYear: 2026,
  });
  assert.equal(result.partialMw, 40);
  assert.equal(result.sooner, "byop");
  assert.equal(result.byopYear, 2028);
  assert.ok(result.ftmFullYear > result.byopYear);
});

test("rampGap: gas ready before partial utility power leaves no hole", () => {
  // Gas in 1 year, partial utility in 3, full utility in 5.
  const gap = rampGap({ partialYears: 3, fullYears: 5, byopYears: 1 });
  assert.equal(gap.years, 0);
  assert.equal(gap.endsWith, null);
});

test("rampGap: gas a year after partial power leaves that year only partly served", () => {
  const gap = rampGap({ partialYears: 3, fullYears: 5, byopYears: 4 });
  assert.equal(gap.years, 1);
  assert.equal(gap.endsWith, "gas");
});

test("rampGap: gas after full utility power does not close the partial stretch", () => {
  const gap = rampGap({ partialYears: 3, fullYears: 5, byopYears: 7 });
  assert.equal(gap.years, 2);
  assert.equal(gap.endsWith, "utility");
});

test("comparePaths: a tie when the edited utility year matches on-site gas", () => {
  const result = comparePaths({
    requestedMw: 50,
    partialYears: 1,
    fullYears: 2,
    byopYears: 2,
    partialShare: 0.4,
    nowYear: 2026,
  });
  assert.equal(result.sooner, "tie");
  assert.equal(result.soonerByYears, 0);
  assert.equal(result.partialMw, 20);
});

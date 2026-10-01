import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyExposure, type ExposureLevel } from "./exposure.ts";

// Fixtures copied from the Sep 2026 calibration table (30-day MISO day-ahead).
// Kept as fixed values so regenerating the data doesn't break the tests; the
// point is to pin down how the thresholds treat representative zones.
const fixtures: Array<{
  name: string;
  avgMcc: number;
  pctHoursCongested: number;
  basisStd: number;
  level: ExposureLevel;
  volatile?: boolean;
}> = [
  { name: "Ameren Missouri", avgMcc: 13.2, pctHoursCongested: 54.4, basisStd: 58.7, level: "exposed", volatile: true },
  { name: "NIPSCO", avgMcc: 4.63, pctHoursCongested: 76.9, basisStd: 19.5, level: "exposed" },
  { name: "AES Indiana", avgMcc: 3.73, pctHoursCongested: 48.6, basisStd: 10.2, level: "exposed" },
  { name: "Duke Indiana", avgMcc: 3.2, pctHoursCongested: 54.7, basisStd: 6.0, level: "exposed" },
  { name: "CenterPoint Indiana", avgMcc: 1.43, pctHoursCongested: 42.8, basisStd: 7.7, level: "mixed" },
  { name: "Ameren Illinois", avgMcc: 1.38, pctHoursCongested: 30.2, basisStd: 15.2, level: "mixed" },
  { name: "Columbia W&L", avgMcc: -0.29, pctHoursCongested: 45.8, basisStd: 21.8, level: "mixed" },
  // Frequently congested but net-negative: "mixed", not "exposed".
  { name: "Consumers", avgMcc: -2.89, pctHoursCongested: 47.9, basisStd: 8.4, level: "mixed" },
  { name: "DTE", avgMcc: -4.76, pctHoursCongested: 46.4, basisStd: 3.2, level: "mixed" },
  { name: "Springfield CWLP", avgMcc: -1.59, pctHoursCongested: 25.0, basisStd: 1.6, level: "low" },
  { name: "We Energies", avgMcc: -5.36, pctHoursCongested: 8.9, basisStd: 15.3, level: "low" },
  { name: "MidAmerican", avgMcc: -5.39, pctHoursCongested: 24.7, basisStd: 13.4, level: "low" },
  { name: "Minnesota Power", avgMcc: -8.93, pctHoursCongested: 15.3, basisStd: 3.8, level: "low" },
  { name: "Montana-Dakota", avgMcc: -16.68, pctHoursCongested: 10.0, basisStd: 16.8, level: "low" },
];

for (const f of fixtures) {
  test(`classifyExposure: ${f.name} -> ${f.level}`, () => {
    const result = classifyExposure(f);
    assert.equal(result.level, f.level);
    assert.equal(result.volatile, f.volatile ?? false);
  });
}

test("classifyExposure: boundaries are inclusive", () => {
  assert.equal(
    classifyExposure({ avgMcc: 3, pctHoursCongested: 40, basisStd: 0 }).level,
    "exposed",
  );
  assert.equal(
    classifyExposure({ avgMcc: 2.99, pctHoursCongested: 40, basisStd: 0 }).level,
    "mixed",
  );
  assert.equal(
    classifyExposure({ avgMcc: 3, pctHoursCongested: 39.9, basisStd: 0 }).level,
    "mixed",
  );
  assert.equal(
    classifyExposure({ avgMcc: 1, pctHoursCongested: 0, basisStd: 0 }).level,
    "mixed",
  );
  assert.equal(
    classifyExposure({ avgMcc: 0.99, pctHoursCongested: 39.9, basisStd: 0 }).level,
    "low",
  );
});

test("classifyExposure: volatile flag starts at the basis std threshold", () => {
  const base = { avgMcc: 0, pctHoursCongested: 0 };
  assert.equal(classifyExposure({ ...base, basisStd: 24.9 }).volatile, false);
  assert.equal(classifyExposure({ ...base, basisStd: 25 }).volatile, true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { annualDifference, compareCost } from "./cost.ts";
import { decodeShare, defaultInputs, encodeShare } from "./calculator.ts";

const base = { utilityRate: 70, gasPrice: 3.5, heatRate: 8.5, gasAdder: 30 };

test("compareCost: congestion adds to the utility rate", () => {
  const result = compareCost({ ...base, congestion: 13.2 });
  assert.equal(result.utility, 83.2);
  assert.equal(result.gasFuel, 29.75);
  assert.equal(result.gas, 59.75);
  assert.equal(result.cheaper, "byop");
  assert.equal(result.delta, 23.45);
});

test("compareCost: negative congestion lowers the utility rate", () => {
  const result = compareCost({ ...base, utilityRate: 60, congestion: -5.39 });
  assert.equal(result.utility, 54.61);
  assert.equal(result.cheaper, "ftm");
});

test("compareCost: a pin outside any zone uses the rate alone", () => {
  assert.equal(compareCost({ ...base, congestion: null }).utility, 70);
});

test("compareCost: equal costs tie", () => {
  const result = compareCost({ ...base, utilityRate: 59.75, congestion: 0 });
  assert.equal(result.cheaper, "tie");
  assert.equal(result.delta, 0);
});

test("annualDifference: $10/MWh on 100 MW at 90% load is about $7.9M a year", () => {
  assert.equal(Math.round(annualDifference(10, 100)), 7_884_000);
});

test("share URL: round-trips the pin, sites, and edited inputs", () => {
  const inputs = { ...defaultInputs(2026), mw: "250", fullYears: 3, gasPrice: "4.1" };
  const encoded = encodeShare(
    { pin: [-93.5, 42.03], sites: [[-90.1, 38.6], [-92.3, 34.7]], inputs },
    2026,
  );
  const decoded = decodeShare(encoded, 2026);
  assert.deepEqual(decoded.pin, [-93.5, 42.03]);
  assert.equal(decoded.sites.length, 2);
  assert.equal(decoded.inputs.mw, "250");
  assert.equal(decoded.inputs.fullYears, 3);
  assert.equal(decoded.inputs.partialYears, null);
  assert.equal(decoded.inputs.gasPrice, "4.1");
});

test("share URL: defaults stay out of the link", () => {
  assert.equal(encodeShare({ pin: null, sites: [], inputs: defaultInputs(2026) }, 2026), "");
});

test("share URL: bad values fall back to defaults", () => {
  const decoded = decodeShare("pin=abc&full=-3&partial=2.5&sites=1,2;999,0", 2026);
  assert.equal(decoded.pin, null);
  assert.equal(decoded.inputs.fullYears, null);
  assert.equal(decoded.inputs.partialYears, null);
  assert.deepEqual(decoded.sites, [[1, 2]]);
});

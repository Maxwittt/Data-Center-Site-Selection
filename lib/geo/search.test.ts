import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCoordinates } from "./search.ts";

test("parseCoordinates: latitude first, comma or space", () => {
  assert.deepEqual(parseCoordinates("41.6, -93.6"), [-93.6, 41.6]);
  assert.deepEqual(parseCoordinates("41.6 -93.6"), [-93.6, 41.6]);
});

test("parseCoordinates: hemisphere letters set the sign", () => {
  assert.deepEqual(parseCoordinates("41.6° N, 93.6° W"), [-93.6, 41.6]);
});

test("parseCoordinates: place names and out-of-range numbers are not coordinates", () => {
  assert.equal(parseCoordinates("Des Moines, IA"), null);
  assert.equal(parseCoordinates("141.6, -93.6"), null);
});

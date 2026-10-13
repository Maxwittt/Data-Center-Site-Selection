import assert from "node:assert/strict";
import { test } from "node:test";
import { PIN_CARD_RIGHT_PX, pinCardPadding, pinNeedsReveal } from "./pin.ts";

test("pinNeedsReveal: a click in the open left stays put", () => {
  assert.equal(pinNeedsReveal(200, 360, 1200, 800), false);
});

test("pinNeedsReveal: a click under the card needs a shift", () => {
  assert.equal(pinNeedsReveal(1100, 200, 1200, 800), true);
});

test("pinCardPadding: keeps at least 220px of map on a narrow screen", () => {
  const pad = pinCardPadding(400);
  assert.equal(pad.right, 180);
  assert.ok(pad.right < PIN_CARD_RIGHT_PX);
});

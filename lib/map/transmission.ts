import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import { VOLTAGE_TIERS } from "@/lib/grid/voltage";

export const TRANSMISSION_SOURCE = "transmission-lines";
export const TRANSMISSION_LAYER = "transmission-lines-layer";
/** Dark halo under the lines so they stay legible over the congestion fill. */
export const TRANSMISSION_CASING_LAYER = "transmission-lines-casing";

const voltage: ExpressionSpecification = ["to-number", ["get", "VOLTAGE"], 0];

/** ["step", voltage, tier0, min1, tier1, ...] over per-tier values. */
function byTier<T>(values: T[]): ExpressionSpecification {
  const [first, ...rest] = values;
  return [
    "step",
    voltage,
    first,
    ...rest.flatMap((value, i) => [VOLTAGE_TIERS[i + 1].minKv, value]),
  ] as ExpressionSpecification;
}

/** Line width by zoom and voltage tier, plus `extra` pixels (for the casing). */
function lineWidth(extra = 0): ExpressionSpecification {
  const widths = (values: number[]) => byTier(values.map((w) => w + extra));
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    widths([0.5, 0.7, 0.9, 1.2]),
    10,
    widths([1.5, 2, 2.75, 3.5]),
  ] as ExpressionSpecification;
}

/** Adds an empty transmission-lines source and its line layers. */
export function addTransmissionLayer(map: MapLibreMap) {
  map.addSource(TRANSMISSION_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: TRANSMISSION_CASING_LAYER,
    type: "line",
    source: TRANSMISSION_SOURCE,
    layout: {
      "line-cap": "round",
      "line-join": "round",
      "line-sort-key": voltage,
    },
    paint: {
      "line-color": "#09090b",
      "line-opacity": 0.6,
      "line-width": lineWidth(1.5),
    },
  });

  map.addLayer({
    id: TRANSMISSION_LAYER,
    type: "line",
    source: TRANSMISSION_SOURCE,
    layout: {
      "line-cap": "round",
      "line-join": "round",
      // Draw higher-voltage lines on top of lower-voltage ones.
      "line-sort-key": voltage,
    },
    paint: {
      "line-color": byTier(VOLTAGE_TIERS.map((tier) => tier.color)),
      "line-opacity": 0.9,
      "line-width": lineWidth(),
    },
  });
}

import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";

export const TRANSMISSION_SOURCE = "transmission-lines";
export const TRANSMISSION_LAYER = "transmission-lines-layer";

export interface VoltageTier {
  label: string;
  color: string;
  /** Lowest kV value (inclusive) that belongs to this tier. */
  minKv: number;
}

/**
 * Single source of truth for map colors and the legend.
 * Tiers are voltage classes: e.g. 220 kV lines fall in the 230 kV class and
 * 735/765 kV lines fall in the 500 kV+ class. The query only returns >= 138 kV.
 */
export const VOLTAGE_TIERS: VoltageTier[] = [
  { label: "138–161 kV", color: "#fbbf24", minKv: 0 },
  { label: "230 kV", color: "#f97316", minKv: 200 },
  { label: "345 kV", color: "#ef4444", minKv: 300 },
  { label: "500 kV+", color: "#a855f7", minKv: 500 },
];

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

/** Adds an empty transmission-lines source and its line layer. */
export function addTransmissionLayer(map: MapLibreMap) {
  map.addSource(TRANSMISSION_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
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
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        byTier([0.5, 0.7, 0.9, 1.2]),
        10,
        byTier([1.5, 2, 2.75, 3.5]),
      ],
    },
  });
}

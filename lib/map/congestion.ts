import type {
  ExpressionSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";

/**
 * MISO congestion choropleth. Data comes from public/data/miso-congestion.geojson,
 * built offline by scripts/build-miso-congestion.mjs (30-day day-ahead averages
 * joined onto HIFLD retail service territories).
 */

export const CONGESTION_DATA_URL = "/data/miso-congestion.geojson";

export const CONGESTION_SOURCE = "miso-congestion";
export const CONGESTION_FILL_LAYER = "miso-congestion-fill";
export const CONGESTION_OUTLINE_LAYER = "miso-congestion-outline";
export const CONGESTION_HOVER_LAYER = "miso-congestion-hover";

/** The two ways to color a zone. Values are also the feature property names. */
export type CongestionMetric = "avgMcc" | "pctHoursCongested";

export const CONGESTION_METRICS: {
  id: CongestionMetric;
  label: string;
}[] = [
  { id: "avgMcc", label: "Congestion cost" },
  { id: "pctHoursCongested", label: "Hours congested" },
];

export interface CongestionMeta {
  source: string;
  generatedAt: string;
  /** YYYYMMDD */
  firstDay: string;
  /** YYYYMMDD */
  lastDay: string;
  dayCount: number;
  /** An hour counts as congested when MCC exceeds this many $/MWh. */
  congestedHourMccThreshold: number;
  /** Color scale for avgMcc is symmetric: -limit .. +limit ($/MWh). */
  avgMccLimit: number;
  /** Color scale for pctHoursCongested is 0 .. limit (%). */
  pctHoursLimit: number;
  hubs: string[];
}

export interface CongestionProperties {
  /** Display name, e.g. "DTE Electric". */
  name: string;
  /** Raw HIFLD territory name. */
  territory: string;
  /** HIFLD's state for the utility (its HQ state, not where it serves). Don't display. */
  state: string;
  /** Comma-separated MISO price nodes this polygon's stats are averaged over. */
  zoneNodes: string;
  zoneCount: number;
  /** Reference hub used for the basis figures. */
  hub: string;
  days: number;
  /** Mean day-ahead marginal congestion component, $/MWh. */
  avgMcc: number;
  /** Share of hours with MCC above the threshold, %. */
  pctHoursCongested: number;
  /** Mean day-ahead LMP, $/MWh. */
  avgLmp: number;
  /** Mean of (zone LMP - hub LMP), $/MWh. */
  basisMean: number;
  /** Standard deviation of (zone LMP - hub LMP), $/MWh. */
  basisStd: number;
  /** Larger territories draw first (lowest) so small ones stay visible. */
  drawOrder: number;
}

export interface CongestionFeature {
  type: "Feature";
  properties: CongestionProperties;
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

export interface CongestionCollection {
  type: "FeatureCollection";
  meta: CongestionMeta;
  features: CongestionFeature[];
}

export async function fetchCongestion(
  signal?: AbortSignal,
): Promise<CongestionCollection> {
  const response = await fetch(CONGESTION_DATA_URL, { signal });
  if (!response.ok) {
    throw new Error(`Congestion data request failed (${response.status}).`);
  }
  return (await response.json()) as CongestionCollection;
}

// ---------------------------------------------------------------------------
// Color scale
// ---------------------------------------------------------------------------

export interface ColorStop {
  value: number;
  color: string;
}

// Diverging: teal (congestion lowers price) <- pale neutral -> rose (adds cost).
// Farther from zero is darker, so the strongest zones are the darkest shades.
const TEAL_EXTREME = "#115e59";
const TEAL_MID = "#5eead4";
const NEUTRAL = "#d4d4d8";
const ROSE_MID = "#fda4af";
const ROSE_EXTREME = "#9f1239";

export function colorStops(
  metric: CongestionMetric,
  meta: CongestionMeta,
): ColorStop[] {
  if (metric === "avgMcc") {
    const limit = meta.avgMccLimit;
    return [
      { value: -limit, color: TEAL_EXTREME },
      { value: -limit / 2, color: TEAL_MID },
      { value: 0, color: NEUTRAL },
      { value: limit / 2, color: ROSE_MID },
      { value: limit, color: ROSE_EXTREME },
    ];
  }
  const limit = meta.pctHoursLimit;
  return [
    { value: 0, color: NEUTRAL },
    { value: limit / 2, color: ROSE_MID },
    { value: limit, color: ROSE_EXTREME },
  ];
}

export function fillColorExpression(
  metric: CongestionMetric,
  meta: CongestionMeta,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["get", metric],
    ...colorStops(metric, meta).flatMap((stop) => [stop.value, stop.color]),
  ] as ExpressionSpecification;
}

/** CSS gradient matching the map's color scale, for the legend bar. */
export function legendGradient(
  metric: CongestionMetric,
  meta: CongestionMeta,
): string {
  const stops = colorStops(metric, meta);
  const min = stops[0].value;
  const span = stops[stops.length - 1].value - min;
  const parts = stops.map(
    (stop) => `${stop.color} ${(((stop.value - min) / span) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "+$3.20" / "-$16.68" / "$0.00" */
export function formatSignedDollars(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) {
    return `$${(0).toFixed(digits)}`;
  }
  const sign = rounded > 0 ? "+" : "\u2212";
  return `${sign}$${Math.abs(rounded).toFixed(digits)}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** "20260901" -> "Sep 1" */
export function formatDay(yyyymmdd: string): string {
  const month = Number(yyyymmdd.slice(4, 6)) - 1;
  const day = Number(yyyymmdd.slice(6, 8));
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[month]} ${day}`;
}

export function formatPeriod(meta: CongestionMeta): string {
  const year = meta.lastDay.slice(0, 4);
  return `${formatDay(meta.firstDay)} \u2013 ${formatDay(meta.lastDay)}, ${year}`;
}

// ---------------------------------------------------------------------------
// Map layers
// ---------------------------------------------------------------------------

/** First basemap label layer, so zones sit under place names but above land. */
function firstSymbolLayerId(map: MapLibreMap): string | undefined {
  return map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
}

export function addCongestionLayers(
  map: MapLibreMap,
  collection: CongestionCollection,
  metric: CongestionMetric,
) {
  map.addSource(CONGESTION_SOURCE, {
    type: "geojson",
    data: collection as unknown as GeoJSON.FeatureCollection,
  });

  const beforeId = firstSymbolLayerId(map);

  map.addLayer(
    {
      id: CONGESTION_FILL_LAYER,
      type: "fill",
      source: CONGESTION_SOURCE,
      layout: { "fill-sort-key": ["get", "drawOrder"] },
      paint: {
        "fill-color": fillColorExpression(metric, collection.meta),
        "fill-opacity": 1,
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: CONGESTION_OUTLINE_LAYER,
      type: "line",
      source: CONGESTION_SOURCE,
      paint: {
        "line-color": "#d4d4d8",
        "line-opacity": 0.35,
        "line-width": 0.75,
      },
    },
    beforeId,
  );

  // Highlights whichever territory name the cursor is over (filter set on hover).
  map.addLayer(
    {
      id: CONGESTION_HOVER_LAYER,
      type: "line",
      source: CONGESTION_SOURCE,
      filter: ["==", ["get", "name"], ""],
      paint: {
        "line-color": "#fafafa",
        "line-opacity": 0.95,
        "line-width": 2,
      },
    },
    beforeId,
  );
}

export function setCongestionMetric(
  map: MapLibreMap,
  metric: CongestionMetric,
  meta: CongestionMeta,
) {
  if (map.getLayer(CONGESTION_FILL_LAYER)) {
    map.setPaintProperty(
      CONGESTION_FILL_LAYER,
      "fill-color",
      fillColorExpression(metric, meta),
    );
  }
}

export function setCongestionVisible(map: MapLibreMap, visible: boolean) {
  const value = visible ? "visible" : "none";
  for (const id of [
    CONGESTION_FILL_LAYER,
    CONGESTION_OUTLINE_LAYER,
    CONGESTION_HOVER_LAYER,
  ]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", value);
    }
  }
}

export function setCongestionHover(map: MapLibreMap, name: string | null) {
  if (map.getLayer(CONGESTION_HOVER_LAYER)) {
    map.setFilter(CONGESTION_HOVER_LAYER, ["==", ["get", "name"], name ?? ""]);
  }
}

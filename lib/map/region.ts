/**
 * Initial view: MISO runs from the Dakotas to the Gulf Coast (roughly
 * 104°W–82°W, 29°N–49°N), so this zoom frames the whole footprint on a
 * typical desktop screen.
 */
export const MISO_CENTER: [number, number] = [-92.0, 39.2];

export const MISO_DEFAULT_ZOOM = 4.8;

/** Same-origin MapLibre worker, copied to /public/maplibre on dev/build/install. */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/** Free public CARTO Dark Matter vector style. No API key required. */
export const DARK_BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

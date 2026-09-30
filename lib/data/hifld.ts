/**
 * Loader for HIFLD electric transmission lines (>= 138 kV, Midwest bbox).
 *
 * The original `services3.arcgis.com/GVgbJbqm8hXASVYi/.../Electric_Power_Transmission_Lines`
 * endpoint no longer exists (HIFLD Open was deactivated on 2025-08-26), so this
 * uses a public mirror of the same dataset with the same fields and query.
 *
 * The server caps each response at 2,000 features but the query matches ~10k
 * lines, so results are fetched page by page and merged.
 */

const QUERY_URL =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query";

const PAGE_SIZE = 2000;

const BASE_PARAMS: Record<string, string> = {
  where: "VOLTAGE >= 138",
  outFields: "VOLTAGE,OWNER",
  geometry: "-95,35,-80,45",
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  outSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
  // Light generalization (~100 m, 4 decimals) cuts the payload ~5x with no
  // visible difference at regional zoom levels.
  maxAllowableOffset: "0.001",
  geometryPrecision: "4",
  // Stable ordering is required for offset-based paging.
  orderByFields: "OBJECTID",
};

export interface TransmissionLineProperties {
  VOLTAGE: number;
  OWNER: string | null;
}

export interface TransmissionLineCollection {
  type: "FeatureCollection";
  features: unknown[];
}

function buildUrl(extra: Record<string, string>): string {
  return `${QUERY_URL}?${new URLSearchParams({ ...BASE_PARAMS, ...extra })}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Transmission data request failed (${response.status})`);
  }
  const json = (await response.json()) as T & {
    error?: { code: number; message: string };
  };
  // ArcGIS reports many failures as HTTP 200 with an `error` body.
  if (json.error) {
    throw new Error(`Transmission data error: ${json.error.message}`);
  }
  return json;
}

export async function fetchTransmissionLines(
  signal?: AbortSignal,
): Promise<TransmissionLineCollection> {
  const { count } = await fetchJson<{ count: number }>(
    buildUrl({ returnCountOnly: "true", f: "json" }),
    signal,
  );

  const pageCount = Math.ceil(count / PAGE_SIZE);
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, page) =>
      fetchJson<TransmissionLineCollection>(
        buildUrl({
          f: "geojson",
          resultOffset: String(page * PAGE_SIZE),
          resultRecordCount: String(PAGE_SIZE),
        }),
        signal,
      ),
    ),
  );

  return {
    type: "FeatureCollection",
    features: pages.flatMap((page) => page.features),
  };
}

/**
 * Loader for the MISO transmission dataset.
 *
 * The data is HIFLD electric transmission lines (>= 138 kV) that lie within a
 * buffer of MISO's footprint. It is built offline by
 * scripts/build-miso-transmission.mjs into a static file, so the app makes one
 * same-origin request instead of paging an ArcGIS service on every load.
 *
 * (The original HIFLD endpoint was deactivated on 2025-08-26; the build script
 * uses a public mirror of the same dataset.)
 */

import type { CoverageMask } from "@/lib/geo/coverage";

export const TRANSMISSION_DATA_URL = "/data/miso-transmission.geojson";

/** [longitude, latitude] in degrees. */
export type Position = [number, number];

export interface TransmissionLineProperties {
  VOLTAGE: number;
  OWNER: string | null;
}

export interface TransmissionLineFeature {
  type: "Feature";
  properties: TransmissionLineProperties;
  geometry:
    | { type: "LineString"; coordinates: Position[] }
    | { type: "MultiLineString"; coordinates: Position[][] }
    | null;
}

export interface TransmissionMeta {
  source: string;
  footprint: string;
  generatedAt: string;
  minKv: number;
  /** Lines within this many miles of MISO's footprint were kept. */
  bufferMiles: number;
  lineCount: number;
  /** Where the loaded lines are complete; see lib/geo/coverage.ts. */
  coverage: CoverageMask;
}

export interface TransmissionLineCollection {
  type: "FeatureCollection";
  meta: TransmissionMeta;
  features: TransmissionLineFeature[];
}

export async function fetchTransmissionLines(
  signal?: AbortSignal,
): Promise<TransmissionLineCollection> {
  const response = await fetch(TRANSMISSION_DATA_URL, { signal });
  if (!response.ok) {
    throw new Error(`Transmission data request failed (${response.status}).`);
  }
  return (await response.json()) as TransmissionLineCollection;
}

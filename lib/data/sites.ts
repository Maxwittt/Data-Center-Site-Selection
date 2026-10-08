/**
 * Loaders for the site-screening datasets built offline alongside the
 * transmission lines: substations (scripts/build-miso-substations.mjs), gas
 * pipelines (scripts/build-miso-gas.mjs), and the generator queue by county
 * (scripts/build-miso-queue.mjs). Each is clipped to the same loaded area.
 */

import type { Position } from "@/lib/data/hifld";

export const SUBSTATIONS_DATA_URL = "/data/miso-substations.geojson";
export const GAS_DATA_URL = "/data/miso-gas-pipelines.geojson";
export const QUEUE_DATA_URL = "/data/miso-queue.json";

export interface SubstationFeature {
  type: "Feature";
  properties: {
    name: string | null;
    state: string;
    kv: number;
    /** Lines connected, when HIFLD records it. */
    lines: number | null;
  };
  geometry: { type: "Point"; coordinates: Position };
}

export interface SubstationCollection {
  type: "FeatureCollection";
  meta: {
    source: string;
    generatedAt: string;
    sourceUpdated: string | null;
    minKv: number;
    count: number;
  };
  features: SubstationFeature[];
}

export interface GasPipelineFeature {
  type: "Feature";
  properties: { operator: string | null };
  geometry:
    | { type: "LineString"; coordinates: Position[] }
    | { type: "MultiLineString"; coordinates: Position[][] }
    | null;
}

export interface GasPipelineCollection {
  type: "FeatureCollection";
  meta: { source: string; generatedAt: string; count: number };
  features: GasPipelineFeature[];
}

export interface QueueCounty {
  county: string;
  state: string;
  /** County centroid (Census Gazetteer), [lng, lat]. */
  position: Position;
  /** Active queued generation, summer net MW. */
  mw: number;
  projects: number;
}

export interface QueueData {
  meta: {
    source: string;
    generatedAt: string;
    /** Active projects in the MISO queue, including those without a county. */
    activeProjects: number;
    activeMw: number;
    /** Active MW with a county that matched a Census centroid. */
    locatedMw: number;
    radiusMiles: number;
    /** Backlog within `radiusMiles` that adds a year to the default ramp. */
    heavyMw: number;
    /** Share of covered counties below `heavyMw`. */
    heavyPercentile: number;
  };
  counties: QueueCounty[];
}

async function fetchJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

export const fetchSubstations = (signal?: AbortSignal) =>
  fetchJson<SubstationCollection>(SUBSTATIONS_DATA_URL, "Substation data", signal);

export const fetchGasPipelines = (signal?: AbortSignal) =>
  fetchJson<GasPipelineCollection>(GAS_DATA_URL, "Gas pipeline data", signal);

export const fetchQueue = (signal?: AbortSignal) =>
  fetchJson<QueueData>(QUEUE_DATA_URL, "Queue data", signal);

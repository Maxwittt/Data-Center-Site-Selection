/**
 * Shared helpers for the offline build scripts: ArcGIS paging, a download
 * cache, and the coverage mask written by build-miso-transmission.mjs, so
 * every dataset is clipped to the same loaded area.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Download region shared with the transmission build: MISO's envelope plus a pad. */
export const DOWNLOAD_ENVELOPE = "-105.3,27.3,-80.8,50.6";

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
      return json;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error(`Request failed after ${attempts} attempts: ${lastError?.message}`);
}

export async function cached(dir, name, produce) {
  const file = path.join(dir, name);
  if (await fileExists(file)) {
    return JSON.parse(await readFile(file, "utf8"));
  }
  const value = await produce();
  await writeFile(file, JSON.stringify(value));
  return value;
}

/** Every feature matching `params` in the download envelope, paged and checked against the count. */
export async function fetchAllFeatures(url, params, pageSize = 2000) {
  const base = {
    geometry: DOWNLOAD_ENVELOPE,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    orderByFields: params.orderByFields ?? "OBJECTID",
    ...params,
  };
  const query = (extra) => `${url}?${new URLSearchParams({ ...base, ...extra })}`;
  const { count } = await fetchJson(query({ returnCountOnly: "true", f: "json" }));
  const pageCount = Math.ceil(count / pageSize);
  console.log(`  ${count} features; fetching ${pageCount} pages...`);

  const pages = new Array(pageCount);
  let next = 0;
  async function worker() {
    while (next < pageCount) {
      const p = next++;
      pages[p] = await fetchJson(
        query({ f: "geojson", resultOffset: String(p * pageSize), resultRecordCount: String(pageSize) }),
      );
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const features = pages.flatMap((page) => page.features);
  if (features.length !== count) {
    throw new Error(`Expected ${count} features but received ${features.length}.`);
  }
  return features;
}

/** The transmission coverage mask, decoded into a point test. Run build:transmission first. */
export async function loadCoverage() {
  const file = path.join(ROOT, "public", "data", "miso-transmission.geojson");
  const { meta } = JSON.parse(await readFile(file, "utf8"));
  const { west, south, cellDeg, cols, rows, runs } = meta.coverage;
  const cells = new Uint8Array(cols * rows);
  let position = 0;
  let value = 0;
  for (const run of runs) {
    if (value === 1) cells.fill(1, position, position + run);
    position += run;
    value = value === 0 ? 1 : 0;
  }
  return {
    covers([x, y]) {
      const i = Math.floor((x - west) / cellDeg);
      const j = Math.floor((y - south) / cellDeg);
      return i >= 0 && i < cols && j >= 0 && j < rows && cells[j * cols + i] === 1;
    },
  };
}

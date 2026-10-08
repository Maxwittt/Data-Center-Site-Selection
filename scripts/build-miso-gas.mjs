#!/usr/bin/env node
/**
 * Builds public/data/miso-gas-pipelines.geojson: EIA interstate natural gas
 * pipelines that touch the same loaded area as the transmission lines.
 *
 *   npm run build:gas   (after npm run build:transmission)
 *
 * On-site gas generation needs a gas supply sized for hundreds of megawatts.
 * Interstate trunk lines are that supply; intrastate and local distribution
 * lines are left out on purpose, so a short distance here means a large line.
 *
 * Source: EIA Natural Gas Interstate and Intrastate Pipelines (public ArcGIS
 * copy). Cached raw downloads live in .cache/.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cached, fetchAllFeatures, loadCoverage, ROOT } from "./lib/arcgis.mjs";

const CACHE_DIR = path.join(ROOT, ".cache", "miso-gas");
const OUT_PATH = path.join(ROOT, "public", "data", "miso-gas-pipelines.geojson");

const PIPELINES_URL =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Natural_Gas_Interstate_and_Intrastate_Pipelines_1/FeatureServer/0/query";

function touchesCoverage(geometry, coverage) {
  if (!geometry) return false;
  const parts = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  return parts.some((part) => part.some((p) => coverage.covers(p)));
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const coverage = await loadCoverage();

  console.log("Interstate natural gas pipelines");
  const raw = await cached(CACHE_DIR, "pipelines.json", () =>
    fetchAllFeatures(PIPELINES_URL, {
      where: "TYPEPIPE = 'Interstate' AND Status = 'Operating'",
      outFields: "Operator",
      orderByFields: "FID",
      maxAllowableOffset: "0.002",
      geometryPrecision: "4",
    }),
  );

  const kept = raw
    .filter((f) => touchesCoverage(f.geometry, coverage))
    .map((f) => ({
      type: "Feature",
      properties: { operator: f.properties.Operator || null },
      geometry: f.geometry,
    }));

  const body = {
    type: "FeatureCollection",
    meta: {
      source: "EIA natural gas interstate pipelines (operating)",
      generatedAt: new Date().toISOString(),
      count: kept.length,
    },
    features: kept,
  };
  const json = JSON.stringify(body);
  await writeFile(OUT_PATH, json + "\n");
  console.log(
    `Wrote public/data/miso-gas-pipelines.geojson: ${kept.length} of ${raw.length} segments, ` +
      `${(json.length / 1e6).toFixed(1)} MB`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

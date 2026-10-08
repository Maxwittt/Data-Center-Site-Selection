#!/usr/bin/env node
/**
 * Builds public/data/miso-substations.geojson: HIFLD electric substations at
 * 230 kV and above inside the same loaded area as the transmission lines.
 *
 *   npm run build:substations   (after npm run build:transmission)
 *
 * A data center interconnects at a substation, not partway along a line, so
 * the pin reports the nearest one. Only TYPE = SUBSTATION is kept: taps,
 * risers, and dead ends are points on a line, not places to connect load.
 * Records with an unknown status are kept (HIFLD leaves many blank); those
 * marked proposed, under construction, or retired are dropped.
 *
 * Source: HIFLD Electric Substations (public ArcGIS copy of the national
 * dataset, ~78k points). Cached raw downloads live in .cache/.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cached, fetchAllFeatures, loadCoverage, ROOT } from "./lib/arcgis.mjs";

const CACHE_DIR = path.join(ROOT, ".cache", "miso-substations");
const OUT_PATH = path.join(ROOT, "public", "data", "miso-substations.geojson");

const SUBSTATIONS_URL =
  "https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/Substations/FeatureServer/0/query";
const MIN_KV = 230;
const KEEP_STATUS = new Set(["IN SERVICE", "NOT AVAILABLE"]);

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const coverage = await loadCoverage();

  console.log(`Substations >= ${MIN_KV} kV`);
  const raw = await cached(CACHE_DIR, "substations.json", () =>
    fetchAllFeatures(SUBSTATIONS_URL, {
      where: `MAX_VOLT >= ${MIN_KV}`,
      outFields: "NAME,STATE,STATUS,TYPE,MAX_VOLT,LINES,SOURCEDATE",
    }),
  );

  let latestSource = 0;
  const kept = [];
  for (const f of raw) {
    const p = f.properties;
    if (p.TYPE !== "SUBSTATION" || !KEEP_STATUS.has(p.STATUS)) continue;
    if (!f.geometry || !coverage.covers(f.geometry.coordinates)) continue;
    latestSource = Math.max(latestSource, p.SOURCEDATE ?? 0);
    const [x, y] = f.geometry.coordinates;
    kept.push({
      type: "Feature",
      properties: {
        name: p.NAME && !p.NAME.startsWith("UNKNOWN") ? p.NAME : null,
        state: p.STATE,
        kv: p.MAX_VOLT,
        lines: p.LINES > 0 ? p.LINES : null,
      },
      geometry: { type: "Point", coordinates: [round(x, 4), round(y, 4)] },
    });
  }

  const body = {
    type: "FeatureCollection",
    meta: {
      source: "HIFLD electric substations (>= 230 kV, in service or status unknown)",
      generatedAt: new Date().toISOString(),
      sourceUpdated: latestSource ? new Date(latestSource).toISOString().slice(0, 10) : null,
      minKv: MIN_KV,
      count: kept.length,
    },
    features: kept,
  };
  const json = JSON.stringify(body);
  await writeFile(OUT_PATH, json + "\n");

  const byKv = {};
  for (const f of kept) byKv[f.properties.kv] = (byKv[f.properties.kv] ?? 0) + 1;
  console.log(
    `Wrote public/data/miso-substations.geojson: ${kept.length} of ${raw.length} substations, ` +
      `${(json.length / 1e3).toFixed(0)} KB`,
  );
  console.log(
    "  by kV:",
    Object.entries(byKv)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([kv, n]) => `${kv}:${n}`)
      .join(" "),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

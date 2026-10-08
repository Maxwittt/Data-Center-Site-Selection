#!/usr/bin/env node
// Builds MISO congestion statistics from MISO's public daily day-ahead
// ex-post LMP files (no API key needed):
//   https://docs.misoenergy.org/marketreports/YYYYMMDD_da_expost_lmp.csv
//
// Usage: node scripts/build-miso-congestion.mjs [--days 30]
//
// Downloaded files are cached in .cache/miso-da so re-runs are fast.
// MISO sends no CORS headers, which is why this runs as a script rather than
// in the browser.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HUBS, LOAD_NODES, ZONES } from "./miso-zones.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".cache", "miso-da");
const DATA_DIR = path.join(ROOT, "data");
const STATS_PATH = path.join(DATA_DIR, "miso-zone-stats.json");
const GEO_PATH = path.join(ROOT, "public", "data", "miso-congestion.geojson");

const BASE_URL = "https://docs.misoenergy.org/marketreports";
const LOOKBACK_DAYS = 45; // how far back to look for available files
const MIN_DAYS = 25; // refuse to build from less history than this
const CONCURRENCY = 5;

/**
 * An hour counts as "congested" when the zone's congestion component (MCC)
 * exceeds this many $/MWh. Filters rounding noise around zero.
 */
const CONGESTED_HOUR_MCC = 1.0;

const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const TARGET_DAYS = daysArg >= 0 ? Number(args[daysArg + 1]) : 30;

// ---------- dates ----------

/** YYYYMMDD for `offset` days before today, in US Eastern time (MISO's clock). */
function easternDay(offset) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

// ---------- download ----------

async function fetchDay(ymd) {
  const cachePath = path.join(CACHE_DIR, `${ymd}_da_expost_lmp.csv`);
  if (existsSync(cachePath)) {
    return readFile(cachePath, "utf8");
  }

  const url = `${BASE_URL}/${ymd}_da_expost_lmp.csv`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (response.status === 404) {
        return null; // not published (yet) for that day
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      await writeFile(cachePath, text);
      return text;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Failed to download ${url}: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/** Runs `worker` over `items` with limited concurrency, preserving order. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

// ---------- parsing ----------

const isUnitStyleNode = (node) => /_\d+\.AZ$/.test(node);
const isZoneLikeNode = (node) => node.endsWith(".AZ") && !isUnitStyleNode(node);

/**
 * Parses one daily file into Map<node, { LMP: number[24], MCC: number[24] }>.
 * Only zone-like (*.AZ) nodes, the hubs, and the explicitly listed load nodes
 * are kept. Rows that do not have 24 numeric hourly values are dropped.
 */
function parseDay(csv, hubSet, loadSet) {
  const nodes = new Map();
  const lines = csv.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith("Node,Type,Value"));
  if (headerIndex < 0) {
    throw new Error("Unexpected file format: header row not found");
  }

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line) continue;
    const cols = line.split(",");
    const node = cols[0];
    const value = cols[2];
    if (value !== "LMP" && value !== "MCC") continue;
    if (!isZoneLikeNode(node) && !hubSet.has(node) && !loadSet.has(node)) continue;

    const hours = cols.slice(3, 27).map(Number);
    if (hours.length !== 24 || hours.some((h) => !Number.isFinite(h))) continue;

    const entry = nodes.get(node) ?? {};
    entry[value] = hours;
    nodes.set(node, entry);
  }
  return nodes;
}

// ---------- statistics ----------

const mean = (xs) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const stdev = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const round = (x, digits = 3) => Number(x.toFixed(digits));

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function nodeStats(node, days, hubNode) {
  const mcc = [];
  const lmp = [];
  const basis = [];
  let dayCount = 0;

  for (const day of days) {
    const entry = day.get(node);
    if (!entry?.MCC || !entry?.LMP) continue;
    dayCount++;
    mcc.push(...entry.MCC);
    lmp.push(...entry.LMP);

    const hub = hubNode ? day.get(hubNode)?.LMP : null;
    if (hub) {
      basis.push(...entry.LMP.map((value, hour) => value - hub[hour]));
    }
  }

  if (mcc.length === 0) return null;

  return {
    days: dayCount,
    hours: mcc.length,
    avgMcc: round(mean(mcc)),
    pctHoursCongested: round((mcc.filter((x) => x > CONGESTED_HOUR_MCC).length / mcc.length) * 100, 1),
    avgLmp: round(mean(lmp), 2),
    basisMean: basis.length ? round(mean(basis)) : null,
    basisStd: basis.length ? round(stdev(basis)) : null,
    _mcc: mcc,
  };
}

// ---------- territory polygons ----------

const TERRITORIES_URL =
  "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/ArcGIS/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";

/** Approximate polygon area in square degrees-ish (cos-lat scaled); only used for draw order. */
function approxArea(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const polygon of polygons) {
    const ring = polygon[0];
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    const cosLat = Math.cos((ring[0][1] * Math.PI) / 180);
    total += Math.abs(sum / 2) * cosLat;
  }
  return total;
}

/** Fetches the HIFLD territory polygons for every name used in the zone table. */
async function fetchTerritories(names) {
  // One request for the whole table exceeds the service URL limit once
  // cooperative member territories are included.
  const features = [];
  const batchSize = 15;
  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const where = `NAME IN (${batch.map((n) => `'${n.replaceAll("'", "''")}'`).join(",")})`;
    const params = new URLSearchParams({
      where,
      outFields: "NAME,STATE,CNTRL_AREA",
      outSR: "4326",
      // ~1 km generalization keeps the file small; fine at regional zoom.
      maxAllowableOffset: "0.01",
      geometryPrecision: "3",
      resultRecordCount: "2000",
      f: "geojson",
    });
    const response = await fetch(`${TERRITORIES_URL}?${params}`, {
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error(`HIFLD territories request failed: HTTP ${response.status}`);
    }
    const json = await response.json();
    if (json.error) {
      throw new Error(`HIFLD territories error: ${json.error.message}`);
    }
    if (json.properties?.exceededTransferLimit) {
      throw new Error(`HIFLD territory response was truncated (${batch.length} names).`);
    }
    features.push(...json.features);
  }
  return features;
}

/** Joins zone statistics onto territory polygons. */
async function buildZoneGeoJson(zones, meta) {
  const names = [...new Set(zones.flatMap((z) => z.territories))];
  const territories = await fetchTerritories(names);

  const byName = new Map();
  for (const feature of territories) {
    const name = feature.properties.NAME;
    if (byName.has(name)) {
      console.warn(`  WARNING: duplicate HIFLD territory name "${name}"; using the first`);
      continue;
    }
    byName.set(name, feature);
  }

  const features = [];
  const missing = [];
  for (const territoryName of names) {
    const polygon = byName.get(territoryName);
    if (!polygon?.geometry) {
      missing.push(territoryName);
      continue;
    }

    // All zones whose table entry points at this territory (Ameren Illinois has 3).
    const group = zones.filter((z) => z.territories.includes(territoryName));
    const avg = (key) => {
      const values = group.map((z) => z[key]).filter((v) => v !== null);
      return values.length ? round(mean(values), 3) : null;
    };
    const displayName =
      group.length === 1 ? group[0].label : group[0].label.replace(/\s*\(.*\)$/, "");

    features.push({
      type: "Feature",
      properties: {
        name: displayName,
        territory: territoryName,
        state: polygon.properties.STATE,
        zoneNodes: group.map((z) => z.node).join(", "),
        zoneCount: group.length,
        hub: group[0].hub,
        days: Math.min(...group.map((z) => z.days)),
        avgMcc: avg("avgMcc"),
        pctHoursCongested: avg("pctHoursCongested"),
        avgLmp: avg("avgLmp"),
        basisMean: avg("basisMean"),
        basisStd: avg("basisStd"),
        area: approxArea(polygon.geometry),
      },
      geometry: polygon.geometry,
    });
  }

  // drawOrder: largest territory = 0 ... smallest = highest, so small ones draw on top.
  features.sort((a, b) => b.properties.area - a.properties.area);
  features.forEach((f, i) => {
    f.properties.drawOrder = i;
    delete f.properties.area;
  });

  return { type: "FeatureCollection", meta, features, missing };
}

// ---------- main ----------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const candidates = Array.from({ length: LOOKBACK_DAYS }, (_, i) => easternDay(i));
  console.log(`Looking for up to ${TARGET_DAYS} daily files in the last ${LOOKBACK_DAYS} days...`);

  const hubSet = new Set(HUBS);
  const loadSet = new Set(LOAD_NODES);
  const fetched = await mapLimit(candidates, CONCURRENCY, async (ymd) => {
    const csv = await fetchDay(ymd);
    return csv ? { ymd, nodes: parseDay(csv, hubSet, loadSet) } : null;
  });

  // Newest first; keep the most recent TARGET_DAYS that exist.
  const available = fetched.filter(Boolean).slice(0, TARGET_DAYS);
  const missing = candidates.length - fetched.filter(Boolean).length;
  if (available.length < MIN_DAYS) {
    throw new Error(`Only ${available.length} daily files available (need ${MIN_DAYS}).`);
  }
  const days = available.map((d) => d.nodes);
  const ymds = available.map((d) => d.ymd).sort();
  console.log(
    `Using ${available.length} days: ${ymds[0]} to ${ymds.at(-1)} ` +
      `(${missing} of the ${LOOKBACK_DAYS} candidate days were not published)`,
  );

  // Mapped zones.
  const zones = [];
  for (const zone of ZONES) {
    const stats = nodeStats(zone.node, days, zone.hub);
    if (!stats) {
      console.warn(`  WARNING: no data for mapped zone ${zone.node}`);
      continue;
    }
    zones.push({ ...zone, ...stats });
  }

  // Zone-like nodes present in the data but not in our reviewed table.
  const mappedNodes = new Set(ZONES.map((z) => z.node));
  const discovered = new Set(days.flatMap((d) => [...d.keys()]));
  const unmapped = [...discovered]
    .filter((n) => isZoneLikeNode(n) && !mappedNodes.has(n))
    .sort()
    .map((node) => {
      const stats = nodeStats(node, days, null);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _mcc, ...rest } = stats;
      return { node, ...rest };
    });

  // Symmetric color-scale limit for avg MCC: 90th percentile of |avg|, rounded up to 0.5.
  const absAvg = zones.map((z) => Math.abs(z.avgMcc)).sort((a, b) => a - b);
  const avgMccLimit = Math.max(1, Math.ceil(percentile(absAvg, 0.9) * 2) / 2);

  // Scale limit for "% hours congested": max across zones, rounded up to 10.
  const pctHoursLimit = Math.ceil(Math.max(...zones.map((z) => z.pctHoursCongested)) / 10) * 10;

  // Threshold sensitivity, to sanity-check CONGESTED_HOUR_MCC.
  const allMcc = zones.flatMap((z) => z._mcc);
  console.log("\nShare of zone-hours by MCC threshold (for choosing the 'congested hour' cutoff):");
  for (const t of [0, 0.5, 1, 2, 5]) {
    const share = (allMcc.filter((x) => x > t).length / allMcc.length) * 100;
    console.log(`  MCC > $${t.toFixed(1)}/MWh: ${share.toFixed(1)}%${t === CONGESTED_HOUR_MCC ? "   <- current cutoff" : ""}`);
  }

  const output = {
    meta: {
      source: "MISO day-ahead ex-post LMP, daily market reports",
      generatedAt: new Date().toISOString(),
      firstDay: ymds[0],
      lastDay: ymds.at(-1),
      dayCount: available.length,
      congestedHourMccThreshold: CONGESTED_HOUR_MCC,
      avgMccLimit,
      pctHoursLimit,
      hubs: HUBS,
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    zones: zones.map(({ _mcc, ...rest }) => rest),
    unmapped,
  };
  await writeFile(STATS_PATH, JSON.stringify(output, null, 2) + "\n");

  // Report.
  console.log(`\nMapped zones (${zones.length}), sorted by average congestion:`);
  console.log("  " + ["zone".padEnd(14), "days", "avgMCC", "%congested", "avgLMP", "basis vs hub (mean ± sd)", "hub"].join("  "));
  for (const z of [...zones].sort((a, b) => b.avgMcc - a.avgMcc)) {
    console.log(
      "  " +
        [
          z.node.padEnd(14),
          String(z.days).padStart(4),
          z.avgMcc.toFixed(2).padStart(6),
          (z.pctHoursCongested.toFixed(1) + "%").padStart(10),
          z.avgLmp.toFixed(1).padStart(6),
          `${z.basisMean?.toFixed(2)} ± ${z.basisStd?.toFixed(2)}`.padEnd(24),
          z.hub,
        ].join("  "),
    );
  }
  console.log(`\nUnmapped zone-like nodes (${unmapped.length}) - no HIFLD retail territory assigned:`);
  console.log("  " + unmapped.map((u) => `${u.node}(${u.avgMcc.toFixed(1)})`).join(" "));
  console.log(`\nColor-scale limit for avg MCC: +/- $${avgMccLimit}/MWh`);
  console.log(`Wrote ${path.relative(ROOT, STATS_PATH)}`);

  // Stage 2: join onto HIFLD territory polygons for the map.
  console.log("\nFetching HIFLD territory polygons...");
  const geo = await buildZoneGeoJson(output.zones, output.meta);
  const { missing: missingTerritories, ...collection } = geo;
  if (missingTerritories.length) {
    console.warn(`  WARNING: no polygon found for: ${missingTerritories.join("; ")}`);
  }
  await mkdir(path.dirname(GEO_PATH), { recursive: true });
  await writeFile(GEO_PATH, JSON.stringify(collection) + "\n");
  const bytes = Buffer.byteLength(JSON.stringify(collection));
  console.log(
    `Wrote ${path.relative(ROOT, GEO_PATH)}: ${collection.features.length} territories, ` +
      `${(bytes / 1024).toFixed(0)} KB`,
  );
  console.log("Territories:");
  for (const f of collection.features) {
    console.log(
      `  ${String(f.properties.drawOrder).padStart(2)}  ${f.properties.name.padEnd(46)} ${f.properties.state}  ` +
        `zones: ${f.properties.zoneNodes}  avgMCC ${f.properties.avgMcc}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

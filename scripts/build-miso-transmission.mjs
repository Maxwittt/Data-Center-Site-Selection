#!/usr/bin/env node
/**
 * Builds public/data/miso-transmission.geojson: HIFLD transmission lines
 * (>= 138 kV) that lie within BUFFER_MILES of MISO's footprint, plus a compact
 * coverage mask the app uses to tell how far the loaded data really extends
 * around a dropped pin.
 *
 *   npm run build:transmission
 *
 * How the footprint is defined
 *   HIFLD retail service territories whose CNTRL_AREA mentions MISO (~758
 *   polygons), restricted to an envelope of MISO's real extent. The envelope is
 *   needed because the field has a few bad entries (e.g. a "City of Preston, IA"
 *   located in Idaho, and Ohio/West Virginia towns tagged MISO), and because
 *   Montana-Dakota's polygon spans Montana, which is not MISO.
 *
 * Why a buffer
 *   A site just across the MISO border can be closest to a line on the other
 *   side. Lines are kept if any part of them lies within BUFFER_MILES of the
 *   footprint, so distances near the seam stay honest.
 *
 * Cached raw downloads live in .cache/ (gitignored); delete it to re-download.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, ".cache", "miso-transmission");
const OUT_PATH = path.join(ROOT, "public", "data", "miso-transmission.geojson");

const TERRITORIES_URL =
  "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/ArcGIS/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";
const LINES_URL =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query";

const BUFFER_MILES = 50;
const MIN_KV = 138;

/** Sanity envelope of MISO's real extent; territory polygons are clipped to it. */
const ENVELOPE = { west: -104.1, south: 28.5, east: -82.0, north: 49.4 };
/** Grid (and line download) region: envelope plus room for the buffer. */
const PAD_DEG = 1.2;
const GRID = {
  west: ENVELOPE.west - PAD_DEG - 0.0, // -105.3
  south: ENVELOPE.south - PAD_DEG, // 27.3
  east: ENVELOPE.east + PAD_DEG, // -80.8
  north: ENVELOPE.north + PAD_DEG, // 50.6
  cell: 0.05,
};
GRID.cols = Math.round((GRID.east - GRID.west) / GRID.cell);
GRID.rows = Math.round((GRID.north - GRID.south) / GRID.cell);

/** The exported mask uses cells twice as coarse, covered only if all 4 sub-cells are. */
const MASK_FACTOR = 2;

const MILES_PER_DEG_LAT = 69.0;

// ---------- helpers ----------

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson(url, attempts = 4) {
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

async function cached(name, produce) {
  const file = path.join(CACHE_DIR, name);
  if (await fileExists(file)) {
    return JSON.parse(await readFile(file, "utf8"));
  }
  const value = await produce();
  await writeFile(file, JSON.stringify(value));
  return value;
}

// ---------- stage 1: MISO footprint ----------

async function fetchTerritories() {
  const base = {
    where: "CNTRL_AREA LIKE '%MISO%'",
    outFields: "NAME,STATE,CNTRL_AREA",
    outSR: "4326",
    maxAllowableOffset: "0.01",
    geometryPrecision: "3",
    f: "geojson",
    orderByFields: "OBJECTID",
    resultRecordCount: "1000",
  };
  const features = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await fetchJson(
      `${TERRITORIES_URL}?${new URLSearchParams({ ...base, resultOffset: String(offset) })}`,
    );
    features.push(...page.features);
    if (page.features.length < 1000 && !page.properties?.exceededTransferLimit) break;
  }
  return features;
}

function forEachRing(geometry, fn) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) fn(polygon);
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cellX(i) {
  return GRID.west + (i + 0.5) * GRID.cell;
}
function cellY(j) {
  return GRID.south + (j + 0.5) * GRID.cell;
}

/** Largest lng/lat span of a geometry's bounding box, in degrees. */
function bboxSpan(geometry) {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  (function walk(c) {
    if (typeof c[0] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]);
      s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  })(geometry.coordinates);
  return Math.max(e - w, n - s);
}

/**
 * HIFLD has junk entries tagged MISO: tiny polygons with numeric names like
 * "31.404" (West Texas) and "39.12" (Kansas). Polygons below this span are
 * ignored on purpose. That also drops ~400 genuine small-town utilities, which
 * is harmless: each sits inside a larger territory's buffer anyway.
 */
const MIN_TERRITORY_SPAN_DEG = 0.1;

/** Connected blobs of footprint cells (8-neighbor), largest first. */
function footprintComponents(inside) {
  const seen = new Uint8Array(inside.length);
  const components = [];
  for (let start = 0; start < inside.length; start++) {
    if (!inside[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0, sx = 0, sy = 0;
    while (stack.length) {
      const c = stack.pop();
      const i = c % GRID.cols;
      const j = (c - i) / GRID.cols;
      size++; sx += cellX(i); sy += cellY(j);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || ii >= GRID.cols || jj < 0 || jj >= GRID.rows) continue;
          const nc = jj * GRID.cols + ii;
          if (inside[nc] && !seen[nc]) { seen[nc] = 1; stack.push(nc); }
        }
      }
    }
    components.push({ size, lng: sx / size, lat: sy / size });
  }
  return components.sort((a, b) => b.size - a.size);
}

/** 1 for each grid cell whose center lies inside a MISO territory (within the envelope). */
function rasterizeFootprint(territories) {
  const inside = new Uint8Array(GRID.cols * GRID.rows);
  for (const feature of territories) {
    if (!feature.geometry) continue;
    if (bboxSpan(feature.geometry) < MIN_TERRITORY_SPAN_DEG) continue;
    forEachRing(feature.geometry, (polygon) => {
      let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
      for (const [x, y] of polygon[0]) {
        w = Math.min(w, x); e = Math.max(e, x);
        s = Math.min(s, y); n = Math.max(n, y);
      }
      const i0 = Math.max(0, Math.floor((Math.max(w, ENVELOPE.west) - GRID.west) / GRID.cell));
      const i1 = Math.min(GRID.cols - 1, Math.floor((Math.min(e, ENVELOPE.east) - GRID.west) / GRID.cell));
      const j0 = Math.max(0, Math.floor((Math.max(s, ENVELOPE.south) - GRID.south) / GRID.cell));
      const j1 = Math.min(GRID.rows - 1, Math.floor((Math.min(n, ENVELOPE.north) - GRID.south) / GRID.cell));
      for (let j = j0; j <= j1; j++) {
        const y = cellY(j);
        for (let i = i0; i <= i1; i++) {
          const x = cellX(i);
          if (x < ENVELOPE.west || x > ENVELOPE.east || y < ENVELOPE.south || y > ENVELOPE.north) continue;
          if (inside[j * GRID.cols + i]) continue;
          if (!pointInRing(x, y, polygon[0])) continue;
          if (polygon.slice(1).some((hole) => pointInRing(x, y, hole))) continue;
          inside[j * GRID.cols + i] = 1;
        }
      }
    });
  }
  return inside;
}

/** Marks every cell within BUFFER_MILES (center to center) of an inside cell. */
function dilate(inside) {
  const out = new Uint8Array(inside.length);
  const dyCells = Math.ceil(BUFFER_MILES / (MILES_PER_DEG_LAT * GRID.cell));
  for (let j = 0; j < GRID.rows; j++) {
    const lat = cellY(j);
    const milesPerCellX = MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180) * GRID.cell;
    const dxCells = Math.ceil(BUFFER_MILES / milesPerCellX);
    for (let i = 0; i < GRID.cols; i++) {
      if (!inside[j * GRID.cols + i]) continue;
      for (let dj = -dyCells; dj <= dyCells; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= GRID.rows) continue;
        const dyMiles = dj * MILES_PER_DEG_LAT * GRID.cell;
        for (let di = -dxCells; di <= dxCells; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= GRID.cols) continue;
          const dxMiles = di * milesPerCellX;
          if (dxMiles * dxMiles + dyMiles * dyMiles <= BUFFER_MILES * BUFFER_MILES) {
            out[jj * GRID.cols + ii] = 1;
          }
        }
      }
    }
  }
  return out;
}

// ---------- stage 2: lines ----------

async function fetchAllLines() {
  const base = {
    where: `VOLTAGE >= ${MIN_KV}`,
    outFields: "VOLTAGE,OWNER",
    geometry: `${GRID.west},${GRID.south},${GRID.east},${GRID.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    maxAllowableOffset: "0.001",
    geometryPrecision: "4",
    orderByFields: "OBJECTID",
  };
  const query = (extra) => `${LINES_URL}?${new URLSearchParams({ ...base, ...extra })}`;

  const { count } = await fetchJson(query({ returnCountOnly: "true", f: "json" }));
  const PAGE = 2000;
  const pageCount = Math.ceil(count / PAGE);
  console.log(`  ${count} lines >= ${MIN_KV} kV in the download region; fetching ${pageCount} pages...`);

  const pages = new Array(pageCount);
  let next = 0;
  async function worker() {
    while (next < pageCount) {
      const p = next++;
      pages[p] = await fetchJson(
        query({ f: "geojson", resultOffset: String(p * PAGE), resultRecordCount: String(PAGE) }),
      );
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  const features = pages.flatMap((page) => page.features);
  if (features.length !== count) {
    throw new Error(`Expected ${count} lines but received ${features.length}.`);
  }
  return features;
}

/** True if any vertex, or a point sampled along a segment, is in a buffered cell. */
function touchesBuffered(geometry, buffered) {
  if (!geometry) return false;
  const parts = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const hit = (x, y) => {
    const i = Math.floor((x - GRID.west) / GRID.cell);
    const j = Math.floor((y - GRID.south) / GRID.cell);
    return i >= 0 && i < GRID.cols && j >= 0 && j < GRID.rows && buffered[j * GRID.cols + i] === 1;
  };
  for (const part of parts) {
    for (let k = 0; k < part.length; k++) {
      const [x, y] = part[k];
      if (hit(x, y)) return true;
      if (k === part.length - 1) break;
      const [x2, y2] = part[k + 1];
      const steps = Math.ceil(Math.max(Math.abs(x2 - x), Math.abs(y2 - y)) / (GRID.cell / 2));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        if (hit(x + (x2 - x) * t, y + (y2 - y) * t)) return true;
      }
    }
  }
  return false;
}

// ---------- stage 3: coverage mask ----------

/** Downsample conservatively, then run-length encode (alternating runs, starting with 0s). */
function buildMask(buffered) {
  const cols = GRID.cols / MASK_FACTOR;
  const rows = GRID.rows / MASK_FACTOR;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new Error("Grid dimensions must be divisible by MASK_FACTOR.");
  }
  const flat = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let all = 1;
      for (let dj = 0; dj < MASK_FACTOR && all; dj++) {
        for (let di = 0; di < MASK_FACTOR; di++) {
          if (!buffered[(j * MASK_FACTOR + dj) * GRID.cols + i * MASK_FACTOR + di]) {
            all = 0;
            break;
          }
        }
      }
      flat[j * cols + i] = all;
    }
  }
  const runs = [];
  let current = 0;
  let length = 0;
  for (const value of flat) {
    if (value === current) {
      length++;
    } else {
      runs.push(length);
      current = value;
      length = 1;
    }
  }
  runs.push(length);
  return {
    west: GRID.west,
    south: GRID.south,
    cellDeg: GRID.cell * MASK_FACTOR,
    cols,
    rows,
    runs,
  };
}

// ---------- main ----------

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });

  console.log("Stage 1: MISO footprint");
  const territories = await cached("territories.json", fetchTerritories);
  console.log(`  ${territories.length} territories tagged MISO`);
  const tiny = territories.filter((f) => f.geometry && bboxSpan(f.geometry) < MIN_TERRITORY_SPAN_DEG);
  console.log(
    `  ignored ${tiny.length} polygons smaller than ${MIN_TERRITORY_SPAN_DEG} deg ` +
      `(mostly small-town utilities, plus a few junk entries); the buffer covers them anyway`,
  );
  const inside = rasterizeFootprint(territories);
  // Disconnected islands are worth a look: they are either real exclaves or
  // bad data that would drag in lines from far away.
  const components = footprintComponents(inside);
  console.log(`  footprint blobs: ${components.length}; largest ${components[0].size} cells`);
  for (const c of components.slice(1)) {
    console.log(`    island: ${c.size} cells near (${c.lng.toFixed(2)}, ${c.lat.toFixed(2)})`);
  }
  const insideCount = inside.reduce((a, b) => a + b, 0);
  const buffered = dilate(inside);
  const bufferedCount = buffered.reduce((a, b) => a + b, 0);
  console.log(
    `  footprint: ${insideCount} cells; with ${BUFFER_MILES} mi buffer: ${bufferedCount} cells ` +
      `(grid ${GRID.cols}x${GRID.rows} at ${GRID.cell} deg)`,
  );

  console.log("Stage 2: transmission lines");
  const lines = await cached("lines.json", fetchAllLines);
  const kept = lines.filter((f) => touchesBuffered(f.geometry, buffered));
  console.log(`  kept ${kept.length} of ${lines.length} lines`);

  console.log("Stage 3: coverage mask");
  const coverage = buildMask(buffered);

  const meta = {
    source: "HIFLD electric power transmission lines (>= 138 kV)",
    footprint: "HIFLD retail service territories tagged MISO, clipped to an extent envelope",
    generatedAt: new Date().toISOString(),
    minKv: MIN_KV,
    bufferMiles: BUFFER_MILES,
    lineCount: kept.length,
    coverage,
  };
  const body = {
    type: "FeatureCollection",
    meta,
    features: kept.map((f) => ({
      type: "Feature",
      properties: { VOLTAGE: f.properties.VOLTAGE, OWNER: f.properties.OWNER },
      geometry: f.geometry,
    })),
  };
  const json = JSON.stringify(body);
  await writeFile(OUT_PATH, json + "\n");
  console.log(
    `Wrote public/data/miso-transmission.geojson: ${kept.length} lines, ${(json.length / 1e6).toFixed(1)} MB ` +
      `(mask: ${coverage.runs.length} runs)`,
  );

  // Kept lines by voltage, for a sanity check.
  const byKv = {};
  for (const f of kept) byKv[f.properties.VOLTAGE] = (byKv[f.properties.VOLTAGE] ?? 0) + 1;
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

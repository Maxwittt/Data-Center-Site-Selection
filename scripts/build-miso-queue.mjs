#!/usr/bin/env node
/**
 * Builds public/data/miso-queue.json: active MISO generator interconnection
 * requests, summed by county and placed at the county's Census centroid.
 *
 *   npm run build:queue   (after npm run build:transmission)
 *
 * This is a backlog proxy, not a load study. A lot of queued generation near a
 * site means the local network is already being studied for upgrades, which
 * tends to slow a new large load. The pin card sums queued MW within
 * RADIUS_MILES of the pin; above HEAVY_PERCENTILE of covered counties counts as
 * heavy and adds a year to the utility default.
 *
 * Sources: MISO GI queue API (www.misoenergy.org/api/giqueue/getprojects) and
 * the Census 2023 county Gazetteer. Cached raw downloads live in .cache/.
 */

import { execFileSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { cached, fetchJson, loadCoverage, ROOT } from "./lib/arcgis.mjs";

const CACHE_DIR = path.join(ROOT, ".cache", "miso-queue");
const OUT_PATH = path.join(ROOT, "public", "data", "miso-queue.json");
const QUEUE_URL = "https://www.misoenergy.org/api/giqueue/getprojects";
const GAZETTEER_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip";

const RADIUS_MILES = 50;
const HEAVY_PERCENTILE = 0.75;
const METERS_PER_DEG_LAT = 110574;
const METERS_PER_DEG_LON = 111320;
const METERS_PER_MILE = 1609.344;

/** "St. Louis County" / "Saint Louis" / "LaSalle Parish" -> one key per county. */
function countyKey(state, name) {
  const base = name
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipality)\b/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bste\b/g, "st")
    .replace(/[^a-z]/g, "");
  return `${state.toUpperCase()}:${base}`;
}

async function loadGazetteer() {
  const zip = path.join(CACHE_DIR, "gaz.zip");
  try {
    await stat(zip);
  } catch {
    const response = await fetch(GAZETTEER_URL);
    if (!response.ok) throw new Error(`Gazetteer download failed (${response.status}).`);
    await writeFile(zip, Buffer.from(await response.arrayBuffer()));
  }
  const text = execFileSync("unzip", ["-p", zip], { encoding: "utf8", maxBuffer: 1e8 });
  const [header, ...rows] = text.trim().split("\n");
  const cols = header.split("\t").map((c) => c.trim());
  const at = (name) => cols.indexOf(name);
  const counties = new Map();
  for (const row of rows) {
    const cells = row.split("\t").map((c) => c.trim());
    const state = cells[at("USPS")];
    const name = cells[at("NAME")];
    const position = [Number(cells[at("INTPTLONG")]), Number(cells[at("INTPTLAT")])];
    const key = countyKey(state, name);
    // "Baltimore County" and "Baltimore city" share a key; the county wins.
    if (!counties.has(key) || !/city$/i.test(name)) counties.set(key, { name, state, position });
  }
  return counties;
}

function miles([x1, y1], [x2, y2]) {
  const cos = Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
  const dx = (x2 - x1) * METERS_PER_DEG_LON * cos;
  const dy = (y2 - y1) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy) / METERS_PER_MILE;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  const coverage = await loadCoverage();

  console.log("MISO generator queue");
  const projects = await cached(CACHE_DIR, "projects.json", () => fetchJson(QUEUE_URL));
  const active = projects.filter((p) => p.applicationStatus === "Active");
  const gazetteer = await loadGazetteer();

  const byCounty = new Map();
  const unmatched = new Map();
  let unlocatedMw = 0;
  for (const p of active) {
    const mw = Number(p.summerNetMW) || 0;
    if (!p.county || !p.state) {
      unlocatedMw += mw;
      continue;
    }
    // Multi-county projects ("Clinton/Gratiot") go to the first county.
    const first = p.county.split(/[\/,&]| and /)[0].trim();
    const key = countyKey(p.state, first);
    const place = gazetteer.get(key);
    if (!place) {
      unmatched.set(`${p.county}, ${p.state}`, (unmatched.get(`${p.county}, ${p.state}`) ?? 0) + mw);
      unlocatedMw += mw;
      continue;
    }
    const entry = byCounty.get(key) ?? {
      county: place.name,
      state: place.state,
      position: place.position.map((v) => Math.round(v * 1e4) / 1e4),
      mw: 0,
      projects: 0,
    };
    entry.mw += mw;
    entry.projects += 1;
    byCounty.set(key, entry);
  }
  const counties = [...byCounty.values()]
    .map((c) => ({ ...c, mw: Math.round(c.mw) }))
    .sort((a, b) => b.mw - a.mw);

  // Heavy threshold: the HEAVY_PERCENTILE of the backlog seen from every
  // covered county centroid, so "heavy" is relative to MISO, not a fixed number.
  const samples = [...gazetteer.values()]
    .filter((c) => coverage.covers(c.position))
    .map((c) =>
      counties.reduce((sum, q) => (miles(c.position, q.position) <= RADIUS_MILES ? sum + q.mw : sum), 0),
    )
    .sort((a, b) => a - b);
  const heavyMw = Math.round(samples[Math.floor(samples.length * HEAVY_PERCENTILE)] / 100) * 100;

  const activeMw = Math.round(active.reduce((s, p) => s + (Number(p.summerNetMW) || 0), 0));
  const body = {
    meta: {
      source: "MISO generator interconnection queue (active requests), Census 2023 county centroids",
      generatedAt: new Date().toISOString(),
      activeProjects: active.length,
      activeMw,
      locatedMw: Math.round(activeMw - unlocatedMw),
      radiusMiles: RADIUS_MILES,
      heavyMw,
      heavyPercentile: HEAVY_PERCENTILE,
    },
    counties,
  };
  await writeFile(OUT_PATH, JSON.stringify(body) + "\n");

  console.log(
    `Wrote public/data/miso-queue.json: ${active.length} active requests, ${activeMw.toLocaleString()} MW; ` +
      `${counties.length} counties; heavy at ${heavyMw.toLocaleString()} MW within ${RADIUS_MILES} mi ` +
      `(p${HEAVY_PERCENTILE * 100} of ${samples.length} covered counties)`,
  );
  console.log(`  ${Math.round(unlocatedMw).toLocaleString()} MW has no usable county.`);
  if (unmatched.size) {
    console.log(`  Unmatched counties: ${[...unmatched.keys()].slice(0, 15).join("; ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

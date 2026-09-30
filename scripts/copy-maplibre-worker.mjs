// Copies MapLibre's worker files into /public so they are served from our own
// origin. Bundlers (Turbopack) rewrite `import.meta.url` inside maplibre-gl,
// which breaks its default worker lookup ("Worker failed to load").
// The worker imports ./maplibre-gl-shared.mjs, so both files must live together.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "maplibre");

mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(from, file), join(to, file));
}
console.log("Copied MapLibre worker files to public/maplibre");

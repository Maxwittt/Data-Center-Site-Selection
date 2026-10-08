/**
 * Calculator inputs shared by the pin card, the site comparison, and the URL.
 *
 * Year fields are overrides: `null` means "use the screening default for this
 * pin", so defaults can change when a dataset finishes loading or the pin
 * moves without discarding numbers the user typed.
 */

export interface CalculatorInputs {
  mw: string;
  targetYear: string;
  partialYears: number | null;
  fullYears: number | null;
  byopYears: number | null;
  utilityRate: string;
  gasPrice: string;
  heatRate: string;
  gasAdder: string;
}

export const DEFAULT_COST = {
  utilityRate: "70",
  gasPrice: "3.5",
  heatRate: "8.5",
  gasAdder: "30",
} as const;

export function defaultInputs(nowYear: number): CalculatorInputs {
  return {
    mw: "100",
    targetYear: String(nowYear + 4),
    partialYears: null,
    fullYears: null,
    byopYears: null,
    ...DEFAULT_COST,
  };
}

/** Clears the per-site year overrides, for a new pin. */
export function forNewSite(inputs: CalculatorInputs): CalculatorInputs {
  return { ...inputs, partialYears: null, fullYears: null, byopYears: null };
}

/** A finite number from a text field, or the fallback. */
export function numberOr(text: string, fallback: number): number {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) ? value : fallback;
}

// ---------- URL ----------

export type LngLat = [number, number];

export interface ShareState {
  pin: LngLat | null;
  sites: LngLat[];
  inputs: CalculatorInputs;
}

const KEYS = {
  mw: "mw",
  targetYear: "year",
  partialYears: "partial",
  fullYears: "full",
  byopYears: "gas",
  utilityRate: "rate",
  gasPrice: "gasPrice",
  heatRate: "heatRate",
  gasAdder: "gasAdder",
} as const satisfies Record<keyof CalculatorInputs, string>;

const formatPoint = ([lng, lat]: LngLat) => `${lng.toFixed(5)},${lat.toFixed(5)}`;

function parsePoint(text: string | null): LngLat | null {
  if (!text) return null;
  const [lng, lat] = text.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  return [lng, lat];
}

/** Only values that differ from the defaults go in the URL, so links stay short. */
export function encodeShare(state: ShareState, nowYear: number): string {
  const params = new URLSearchParams();
  if (state.pin) params.set("pin", formatPoint(state.pin));
  if (state.sites.length) params.set("sites", state.sites.map(formatPoint).join(";"));
  const defaults = defaultInputs(nowYear);
  for (const key of Object.keys(KEYS) as (keyof CalculatorInputs)[]) {
    const value = state.inputs[key];
    if (value !== null && value !== defaults[key]) params.set(KEYS[key], String(value));
  }
  return params.toString().replace(/%2C/g, ",").replace(/%3B/g, ";");
}

export function decodeShare(search: string, nowYear: number): ShareState {
  const params = new URLSearchParams(search);
  const inputs = defaultInputs(nowYear);
  for (const key of ["mw", "targetYear", "utilityRate", "gasPrice", "heatRate", "gasAdder"] as const) {
    const value = params.get(KEYS[key]);
    if (value !== null && value.length <= 12) inputs[key] = value;
  }
  for (const key of ["partialYears", "fullYears", "byopYears"] as const) {
    const value = Number(params.get(KEYS[key]));
    if (params.has(KEYS[key]) && Number.isInteger(value) && value >= 0 && value <= 50) {
      inputs[key] = value;
    }
  }
  const sites = (params.get("sites") ?? "")
    .split(";")
    .map(parsePoint)
    .filter((p): p is LngLat => p !== null)
    .slice(0, 3);
  return { pin: parsePoint(params.get("pin")), sites, inputs };
}

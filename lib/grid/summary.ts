import type { PinAnalysis } from "../geo/proximity.ts";
import type { SiteContext } from "../geo/site.ts";
import { DEFAULT_COST, numberOr, type CalculatorInputs } from "./calculator.ts";
import { compareCost, type CostComparison } from "./cost.ts";
import { comparePaths, rampGap, type PathComparison } from "./interconnection.ts";
import { screenSite, type SiteScreening } from "./screening.ts";

export interface ZoneSummary {
  name: string;
  avgMcc: number;
}

/** One saved site, in the shape the comparison table and CSV export need. */
export interface SiteSummary {
  point: [number, number];
  line: { kv: number; miles: number } | null;
  substation: { kv: number; miles: number; name: string | null } | null;
  pipelineMiles: number | null | undefined;
  backlog: { mw: number; heavy: boolean } | null;
  zone: ZoneSummary | null;
  screening: SiteScreening;
  paths: PathComparison;
  gapYears: number;
  cost: CostComparison;
}

/**
 * Uses each site's default years, so sites are compared on the same
 * assumptions; megawatts and cost inputs are shared.
 */
export function summarizeSite(
  analysis: PinAnalysis,
  site: SiteContext,
  zone: ZoneSummary | null,
  inputs: CalculatorInputs,
  nowYear: number,
): SiteSummary {
  const screening = screenSite(analysis.nearest, site);
  const { defaults } = screening;
  const mw = numberOr(inputs.mw, 0);
  const years = {
    partialYears: defaults.ftmPartialYears,
    fullYears: defaults.ftmFullYears,
    byopYears: defaults.byopYears,
  };
  const substation = site.substation.status === "ready" ? site.substation.value : null;
  const backlog = site.backlog.status === "ready" ? site.backlog.value : null;
  return {
    point: [analysis.point[0], analysis.point[1]],
    line: analysis.nearest
      ? { kv: analysis.nearest.kv, miles: analysis.nearest.distanceMiles }
      : null,
    substation: substation
      ? { kv: substation.kv, miles: substation.distanceMiles, name: substation.name }
      : null,
    pipelineMiles: screening.pipelineMiles,
    backlog: backlog ? { mw: backlog.mw, heavy: backlog.heavy } : null,
    zone,
    screening,
    paths: comparePaths({
      requestedMw: Math.max(0, mw),
      ...years,
      partialShare: defaults.partialShare,
      nowYear,
    }),
    gapYears: rampGap(years).years,
    cost: compareCost({
      utilityRate: numberOr(inputs.utilityRate, Number(DEFAULT_COST.utilityRate)),
      congestion: zone?.avgMcc ?? null,
      gasPrice: numberOr(inputs.gasPrice, Number(DEFAULT_COST.gasPrice)),
      heatRate: numberOr(inputs.heatRate, Number(DEFAULT_COST.heatRate)),
      gasAdder: numberOr(inputs.gasAdder, Number(DEFAULT_COST.gasAdder)),
    }),
  };
}

export const SITE_LABELS = ["A", "B", "C"] as const;

const mi = (miles: number | null | undefined) =>
  miles === null || miles === undefined ? "" : miles.toFixed(1);

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV with one row per site and the inputs that produced it. */
export function summaryCsv(summaries: SiteSummary[], inputs: CalculatorInputs): string {
  const header = [
    "site",
    "latitude",
    "longitude",
    "nearest_line_kv",
    "nearest_line_mi",
    "substation_kv",
    "substation_mi",
    "substation_name",
    "gas_pipeline_mi",
    "queued_mw_50mi",
    "heavy_backlog",
    "zone",
    "zone_avg_congestion_usd_mwh",
    "connection_basis",
    "utility_partial_year",
    "utility_full_year",
    "onsite_gas_year",
    "gap_years",
    "utility_usd_mwh",
    "gas_usd_mwh",
    "requested_mw",
    "utility_rate_input",
    "gas_price_input",
    "heat_rate_input",
    "gas_adder_input",
  ];
  const rows = summaries.map((s, i) => [
    SITE_LABELS[i] ?? String(i + 1),
    s.point[1].toFixed(5),
    s.point[0].toFixed(5),
    s.line?.kv ?? "",
    mi(s.line?.miles),
    s.substation?.kv ?? "",
    mi(s.substation?.miles),
    s.substation?.name ?? "",
    mi(s.pipelineMiles),
    s.backlog?.mw ?? "",
    s.backlog ? (s.backlog.heavy ? "yes" : "no") : "",
    s.zone?.name ?? "",
    s.zone ? s.zone.avgMcc.toFixed(2) : "",
    s.screening.basis.kind,
    s.paths.ftmPartialYear,
    s.paths.ftmFullYear,
    s.paths.byopYear,
    s.gapYears,
    s.cost.utility.toFixed(2),
    s.cost.gas.toFixed(2),
    inputs.mw,
    inputs.utilityRate,
    inputs.gasPrice,
    inputs.heatRate,
    inputs.gasAdder,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

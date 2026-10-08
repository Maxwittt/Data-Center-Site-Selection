import { tierIndexForKv } from "./voltage.ts";

/**
 * Screening defaults for the pin-card comparison. These are not a utility
 * study. See SPEC.md, Phase 3.
 *
 * Full utility power, in years from today, by the voltage of the connection
 * point: 500 kV+ 4, 345 kV 5, 230 kV 6, 138–161 kV 7, none 8. Connecting at
 * a line instead of an existing 230 kV+ substation adds 1 year for a new
 * switching station.
 * Add one year for every 10 miles past the first mile, capped at 3.
 * Add one year when nearby generator queue backlog is heavy.
 * Partial utility power is 2 years earlier than full, and never sooner than
 * 1 year, at 40% of the requested megawatts.
 * On-site gas covers the full request in 2 years when an interstate pipeline
 * is within 5 miles. Each further 15 miles of lateral adds a year, capped at 2;
 * no loaded pipeline counts as the cap.
 */

/** Years to full utility power before the distance adjustment, by tier index. */
const BASE_FULL_YEARS = [7, 6, 5, 4] as const;
const NO_LINE_FULL_YEARS = 8;
const DISTANCE_FREE_MILES = 1;
const MILES_PER_EXTRA_YEAR = 10;
const MAX_EXTRA_YEARS = 3;
const BACKLOG_YEARS = 1;
const NEW_STATION_YEARS = 1;
const PARTIAL_LEAD = 2;
const MIN_PARTIAL_YEARS = 1;

export const PARTIAL_SHARE = 0.4;
export const BYOP_LEAD_YEARS = 2;
const PIPELINE_FREE_MILES = 5;
const PIPELINE_MILES_PER_YEAR = 15;
const MAX_PIPELINE_YEARS = 2;

export interface RampInputs {
  /**
   * Where the load would connect. Null when nothing is loaded. `newStation`
   * adds a year for a switching station cut into a line with no substation.
   */
  connection: { kv: number; distanceMiles: number; newStation?: boolean } | null;
  /**
   * Distance to the nearest interstate gas pipeline. Null when none is loaded
   * near the pin (counts as the cap); undefined when the data is unknown (no
   * adjustment).
   */
  pipelineMiles?: number | null;
  /** True when nearby queued generation crosses the heavy-backlog threshold. */
  heavyBacklog?: boolean;
}

export interface ScreeningDefaults {
  /** Years from today until partial utility power. */
  ftmPartialYears: number;
  /** Years from today until the utility can serve the full request. */
  ftmFullYears: number;
  /** Fraction of requested MW delivered at the partial step. */
  partialShare: number;
  /** Years from today until on-site gas can serve the full request. */
  byopYears: number;
  /** Where each default came from, for the assumptions note. */
  parts: {
    voltageYears: number;
    stationYears: number;
    distanceYears: number;
    backlogYears: number;
    pipelineYears: number;
  };
}

export function defaultRamp({
  connection,
  pipelineMiles,
  heavyBacklog = false,
}: RampInputs): ScreeningDefaults {
  const voltageYears = connection
    ? BASE_FULL_YEARS[tierIndexForKv(connection.kv)]
    : NO_LINE_FULL_YEARS;
  const stationYears = connection?.newStation ? NEW_STATION_YEARS : 0;
  const distanceYears = connection
    ? Math.min(
        MAX_EXTRA_YEARS,
        Math.max(
          0,
          Math.floor(
            (connection.distanceMiles - DISTANCE_FREE_MILES) / MILES_PER_EXTRA_YEAR,
          ),
        ),
      )
    : 0;
  const backlogYears = heavyBacklog ? BACKLOG_YEARS : 0;
  const pipelineYears =
    pipelineMiles === undefined
      ? 0
      : pipelineMiles === null
      ? MAX_PIPELINE_YEARS
      : Math.min(
          MAX_PIPELINE_YEARS,
          Math.max(0, Math.ceil((pipelineMiles - PIPELINE_FREE_MILES) / PIPELINE_MILES_PER_YEAR)),
        );
  const ftmFullYears = voltageYears + stationYears + distanceYears + backlogYears;
  return {
    ftmPartialYears: Math.max(MIN_PARTIAL_YEARS, ftmFullYears - PARTIAL_LEAD),
    ftmFullYears,
    partialShare: PARTIAL_SHARE,
    byopYears: BYOP_LEAD_YEARS + pipelineYears,
    parts: { voltageYears, stationYears, distanceYears, backlogYears, pipelineYears },
  };
}

export type SoonerPath = "ftm" | "byop" | "tie";

export interface PathComparison {
  partialMw: number;
  ftmPartialYear: number;
  ftmFullYear: number;
  byopYear: number;
  sooner: SoonerPath;
  /** Absolute difference in years between the two full-power years. */
  soonerByYears: number;
}

/** Whole years. Non-finite or negative entries become 0. */
export function wholeYears(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export interface RampGap {
  /** Years after partial utility power when the rest of the request has no source. */
  years: number;
  /** What ends that stretch. Null when there is no gap. */
  endsWith: "gas" | "utility" | null;
}

/**
 * On-site gas and the utility ramp share one clock: years from today.
 * Gas covers the full request from the year it is built. A gap exists only
 * after partial utility power arrives, while the rest of the megawatts still
 * have no source. If gas is ready by the partial step, it covers that rest
 * until full utility power, and there is no gap.
 */
export function rampGap(input: {
  partialYears: number;
  fullYears: number;
  byopYears: number;
}): RampGap {
  const partialYears = wholeYears(input.partialYears);
  const fullYears = wholeYears(input.fullYears);
  const byopYears = wholeYears(input.byopYears);
  if (fullYears <= partialYears || byopYears <= partialYears) {
    return { years: 0, endsWith: null };
  }
  if (byopYears < fullYears) {
    return { years: byopYears - partialYears, endsWith: "gas" };
  }
  return { years: fullYears - partialYears, endsWith: "utility" };
}

export function comparePaths(input: {
  requestedMw: number;
  partialYears: number;
  fullYears: number;
  byopYears: number;
  partialShare: number;
  nowYear: number;
}): PathComparison {
  const partialYears = wholeYears(input.partialYears);
  const fullYears = wholeYears(input.fullYears);
  const byopYears = wholeYears(input.byopYears);
  const mw = Number.isFinite(input.requestedMw) ? Math.max(0, input.requestedMw) : 0;
  const ftmFullYear = input.nowYear + fullYears;
  const byopYear = input.nowYear + byopYears;
  const delta = ftmFullYear - byopYear;
  const sooner: SoonerPath = delta === 0 ? "tie" : delta > 0 ? "byop" : "ftm";
  return {
    partialMw: Math.round(mw * input.partialShare),
    ftmPartialYear: input.nowYear + partialYears,
    ftmFullYear,
    byopYear,
    sooner,
    soonerByYears: Math.abs(delta),
  };
}

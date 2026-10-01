// Pure (no runtime imports) so it can be unit-tested with `node --test`.

/**
 * "Congestion-exposed" is a price-based proxy, not a measure of net imports.
 * It asks: for a load sitting in this zone, how often and how much does
 * congestion push the day-ahead price up?
 *
 * Thresholds were calibrated on the 30-day MISO data (Sep 2026, 23 territories):
 *   avg MCC ranges -$16.7 .. +$13.2/MWh; hours congested ranges 8.9% .. 76.9%.
 * Only 4 zones are positive by more than $3 AND congested in 40%+ of hours
 * (Ameren Missouri, NIPSCO, AES Indiana, Duke Indiana), and they separate
 * cleanly from the rest. Both metrics are needed: Consumers and DTE are
 * congested in ~47% of hours but average negative, so hours alone would
 * over-flag them, and average alone would miss that they are intermittently
 * costly.
 *
 * Revisit these if the data window or the zone set changes materially.
 */
export const EXPOSED_MIN_AVG_MCC = 3; // $/MWh
export const EXPOSED_MIN_PCT_HOURS = 40; // % of hours
export const MIXED_MIN_AVG_MCC = 1; // $/MWh
export const MIXED_MIN_PCT_HOURS = 40; // % of hours
/** Basis std-dev at or above which the 30-day average is flagged as spike-driven. */
export const VOLATILE_BASIS_STD = 25; // $/MWh

export type ExposureLevel = "exposed" | "mixed" | "low";

export interface ExposureInput {
  avgMcc: number;
  pctHoursCongested: number;
  basisStd: number;
}

export interface Exposure {
  level: ExposureLevel;
  label: string;
  /** Average is likely dominated by a few extreme hours. */
  volatile: boolean;
}

export const EXPOSURE_LABELS: Record<ExposureLevel, string> = {
  exposed: "Congestion-exposed",
  mixed: "Mixed",
  low: "Low exposure",
};

export function classifyExposure(zone: ExposureInput): Exposure {
  let level: ExposureLevel;
  if (
    zone.avgMcc >= EXPOSED_MIN_AVG_MCC &&
    zone.pctHoursCongested >= EXPOSED_MIN_PCT_HOURS
  ) {
    level = "exposed";
  } else if (
    zone.avgMcc >= MIXED_MIN_AVG_MCC ||
    zone.pctHoursCongested >= MIXED_MIN_PCT_HOURS
  ) {
    level = "mixed";
  } else {
    level = "low";
  }
  return {
    level,
    label: EXPOSURE_LABELS[level],
    volatile: zone.basisStd >= VOLATILE_BASIS_STD,
  };
}

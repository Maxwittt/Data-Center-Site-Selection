export interface VoltageTier {
  label: string;
  color: string;
  /** Lowest kV value (inclusive) that belongs to this tier. */
  minKv: number;
}

/**
 * Single source of truth for map colors, the legend, and pin analysis.
 * Tiers are voltage classes: e.g. 220 kV lines fall in the 230 kV class and
 * 735/765 kV lines fall in the 500 kV+ class. The query only returns >= 138 kV.
 */
export const VOLTAGE_TIERS: VoltageTier[] = [
  { label: "138–161 kV", color: "#fbbf24", minKv: 0 },
  { label: "230 kV", color: "#f97316", minKv: 200 },
  { label: "345 kV", color: "#ef4444", minKv: 300 },
  { label: "500 kV+", color: "#a855f7", minKv: 500 },
];

/** Index into VOLTAGE_TIERS for a given line voltage in kV. */
export function tierIndexForKv(kv: number): number {
  let index = 0;
  for (let i = 1; i < VOLTAGE_TIERS.length; i++) {
    if (kv >= VOLTAGE_TIERS[i].minKv) {
      index = i;
    }
  }
  return index;
}

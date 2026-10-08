/**
 * Screening cost per MWh for the two paths. Not a tariff or a pro forma.
 *
 * Utility power: a user-entered all-in rate plus this zone's average day-ahead
 * congestion component, which is where the congestion map enters the
 * calculator. A zone that lowers prices (negative congestion) lowers the rate.
 *
 * On-site gas: gas price times heat rate, plus a non-fuel adder that stands in
 * for O&M and capital recovery.
 */

/** Hours a year at the assumed load factor, for the annual difference. */
export const LOAD_FACTOR = 0.9;
const HOURS_PER_YEAR = 8760;

export interface CostInputs {
  /** $/MWh before congestion. */
  utilityRate: number;
  /** Zone average congestion component, $/MWh. Null when the pin has no zone. */
  congestion: number | null;
  /** $/MMBtu */
  gasPrice: number;
  /** MMBtu/MWh */
  heatRate: number;
  /** O&M and capital recovery, $/MWh */
  gasAdder: number;
}

export interface CostComparison {
  utility: number;
  gas: number;
  gasFuel: number;
  cheaper: "ftm" | "byop" | "tie";
  /** Absolute difference, $/MWh. */
  delta: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function compareCost(input: CostInputs): CostComparison {
  const utility = round2(input.utilityRate + (input.congestion ?? 0));
  const gasFuel = round2(input.gasPrice * input.heatRate);
  const gas = round2(gasFuel + input.gasAdder);
  const diff = round2(utility - gas);
  return {
    utility,
    gas,
    gasFuel,
    cheaper: diff === 0 ? "tie" : diff > 0 ? "byop" : "ftm",
    delta: Math.abs(diff),
  };
}

/** Yearly cost difference, $, for `mw` running at LOAD_FACTOR. */
export function annualDifference(deltaPerMwh: number, mw: number): number {
  return deltaPerMwh * mw * HOURS_PER_YEAR * LOAD_FACTOR;
}

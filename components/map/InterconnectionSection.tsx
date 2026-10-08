"use client";

import { useId, useState } from "react";
import {
  numberOr,
  DEFAULT_COST,
  type CalculatorInputs,
} from "@/lib/grid/calculator";
import { annualDifference, compareCost, LOAD_FACTOR } from "@/lib/grid/cost";
import {
  comparePaths,
  rampGap,
  wholeYears,
  type PathComparison,
  type RampGap,
  type SoonerPath,
} from "@/lib/grid/interconnection";
import type { SiteScreening } from "@/lib/grid/screening";

interface InterconnectionSectionProps {
  screening: SiteScreening;
  inputs: CalculatorInputs;
  onInputsChange: (inputs: CalculatorInputs) => void;
  /** Zone average congestion component, $/MWh, or null outside any zone. */
  congestion: number | null;
  zoneName: string | null;
}

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-50 outline-none focus:border-cyan-400/60";

function formatMw(mw: number): string {
  return `${mw.toLocaleString("en-US")} MW`;
}

function formatDollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatMillions(value: number): string {
  const millions = value / 1_000_000;
  return `$${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function soonerSentence(sooner: SoonerPath, years: number): string {
  if (sooner === "tie") {
    return "Both paths cover the full request in the same year.";
  }
  const path = sooner === "byop" ? "On-site gas" : "Utility power";
  return `${path} covers the full request ${plural(years, "year")} sooner.`;
}

function yearSpan(years: number): string {
  return years === 1 ? "1-year" : `${years}-year`;
}

function gapSentence(
  gap: RampGap,
  comparison: PathComparison,
  partialMw: number,
  requestedMw: number,
): string {
  const until =
    gap.endsWith === "gas"
      ? `on-site gas in ${comparison.byopYear}`
      : `full utility power in ${comparison.ftmFullYear}`;
  return `${yearSpan(gap.years)} gap: from ${comparison.ftmPartialYear}, only ${formatMw(partialMw)} of ${formatMw(requestedMw)} is available. The rest has no source until ${until}.`;
}

function coveredSentence(
  comparison: PathComparison,
  gasFirst: boolean,
): string {
  const when = gasFirst ? "before" : "in the same year as";
  return `No gap in the ramp: on-site gas in ${comparison.byopYear} covers the full request ${when} partial utility power in ${comparison.ftmPartialYear}.`;
}

function targetSentence(label: string, year: number, target: number): string {
  if (year <= target) return `${label} meets ${target}.`;
  return `${label} is ${plural(year - target, "year")} after ${target}.`;
}

function basisSentence(screening: SiteScreening): string {
  const { basis } = screening;
  if (basis.kind === "substation") {
    return `Defaults connect at the nearest ${basis.kv} kV substation, ${basis.distanceMiles.toFixed(1)} mi away.`;
  }
  if (basis.kind === "line") {
    return `Defaults connect with a new switching station on the nearest ${basis.kv} kV line, ${basis.distanceMiles.toFixed(1)} mi away.`;
  }
  return "No line or substation is loaded, so the utility default is the longest screening wait.";
}

/** The pieces that add up to each default, so the user can see the assumptions. */
function assumptionRows(screening: SiteScreening): { label: string; years: number }[] {
  const { parts } = screening.defaults;
  const { basis, pipelineMiles } = screening;
  const rows = [
    {
      label: basis.kind === "none" ? "No connection loaded" : `${basis.kv} kV connection`,
      years: parts.voltageYears,
    },
  ];
  if (parts.stationYears) rows.push({ label: "New switching station", years: parts.stationYears });
  if (parts.distanceYears) rows.push({ label: "Distance to connection", years: parts.distanceYears });
  if (parts.backlogYears) rows.push({ label: "Heavy queue backlog nearby", years: parts.backlogYears });
  rows.push({ label: "On-site gas base", years: screening.defaults.byopYears - parts.pipelineYears });
  if (parts.pipelineYears) {
    rows.push({
      label:
        pipelineMiles === null
          ? "No interstate pipeline loaded"
          : `Gas lateral, ${pipelineMiles?.toFixed(0)} mi`,
      years: parts.pipelineYears,
    });
  }
  return rows;
}

export default function InterconnectionSection({
  screening,
  inputs,
  onInputsChange,
  congestion,
  zoneName,
}: InterconnectionSectionProps) {
  const { defaults } = screening;
  const nowYear = new Date().getFullYear();
  const partialYears = inputs.partialYears ?? defaults.ftmPartialYears;
  const fullYears = inputs.fullYears ?? defaults.ftmFullYears;
  const byopYears = inputs.byopYears ?? defaults.byopYears;
  const set = (patch: Partial<CalculatorInputs>) => onInputsChange({ ...inputs, ...patch });

  const requestedMw = Number(inputs.mw);
  const targetYear = Number(inputs.targetYear);
  const hasMw = Number.isFinite(requestedMw) && requestedMw > 0;
  const hasTarget = Number.isInteger(targetYear) && targetYear >= nowYear;
  const comparison = comparePaths({
    requestedMw: hasMw ? requestedMw : 0,
    partialYears,
    fullYears,
    byopYears,
    partialShare: defaults.partialShare,
    nowYear,
  });
  const gap = rampGap({ partialYears, fullYears, byopYears });
  const edited =
    inputs.partialYears !== null || inputs.fullYears !== null || inputs.byopYears !== null;
  const gasCoversRamp =
    gap.years === 0 &&
    wholeYears(byopYears) <= wholeYears(partialYears) &&
    wholeYears(fullYears) > wholeYears(partialYears);

  const cost = compareCost({
    utilityRate: numberOr(inputs.utilityRate, Number(DEFAULT_COST.utilityRate)),
    congestion,
    gasPrice: numberOr(inputs.gasPrice, Number(DEFAULT_COST.gasPrice)),
    heatRate: numberOr(inputs.heatRate, Number(DEFAULT_COST.heatRate)),
    gasAdder: numberOr(inputs.gasAdder, Number(DEFAULT_COST.gasAdder)),
  });

  const [open, setOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const panelId = useId();

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="-mx-1 flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left hover:bg-white/5"
      >
        <span className="text-xs font-semibold tracking-tight text-zinc-100">
          Interconnection screening
        </span>
        <span className="flex items-center gap-1.5">
          {!open && gap.years > 0 && hasMw && (
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.85)]">
              <span className="sr-only">Power gap</span>
            </span>
          )}
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div id={panelId}>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            {basisSentence(screening)}
            {edited ? " Years below are edited." : ""} Screening defaults, not a
            utility study.
          </p>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-zinc-400">
              Megawatts
              <input
                className={`${inputClass} mt-1`}
                inputMode="decimal"
                value={inputs.mw}
                onChange={(event) => set({ mw: event.target.value })}
              />
            </label>
            <label className="block text-[11px] text-zinc-400">
              Target year
              <input
                className={`${inputClass} mt-1`}
                inputMode="numeric"
                value={inputs.targetYear}
                onChange={(event) => set({ targetYear: event.target.value })}
              />
            </label>
          </div>

          <p className="mt-3 text-[11px] text-zinc-400">Utility power</p>
          <div className="mt-1.5 space-y-2">
            <YearRow
              label="Partial"
              years={partialYears}
              onChange={(years) => set({ partialYears: years })}
              detail={
                hasMw
                  ? `${formatMw(comparison.partialMw)} in ${comparison.ftmPartialYear}`
                  : "Enter megawatts"
              }
            />
            <YearRow
              label="Full"
              years={fullYears}
              onChange={(years) => set({ fullYears: years })}
              detail={
                hasMw
                  ? `${formatMw(Math.round(requestedMw))} in ${comparison.ftmFullYear}`
                  : "Enter megawatts"
              }
            />
          </div>
          <div className="mt-2">
            <YearRow
              label="On-site gas"
              years={byopYears}
              onChange={(years) => set({ byopYears: years })}
              detail={
                hasMw
                  ? `${formatMw(Math.round(requestedMw))} in ${comparison.byopYear}`
                  : "Enter megawatts"
              }
            />
          </div>
          {edited && (
            <button
              type="button"
              onClick={() => set({ partialYears: null, fullYears: null, byopYears: null })}
              className="mt-1.5 text-[11px] text-cyan-300 hover:text-cyan-200"
            >
              Reset years to defaults
            </button>
          )}

          {hasMw && gap.years > 0 && (
            <p className="mt-2 rounded-md border border-rose-500/50 bg-rose-500/15 px-2.5 py-2 text-xs leading-snug text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.45)]">
              {gapSentence(gap, comparison, comparison.partialMw, Math.round(requestedMw))}
            </p>
          )}

          {hasMw && (
            <p className="mt-2 text-xs leading-snug text-zinc-200">
              {soonerSentence(comparison.sooner, comparison.soonerByYears)}
              {gasCoversRamp &&
                ` ${coveredSentence(comparison, wholeYears(byopYears) < wholeYears(partialYears))}`}
              {comparison.ftmPartialYear > comparison.ftmFullYear &&
                " Partial power is dated after full power."}
              {hasTarget && (
                <>
                  {" "}
                  {targetSentence("Utility power", comparison.ftmFullYear, targetYear)}{" "}
                  {targetSentence("On-site gas", comparison.byopYear, targetYear)}
                </>
              )}
            </p>
          )}

          <details className="mt-2 text-[11px] text-zinc-500">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">
              How the default years add up
            </summary>
            <ul className="mt-1 space-y-0.5">
              {assumptionRows(screening).map((row) => (
                <li key={row.label} className="flex justify-between gap-2">
                  <span>{row.label}</span>
                  <span className="text-zinc-300">+{plural(row.years, "yr")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 leading-snug">
              Partial utility power arrives 2 years before full at{" "}
              {Math.round(defaults.partialShare * 100)}% of the request. See the README for
              sources.
            </p>
          </details>

          <div className="mt-3 border-t border-white/5 pt-2">
            <p className="text-[11px] text-zinc-400">Energy cost, $/MWh</p>
            <ul className="mt-1.5 space-y-1 text-xs">
              <li className="flex justify-between gap-2">
                <span className="text-zinc-300">Utility power</span>
                <span className="text-zinc-50">{formatDollars(cost.utility)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-zinc-300">On-site gas</span>
                <span className="text-zinc-50">{formatDollars(cost.gas)}</span>
              </li>
            </ul>
            <p className="mt-1.5 text-xs leading-snug text-zinc-200">
              {cost.cheaper === "tie"
                ? "Both paths cost the same per MWh."
                : `${cost.cheaper === "byop" ? "On-site gas" : "Utility power"} is ${formatDollars(cost.delta)}/MWh cheaper${
                    hasMw
                      ? `, about ${formatMillions(annualDifference(cost.delta, requestedMw))} a year at ${Math.round(LOAD_FACTOR * 100)}% load`
                      : ""
                  }.`}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">
              {congestion === null
                ? "The pin is outside a mapped zone, so no congestion is added."
                : `Utility includes ${zoneName ?? "this zone"}'s average congestion of ${congestion >= 0 ? "+" : "−"}${formatDollars(Math.abs(congestion))}.`}{" "}
              Gas is fuel ({formatDollars(cost.gasFuel)}) plus O&amp;M and capital.
            </p>
            <button
              type="button"
              aria-expanded={costOpen}
              onClick={() => setCostOpen((value) => !value)}
              className="mt-1 text-[11px] text-cyan-300 hover:text-cyan-200"
            >
              {costOpen ? "Hide cost inputs" : "Edit cost inputs"}
            </button>
            {costOpen && (
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <CostField
                  label="Utility rate, $/MWh"
                  value={inputs.utilityRate}
                  onChange={(utilityRate) => set({ utilityRate })}
                />
                <CostField
                  label="Gas, $/MMBtu"
                  value={inputs.gasPrice}
                  onChange={(gasPrice) => set({ gasPrice })}
                />
                <CostField
                  label="Heat rate, MMBtu/MWh"
                  value={inputs.heatRate}
                  onChange={(heatRate) => set({ heatRate })}
                />
                <CostField
                  label="Gas O&M + capital, $/MWh"
                  value={inputs.gasAdder}
                  onChange={(gasAdder) => set({ gasAdder })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CostField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[10px] leading-tight text-zinc-400">
      {label}
      <input
        className={`${inputClass} mt-1`}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3.5 w-3.5 text-zinc-200 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function YearRow({
  label,
  years,
  onChange,
  detail,
}: {
  label: string;
  years: number;
  onChange: (years: number) => void;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-zinc-300">{label}</span>
      <input
        aria-label={`${label} years`}
        className="w-12 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-center text-zinc-50 outline-none focus:border-cyan-400/60"
        inputMode="numeric"
        value={String(years)}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value === "") {
            onChange(0);
            return;
          }
          if (Number.isFinite(next)) onChange(wholeYears(next));
        }}
      />
      <span className="text-zinc-500">yr</span>
      <span className="ml-auto text-right text-zinc-50">{detail}</span>
    </div>
  );
}

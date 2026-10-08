"use client";

import { useState } from "react";
import SourceNote from "@/components/map/SourceNote";
import CongestionSection, {
  type ZoneContext,
} from "@/components/map/CongestionSection";
import InterconnectionSection from "@/components/map/InterconnectionSection";
import type { LineHit, PinAnalysis } from "@/lib/geo/proximity";
import type { Lookup, PipelineHit, SiteContext, SubstationHit } from "@/lib/geo/site";
import type { CalculatorInputs } from "@/lib/grid/calculator";
import type { SiteScreening } from "@/lib/grid/screening";
import { tierIndexForKv, VOLTAGE_TIERS } from "@/lib/grid/voltage";
import { GAS_COLOR } from "@/lib/map/sites";

interface PinCardProps {
  analysis: PinAnalysis;
  site: SiteContext;
  screening: SiteScreening;
  congestion: ZoneContext;
  inputs: CalculatorInputs;
  onInputsChange: (inputs: CalculatorInputs) => void;
  saveState: "available" | "saved" | "full";
  onSave: () => void;
  onClear: () => void;
}

const SAVE_LABELS = {
  available: "Save to compare",
  saved: "Saved to compare",
  full: "Compare is full (3)",
} as const;

function lookupText<T>(
  lookup: Lookup<T | null>,
  none: string,
  render: (value: T) => string,
): string {
  if (lookup.status === "loading") return "Loading…";
  if (lookup.status === "unavailable") return "Unavailable";
  return lookup.value ? render(lookup.value) : none;
}

function substationLabel(hit: SubstationHit): string {
  return hit.name ? titleCase(hit.name) : "Unnamed substation";
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pipelineLabel(hit: PipelineHit): string {
  return hit.operator ?? "Operator unknown";
}

function plural(n: number, unit: string): string {
  return `${n.toLocaleString("en-US")} ${unit}${n === 1 ? "" : "s"}`;
}

function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

function formatOwner(owner: string | null): string {
  return !owner || owner === "NOT AVAILABLE" ? "Owner unknown" : owner;
}

function formatCoord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

export default function PinCard({
  analysis,
  site,
  screening,
  congestion,
  inputs,
  onInputsChange,
  saveState,
  onSave,
  onClear,
}: PinCardProps) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  }

  const { point, nearest, byTier, coverageMarginMiles, outsideCoverage } =
    analysis;

  // A reported distance beyond the loaded-data edge may be overstated.
  const isUncertain = (hit: LineHit | null) =>
    !hit || hit.distanceMiles > coverageMarginMiles;
  const substation = site.substation.status === "ready" ? site.substation.value : null;
  const pipeline = site.pipeline.status === "ready" ? site.pipeline.value : null;
  const backlog = site.backlog.status === "ready" ? site.backlog.value : null;
  const anyUncertain =
    byTier.some(isUncertain) ||
    (site.substation.status === "ready" && (!substation || substation.uncertain)) ||
    (site.pipeline.status === "ready" && (!pipeline || pipeline.uncertain));

  return (
    <aside
      aria-label="Dropped pin"
      className="pointer-events-auto absolute top-4 right-4 z-10 max-h-[calc(100dvh-2rem)] w-80 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/85 p-4 shadow-lg shadow-black/40 backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium tracking-wider text-cyan-400 uppercase">
            Dropped pin
          </p>
          <p className="mt-0.5 font-mono text-xs text-zinc-300">
            {formatCoord(point[1], "N", "S")}, {formatCoord(point[0], "E", "W")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove pin"
          className="-mt-1 -mr-1 rounded-md px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-50"
        >
          ×
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saveState !== "available"}
          className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:cursor-default disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-500"
        >
          {SAVE_LABELS[saveState]}
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-zinc-50"
        >
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>

      {outsideCoverage && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          This pin is outside the loaded MISO data area (MISO plus a 50-mile
          margin). Distances below are incomplete.
        </p>
      )}

      <section className="mt-3">
        <div className="relative flex w-full items-center gap-1.5">
          <h2 className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Nearest transmission line
          </h2>
          {anyUncertain && (
            <SourceNote label="Distance note" placement="down">
              A closer line may lie beyond the loaded data area.
            </SourceNote>
          )}
        </div>
        {nearest ? (
          <>
            <p className="mt-1 flex items-baseline gap-2">
              <span
                className="text-2xl font-semibold tracking-tight"
                style={{ color: VOLTAGE_TIERS[nearest.tierIndex].color }}
              >
                {nearest.kv} kV
              </span>
              <span className="text-sm font-medium text-zinc-50">
                {formatMiles(nearest.distanceMiles)}
                {isUncertain(nearest) && "*"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {formatOwner(nearest.owner)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">
            No lines in the loaded area.
          </p>
        )}
      </section>

      <section className="mt-3 border-t border-white/10 pt-3">
        <h2 className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Nearest by voltage
        </h2>
        <ul className="mt-2 space-y-1.5">
          {VOLTAGE_TIERS.map((tier, i) => {
            const hit = byTier[i];
            return (
              <li key={tier.label} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: tier.color }}
                />
                <span className="text-zinc-300">{tier.label}</span>
                {/* Show the exact kV when the tier is a range (e.g. 161 in 138–161, 765 in 500+). */}
                {hit && hit.kv !== Number.parseInt(tier.label, 10) && (
                  <span className="text-zinc-500">({hit.kv} kV)</span>
                )}
                <span className="ml-auto font-medium text-zinc-50">
                  {hit
                    ? `${formatMiles(hit.distanceMiles)}${isUncertain(hit) ? "*" : ""}`
                    : "None loaded*"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-3 border-t border-white/10 pt-3">
        <h2 className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Substation, gas, and queue
        </h2>
        <ul className="mt-2 space-y-2 text-xs">
          <li className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1 h-2 w-2 shrink-0 rounded-full border-2 bg-zinc-950"
              style={{
                borderColor: substation
                  ? VOLTAGE_TIERS[tierIndexForKv(substation.kv)].color
                  : "#71717a",
              }}
            />
            <span className="min-w-0">
              <span className="block text-zinc-300">
                {substation ? `${substation.kv} kV substation` : "Substation, 230 kV+"}
              </span>
              {substation && (
                <span className="block truncate text-[11px] text-zinc-500">
                  {substationLabel(substation)}
                </span>
              )}
            </span>
            <span className="ml-auto shrink-0 font-medium text-zinc-50">
              {lookupText(site.substation, "None loaded*", (hit) =>
                `${formatMiles(hit.distanceMiles)}${hit.uncertain ? "*" : ""}`,
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 w-2 shrink-0 border-t-2 border-dashed"
              style={{ borderColor: GAS_COLOR }}
            />
            <span className="min-w-0">
              <span className="block text-zinc-300">Interstate gas pipeline</span>
              {pipeline && (
                <span className="block truncate text-[11px] text-zinc-500">
                  {pipelineLabel(pipeline)}
                </span>
              )}
            </span>
            <span className="ml-auto shrink-0 font-medium text-zinc-50">
              {lookupText(site.pipeline, "None loaded*", (hit) =>
                `${formatMiles(hit.distanceMiles)}${hit.uncertain ? "*" : ""}`,
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-sm bg-zinc-600" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-zinc-300">
                Queued generation
                {backlog?.heavy && (
                  <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1 text-[10px] text-amber-300">
                    Heavy
                  </span>
                )}
              </span>
              <span className="block text-[11px] text-zinc-500">
                {backlog
                  ? `${plural(backlog.projects, "request")} within ${backlog.radiusMiles} mi. Backlog proxy.`
                  : "Active MISO requests nearby"}
              </span>
            </span>
            <span className="ml-auto shrink-0 font-medium text-zinc-50">
              {site.backlog.status === "loading"
                ? "Loading…"
                : backlog
                  ? `${backlog.mw.toLocaleString("en-US")} MW`
                  : "Unavailable"}
            </span>
          </li>
        </ul>
        {backlog && (
          <p className="mt-2 text-[11px] leading-snug text-zinc-500">
            Heavy means over {backlog.heavyMw.toLocaleString("en-US")} MW, the busiest quarter of
            MISO counties. A busy queue tends to slow new large loads; it is not this
            site&apos;s queue position.
          </p>
        )}
      </section>

      <CongestionSection context={congestion} />

      <InterconnectionSection
        screening={screening}
        inputs={inputs}
        onInputsChange={onInputsChange}
        congestion={congestion.status === "inside" ? congestion.zone.avgMcc : null}
        zoneName={congestion.status === "inside" ? congestion.zone.name : null}
      />

      <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-snug text-zinc-500">
        Straight-line distance to HIFLD line geometry, for screening only.
        Drag the pin to move it.
      </p>
    </aside>
  );
}

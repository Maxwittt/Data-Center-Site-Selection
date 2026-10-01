import { classifyExposure, type ExposureLevel } from "@/lib/grid/exposure";
import {
  formatPeriod,
  formatPercent,
  formatSignedDollars,
  type CongestionMeta,
  type CongestionProperties,
} from "@/lib/map/congestion";

/** What the pin card knows about congestion at the pin's location. */
export type ZoneContext =
  /** Congestion data hasn't finished loading yet. */
  | { status: "loading" }
  /** Congestion data failed to load. */
  | { status: "unavailable" }
  /** Pin is not inside any mapped MISO utility territory. */
  | { status: "outside" }
  | {
      status: "inside";
      /** The topmost (smallest) territory containing the pin. */
      zone: CongestionProperties;
      /** Other, larger territories that also contain the pin. */
      overlapping: string[];
      meta: CongestionMeta;
    };

const BADGE_STYLES: Record<ExposureLevel, string> = {
  exposed: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  mixed: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  low: "border-teal-500/30 bg-teal-500/15 text-teal-300",
};

const HUB_REGION_NAMES: Record<string, string> = { MINN: "Minnesota" };

/** "ILLINOIS.HUB" -> "Illinois Hub", "MINN.HUB" -> "Minnesota Hub" */
function hubLabel(node: string): string {
  const region = node.split(".")[0];
  const name =
    HUB_REGION_NAMES[region] ??
    region.charAt(0) + region.slice(1).toLowerCase();
  return `${name} Hub`;
}

function summaryFor(level: ExposureLevel, zone: CongestionProperties): string {
  switch (level) {
    case "exposed":
      return `Congestion adds cost here in ${formatPercent(zone.pctHoursCongested)} of hours and averages ${formatSignedDollars(zone.avgMcc)}/MWh.`;
    case "mixed":
      return zone.avgMcc >= 1
        ? "Congestion adds a modest cost on average, but not in most hours."
        : "Congestion is frequent but averages out: costly hours are offset by hours where it lowers the price.";
    case "low":
      return zone.avgMcc < 0
        ? "Congestion rarely adds cost here; on average it lowers the price."
        : "Congestion adds little cost here.";
  }
}

function Row({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex justify-between gap-3 text-xs" title={title}>
      <dt className="text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-50 tabular-nums">{value}</dd>
    </div>
  );
}

export default function CongestionSection({ context }: { context: ZoneContext }) {
  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          MISO congestion here
        </h2>
        {context.status === "inside" && (
          <ExposureBadge zone={context.zone} />
        )}
      </div>

      {context.status === "loading" && (
        <p className="mt-1.5 text-xs text-zinc-400">Loading congestion data…</p>
      )}

      {context.status === "unavailable" && (
        <p className="mt-1.5 text-xs text-zinc-400">
          Congestion data is unavailable.
        </p>
      )}

      {context.status === "outside" && (
        <p className="mt-1.5 text-xs leading-snug text-zinc-400">
          Not inside a mapped MISO utility territory, so there is no congestion
          data for this spot. This includes areas outside MISO and a few
          smaller MISO zones without matched price data.
        </p>
      )}

      {context.status === "inside" && <InsideZone context={context} />}
    </section>
  );
}

function ExposureBadge({ zone }: { zone: CongestionProperties }) {
  const exposure = classifyExposure(zone);
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BADGE_STYLES[exposure.level]}`}
    >
      {exposure.label}
    </span>
  );
}

function InsideZone({
  context,
}: {
  context: Extract<ZoneContext, { status: "inside" }>;
}) {
  const { zone, overlapping, meta } = context;
  const exposure = classifyExposure(zone);
  const hub = hubLabel(zone.hub);

  return (
    <>
      <p className="mt-1.5 text-sm font-medium text-zinc-50">{zone.name}</p>
      <p className="text-[10px] text-zinc-500">{zone.zoneNodes}</p>

      <dl className="mt-2 space-y-1">
        <Row
          label="Avg congestion"
          value={`${formatSignedDollars(zone.avgMcc)}/MWh`}
          title="Mean day-ahead marginal congestion component, $/MWh"
        />
        <Row
          label="Hours congested"
          value={formatPercent(zone.pctHoursCongested)}
          title={`Share of hours with congestion cost above $${meta.congestedHourMccThreshold}/MWh`}
        />
        <Row
          label={`Price vs ${hub}`}
          value={`${formatSignedDollars(zone.basisMean)} \u00b1 ${zone.basisStd.toFixed(1)}`}
          title={`Mean day-ahead price difference vs ${hub} in $/MWh, \u00b1 standard deviation`}
        />
      </dl>

      <p className="mt-2 text-[11px] leading-snug text-zinc-300">
        {summaryFor(exposure.level, zone)}
      </p>

      {exposure.volatile && (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-200">
          Prices here swing widely against the hub (±$
          {zone.basisStd.toFixed(0)}/MWh), so the average is driven by a few
          extreme hours.
        </p>
      )}

      {overlapping.length > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-zinc-500">
          Territory boundaries overlap here. Showing the smallest; also
          within: {overlapping.join(", ")}.
        </p>
      )}

      <p className="mt-2 text-[10px] leading-snug text-zinc-500">
        Day-ahead, {meta.dayCount}-day average ({formatPeriod(meta)}). Past
        prices, not a forecast.
      </p>
    </>
  );
}

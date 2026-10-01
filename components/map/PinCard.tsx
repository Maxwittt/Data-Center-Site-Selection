import CongestionSection, {
  type ZoneContext,
} from "@/components/map/CongestionSection";
import type { LineHit, PinAnalysis } from "@/lib/geo/proximity";
import { VOLTAGE_TIERS } from "@/lib/grid/voltage";

interface PinCardProps {
  analysis: PinAnalysis;
  congestion: ZoneContext;
  onClear: () => void;
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

export default function PinCard({ analysis, congestion, onClear }: PinCardProps) {
  const { point, nearest, byTier, coverageMarginMiles, outsideCoverage } =
    analysis;

  // A reported distance beyond the loaded-data edge may be overstated.
  const isUncertain = (hit: LineHit | null) =>
    !hit || hit.distanceMiles > coverageMarginMiles;
  const anyUncertain = byTier.some(isUncertain);

  return (
    <aside className="pointer-events-auto absolute top-4 right-4 z-10 max-h-[calc(100dvh-2rem)] w-80 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/85 p-4 shadow-lg shadow-black/40 backdrop-blur-md">
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

      {outsideCoverage && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          This pin is outside the loaded MISO data area (MISO plus a 50-mile
          margin). Distances below are incomplete.
        </p>
      )}

      <section className="mt-3">
        <h2 className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
          Nearest transmission line
        </h2>
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

      <CongestionSection context={congestion} />

      <p className="mt-3 border-t border-white/10 pt-2 text-[11px] leading-snug text-zinc-500">
        {anyUncertain && "* A closer line may lie beyond the loaded data area. "}
        Straight-line distance to HIFLD line geometry, for screening only.
        Drag the pin to move it.
      </p>
    </aside>
  );
}

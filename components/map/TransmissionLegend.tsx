import SourceNote from "@/components/map/SourceNote";
import { VOLTAGE_TIERS } from "@/lib/grid/voltage";
import { GAS_COLOR } from "@/lib/map/sites";

export default function TransmissionLegend({
  showLines,
  showSubstations,
  showGas,
}: {
  showLines: boolean;
  showSubstations: boolean;
  showGas: boolean;
}) {
  return (
    <aside
      aria-label="Transmission voltage legend"
      className="pointer-events-auto w-56 rounded-xl border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-tight text-zinc-50">
          Transmission Voltage
        </h2>
        <SourceNote>
          HIFLD electric transmission lines and substations, U.S. DOE / ORNL.
          EIA interstate natural gas pipelines.
        </SourceNote>
      </div>

      {(showLines || showSubstations) && (
        <ul className="mt-2.5 space-y-1.5">
          {VOLTAGE_TIERS.map((tier) => (
            <li key={tier.label} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-0.5 w-6 rounded-full"
                style={{
                  backgroundColor: tier.color,
                  boxShadow: `0 0 6px ${tier.color}`,
                }}
              />
              <span className="text-xs text-zinc-300">{tier.label}</span>
            </li>
          ))}
        </ul>
      )}

      {(showSubstations || showGas) && (
        <ul className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2.5">
          {showSubstations && (
            <li className="flex items-center gap-2.5">
              <span className="flex w-6 justify-center" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full border-2 border-zinc-300 bg-zinc-950" />
              </span>
              <span className="text-xs text-zinc-300">Substation, by voltage</span>
            </li>
          )}
          {showGas && (
            <li className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="w-6 border-t-2 border-dashed"
                style={{ borderColor: GAS_COLOR }}
              />
              <span className="text-xs text-zinc-300">Interstate gas pipeline</span>
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}

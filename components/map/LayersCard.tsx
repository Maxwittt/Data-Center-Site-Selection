import {
  CONGESTION_METRICS,
  formatPeriod,
  type CongestionMeta,
  type CongestionMetric,
} from "@/lib/map/congestion";

interface LayersCardProps {
  showLines: boolean;
  onShowLinesChange: (value: boolean) => void;
  showZones: boolean;
  onShowZonesChange: (value: boolean) => void;
  metric: CongestionMetric;
  onMetricChange: (value: CongestionMetric) => void;
  /** Null until the congestion data has loaded. */
  meta: CongestionMeta | null;
}

export default function LayersCard({
  showLines,
  onShowLinesChange,
  showZones,
  onShowZonesChange,
  metric,
  onMetricChange,
  meta,
}: LayersCardProps) {
  return (
    <aside
      aria-label="Map layers"
      className="pointer-events-auto absolute top-24 left-4 z-10 w-56 rounded-xl border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md"
    >
      <h2 className="text-xs font-semibold tracking-tight text-zinc-50">Layers</h2>

      <div className="mt-2.5 space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={showLines}
            onChange={(e) => onShowLinesChange(e.target.checked)}
            className="accent-cyan-400"
          />
          Transmission lines
        </label>
        <label
          className={`flex items-center gap-2 text-xs ${
            meta ? "cursor-pointer text-zinc-300" : "text-zinc-600"
          }`}
        >
          <input
            type="checkbox"
            checked={showZones}
            disabled={!meta}
            onChange={(e) => onShowZonesChange(e.target.checked)}
            className="accent-cyan-400"
          />
          MISO congestion
        </label>
      </div>

      {showZones && meta && (
        <fieldset className="mt-3 border-t border-white/10 pt-2.5">
          <legend className="sr-only">Congestion metric</legend>
          <div
            role="radiogroup"
            aria-label="Congestion metric"
            className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-0.5"
          >
            {CONGESTION_METRICS.map((option) => {
              const active = option.id === metric;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onMetricChange(option.id)}
                  className={`rounded-md px-1.5 py-1 text-[11px] leading-tight transition-colors ${
                    active
                      ? "bg-white/15 font-medium text-zinc-50"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            Day-ahead, {meta.dayCount}-day average
            <br />
            {formatPeriod(meta)}
          </p>
        </fieldset>
      )}
    </aside>
  );
}

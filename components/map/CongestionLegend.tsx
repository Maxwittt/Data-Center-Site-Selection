import {
  legendGradient,
  type CongestionMeta,
  type CongestionMetric,
} from "@/lib/map/congestion";
import SourceNote from "@/components/map/SourceNote";

interface CongestionLegendProps {
  metric: CongestionMetric;
  meta: CongestionMeta;
}

export default function CongestionLegend({ metric, meta }: CongestionLegendProps) {
  const isCost = metric === "avgMcc";

  return (
    <aside
      aria-label="MISO congestion legend"
      className="pointer-events-auto w-56 rounded-xl border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-tight text-zinc-50">
          {isCost ? "Avg Congestion Cost" : "Hours Congested"}
        </h2>
        <SourceNote>
          MISO day-ahead prices joined to HIFLD utility territories. Only
          utilities with a matched price zone are shaded.
        </SourceNote>
      </div>

      <div
        aria-hidden
        className="mt-2.5 h-3 rounded-sm"
        style={{ background: legendGradient(metric, meta) }}
      />

      {isCost ? (
        <>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
            <span>{`\u2212$${meta.avgMccLimit}`}</span>
            <span>$0</span>
            <span>{`+$${meta.avgMccLimit}`}</span>
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-zinc-500">
            <span>lowers price</span>
            <span>adds cost</span>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            $/MWh, day-ahead marginal congestion component vs. system energy
            price.
          </p>
        </>
      ) : (
        <>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
            <span>0%</span>
            <span>{`${meta.pctHoursLimit / 2}%`}</span>
            <span>{`${meta.pctHoursLimit}%`}</span>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-500">
            Share of hours with congestion cost above $
            {meta.congestedHourMccThreshold}/MWh.
          </p>
        </>
      )}

    </aside>
  );
}

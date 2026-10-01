import {
  formatPercent,
  formatSignedDollars,
  type CongestionProperties,
} from "@/lib/map/congestion";

interface ZoneTooltipProps {
  /** Pixel position inside the map container. */
  x: number;
  y: number;
  zone: CongestionProperties;
}

export default function ZoneTooltip({ x, y, zone }: ZoneTooltipProps) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-56 rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg shadow-black/50"
      style={{ left: x + 14, top: y + 14 }}
    >
      <div className="font-medium text-zinc-50">{zone.name}</div>
      <div className="text-[10px] text-zinc-500">{zone.zoneNodes}</div>
      <dl className="mt-1.5 space-y-0.5 text-zinc-300">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-400">Avg congestion</dt>
          <dd className="tabular-nums">{formatSignedDollars(zone.avgMcc)}/MWh</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-400">Hours congested</dt>
          <dd className="tabular-nums">{formatPercent(zone.pctHoursCongested)}</dd>
        </div>
      </dl>
    </div>
  );
}

import { VOLTAGE_TIERS } from "@/lib/grid/voltage";

export default function TransmissionLegend() {
  return (
    <aside
      aria-label="Transmission voltage legend"
      className="pointer-events-auto w-56 rounded-xl border border-white/10 bg-zinc-950/85 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md"
    >
      <h2 className="text-xs font-semibold tracking-tight text-zinc-50">
        Transmission Voltage
      </h2>

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

      <p className="mt-2.5 border-t border-white/10 pt-2 text-[10px] text-zinc-500">
        Source: HIFLD, U.S. DOE / ORNL
      </p>
    </aside>
  );
}

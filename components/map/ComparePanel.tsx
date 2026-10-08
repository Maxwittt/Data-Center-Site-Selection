"use client";

import { useId, useState } from "react";
import type { CalculatorInputs } from "@/lib/grid/calculator";
import { SITE_LABELS, summaryCsv, type SiteSummary } from "@/lib/grid/summary";

interface ComparePanelProps {
  summaries: SiteSummary[];
  inputs: CalculatorInputs;
  onShow: (index: number) => void;
  onRemove: (index: number) => void;
}

const mi = (miles: number | null | undefined) =>
  miles === null || miles === undefined ? "None loaded" : `${miles.toFixed(1)} mi`;

const dollars = (value: number) => `$${value.toFixed(2)}`;

/** Index of the best value per row, for a subtle highlight; null on ties. */
function bestIndex(values: (number | null)[], lowerIsBetter = true): number | null {
  let best: number | null = null;
  values.forEach((value, i) => {
    if (value === null) return;
    if (best === null || (lowerIsBetter ? value < values[best]! : value > values[best]!)) best = i;
  });
  if (best === null) return null;
  const top = values[best];
  return values.filter((v) => v === top).length > 1 ? null : best;
}

interface Row {
  label: string;
  cells: string[];
  best?: number | null;
  warn?: boolean[];
}

function rows(summaries: SiteSummary[]): Row[] {
  return [
    {
      label: "Nearest line",
      cells: summaries.map((s) => (s.line ? `${s.line.kv} kV, ${mi(s.line.miles)}` : "None loaded")),
    },
    {
      label: "Substation 230 kV+",
      cells: summaries.map((s) =>
        s.substation ? `${s.substation.kv} kV, ${mi(s.substation.miles)}` : "None loaded",
      ),
    },
    {
      label: "Interstate gas",
      cells: summaries.map((s) => mi(s.pipelineMiles)),
      best: bestIndex(summaries.map((s) => s.pipelineMiles ?? null)),
    },
    {
      label: "Queued MW, 50 mi",
      cells: summaries.map((s) =>
        s.backlog ? `${s.backlog.mw.toLocaleString("en-US")}${s.backlog.heavy ? " (heavy)" : ""}` : "—",
      ),
      warn: summaries.map((s) => Boolean(s.backlog?.heavy)),
    },
    {
      label: "Avg congestion",
      cells: summaries.map((s) =>
        s.zone ? `${s.zone.avgMcc >= 0 ? "+" : "−"}${dollars(Math.abs(s.zone.avgMcc))}` : "No zone",
      ),
      best: bestIndex(summaries.map((s) => s.zone?.avgMcc ?? null)),
    },
    {
      label: "Full utility power",
      cells: summaries.map((s) => String(s.paths.ftmFullYear)),
      best: bestIndex(summaries.map((s) => s.paths.ftmFullYear)),
    },
    {
      label: "On-site gas",
      cells: summaries.map((s) => String(s.paths.byopYear)),
      best: bestIndex(summaries.map((s) => s.paths.byopYear)),
    },
    {
      label: "Power gap",
      cells: summaries.map((s) => (s.gapYears ? `${s.gapYears} yr` : "None")),
      warn: summaries.map((s) => s.gapYears > 0),
    },
    {
      label: "Utility $/MWh",
      cells: summaries.map((s) => dollars(s.cost.utility)),
      best: bestIndex(summaries.map((s) => s.cost.utility)),
    },
    {
      label: "Gas $/MWh",
      cells: summaries.map((s) => dollars(s.cost.gas)),
    },
  ];
}

function download(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `miso-site-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ComparePanel({ summaries, inputs, onShow, onRemove }: ComparePanelProps) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  if (summaries.length === 0) return null;

  return (
    <section
      aria-label="Compare sites"
      className="pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950/90 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-zinc-100"
        >
          Compare sites ({summaries.length}/3)
          <svg
            viewBox="0 0 12 12"
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform ${open ? "" : "rotate-180"}`}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <button
            type="button"
            onClick={() => download(summaryCsv(summaries, inputs))}
            className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10 hover:text-zinc-50"
          >
            Download CSV
          </button>
        )}
      </div>

      {open && (
        <div id={panelId}>
          <table className="mt-2 w-full table-fixed text-[11px]">
            <thead>
              <tr>
                <th className="w-32" />
                {summaries.map((s, i) => (
                  <th key={SITE_LABELS[i]} scope="col" className="pb-1 text-left font-normal">
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onShow(i)}
                        title="Show on map"
                        className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 text-[10px] font-bold text-zinc-950"
                      >
                        {SITE_LABELS[i]}
                      </button>
                      <span className="truncate font-mono text-zinc-500">
                        {s.point[1].toFixed(2)}, {s.point[0].toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(i)}
                        aria-label={`Remove site ${SITE_LABELS[i]}`}
                        className="ml-auto px-1 text-zinc-500 hover:text-zinc-50"
                      >
                        ×
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows(summaries).map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <th scope="row" className="py-1 pr-2 text-left font-normal text-zinc-400">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`py-1 ${
                        row.warn?.[i]
                          ? "text-rose-300"
                          : summaries.length > 1 && row.best === i
                            ? "font-semibold text-teal-300"
                            : "text-zinc-100"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
            Each site uses its default years with {inputs.mw || "0"} MW and the shared cost
            inputs. Green marks the best value in a row; red marks a gap or heavy queue.
          </p>
        </div>
      )}
    </section>
  );
}
